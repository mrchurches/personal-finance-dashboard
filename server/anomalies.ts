import type { SqliteDatabase } from "./database";
import { getSpendingPatterns } from "./spending-patterns";

/**
 * Why one cycle of a recurring cost does not look like the others.
 *
 * `catch-up` is the one worth naming first, because it is indistinguishable from a
 * price rise if you only look at the amount. A cycle that was not paid and then
 * billed together with the next one arrives as roughly double, and the median
 * absorbs it - which is correct, and is exactly why nobody notices that the median
 * is now describing a payment pattern rather than a price.
 *
 * `step-up` is the opposite mistake and the more expensive one: the amount rose and
 * stayed risen, so the median is lagging behind the real cost and the projection is
 * charging too little. That is the case where the median needs overriding.
 *
 * `spike` is a single high cycle that came back down, with nothing missing before
 * it. The median is right and nothing needs doing; it is reported so that the other
 * two are not the only explanations on offer.
 */
export type CycleAnomalyKind = "catch-up" | "step-up" | "step-down" | "spike";

export interface CycleAnomaly {
  patternKey: string;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  /** The cycle that does not fit. */
  period: string;
  amountMinor: number;
  /** What the projection charges for this cost every cycle. */
  typicalMinor: number;
  /** The odd cycle as a percentage of the typical one. */
  ratioPercent: number;
  kind: CycleAnomalyKind;
  /** The cycle immediately before, when it had no charge at all. */
  missingBefore: string | null;
  /**
   * How much the projection is charging too little, per cycle, if this is a step
   * that has held. Zero for anything the median already describes correctly.
   */
  understatedByMinor: number;
  /**
   * How the odd cycle was made up, which is what distinguishes two readings of the
   * same total. Two months billed as two separate charges shows the current price in
   * the largest of them; two months settled in one transfer does not show it at all.
   */
  chargeCount: number;
  largestChargeMinor: number;
}

interface SeriesRow {
  patternKey: string;
  cycle: string;
  totalMinor: number;
  chargeCount: number;
  largestChargeMinor: number;
}

interface CompletenessRow {
  cycle: string;
  statements: number;
}

/*
 * A two-month catch-up lands at about twice the standing amount; an ordinary price
 * rise is a few percent. These thresholds sit in the empty space between those two,
 * so the test fires on the shape it is looking for and stays quiet on normal
 * variation. They are not tuned to any particular merchant.
 */
const HIGH_RATIO = 1.6;
const LOW_RATIO = 0.6;
/** A step has to hold: a later cycle at least this far above typical confirms it. */
const HELD_RATIO = 1.25;

function previousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const total = (year ?? 0) * 12 + (month ?? 1) - 2;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function getCycleAnomalies(database: SqliteDatabase): CycleAnomaly[] {
  const patterns = getSpendingPatterns(database).filter(
    (pattern) => pattern.recurrence === "recurring" && !pattern.drivenByInstallments,
  );
  if (patterns.length === 0) {
    return [];
  }

  const series = database
    .prepare<[], SeriesRow>(
      `SELECT
        t.merchant_key || '::' || t.category_id AS patternKey,
        COALESCE(t.statement_period, substr(t.transaction_date, 1, 7)) AS cycle,
        SUM(t.amount_minor) AS totalMinor,
        COUNT(*) AS chargeCount,
        MAX(t.amount_minor) AS largestChargeMinor
      FROM transactions t
      WHERE t.transaction_type = 'expense'
        AND t.currency = 'ARS'
        AND t.merchant_key IS NOT NULL
      GROUP BY patternKey, cycle`,
    )
    .all();

  const byPattern = new Map<string, Map<string, SeriesRow>>();
  for (const row of series) {
    const cycles = byPattern.get(row.patternKey) ?? new Map<string, SeriesRow>();
    cycles.set(row.cycle, row);
    byPattern.set(row.patternKey, cycles);
  }

  const completeness = database
    .prepare<[], CompletenessRow>(
      `SELECT statement_period AS cycle,
              SUM(CASE WHEN source_kind LIKE '%_statement' THEN 1 ELSE 0 END) AS statements
       FROM source_records
       GROUP BY statement_period`,
    )
    .all();
  const complete = new Set(
    completeness.filter((row) => row.statements > 0).map((row) => row.cycle),
  );

  const anomalies: CycleAnomaly[] = [];
  for (const pattern of patterns) {
    const cycles = byPattern.get(pattern.patternKey);
    if (cycles === undefined || pattern.typicalPerCycleMinor === 0) {
      continue;
    }

    const present = [...cycles.keys()].sort();
    const first = present[0];
    if (first === undefined) {
      continue;
    }

    const ratioOf = (candidate: string): number =>
      (cycles.get(candidate)?.totalMinor ?? 0) / pattern.typicalPerCycleMinor;

    for (const period of present) {
      const row = cycles.get(period);
      const amountMinor = row?.totalMinor ?? 0;
      const ratio = amountMinor / pattern.typicalPerCycleMinor;

      /*
       * A low cycle in an incomplete one is not a low cycle, it is a cycle whose
       * charges have not all arrived. A HIGH cycle in an incomplete one is real,
       * though: a charge that is there is there, whatever else is missing. So
       * completeness gates only the downward tests.
       */
      const isComplete = complete.has(period);

      if (ratio >= HIGH_RATIO) {
        const before = previousPeriod(period);
        const hasGapBefore = period !== first && !cycles.has(before);

        const later = present.filter((candidate) => candidate > period);
        const held = later.length > 0 && later.every((candidate) => ratioOf(candidate) >= HELD_RATIO);

        const kind: CycleAnomalyKind = hasGapBefore ? "catch-up" : held ? "step-up" : "spike";

        /*
         * Only a step that has held means the projection is short. A catch-up is a
         * payment pattern rather than a price, and a spike came back down on its own.
         */
        const understatedByMinor =
          kind === "step-up" ? Math.max(amountMinor - pattern.typicalPerCycleMinor, 0) : 0;

        anomalies.push({
          patternKey: pattern.patternKey,
          merchantKey: pattern.merchantKey,
          categoryId: pattern.categoryId,
          categoryName: pattern.categoryName,
          period,
          amountMinor,
          typicalMinor: pattern.typicalPerCycleMinor,
          ratioPercent: Math.round(ratio * 100),
          kind,
          missingBefore: hasGapBefore ? before : null,
          understatedByMinor,
          chargeCount: row?.chargeCount ?? 0,
          largestChargeMinor: row?.largestChargeMinor ?? 0,
        });
        continue;
      }

      if (ratio <= LOW_RATIO && isComplete && period !== first) {
        /*
         * A step down needs positive evidence, not merely the absence of a
         * contradiction. Treating an incomplete later cycle as "does not disagree"
         * flagged a cost that had in fact gone back up, because the only cycle after
         * it was still open. So a later cycle disagrees whenever its amount is not
         * low, complete or not, and confirming the step requires at least one
         * complete later cycle that is also low.
         */
        const later = present.filter((candidate) => candidate > period);
        const stayedLow =
          later.every((candidate) => ratioOf(candidate) <= LOW_RATIO)
          && later.some((candidate) => complete.has(candidate) && ratioOf(candidate) <= LOW_RATIO);

        if (stayedLow) {
          anomalies.push({
            patternKey: pattern.patternKey,
            merchantKey: pattern.merchantKey,
            categoryId: pattern.categoryId,
            categoryName: pattern.categoryName,
            period,
            amountMinor,
            typicalMinor: pattern.typicalPerCycleMinor,
            ratioPercent: Math.round(ratio * 100),
            kind: "step-down",
            missingBefore: null,
            understatedByMinor: 0,
            chargeCount: row?.chargeCount ?? 0,
            largestChargeMinor: row?.largestChargeMinor ?? 0,
          });
        }
      }
    }

    /*
     * A gap at the end is not a gap, it is a cost that may have stopped. That is
     * what the recurrence grace already reports through `isActive`, so it is left
     * alone here rather than reported twice under a second name.
     */
  }

  /* Loudest first, and within a kind the largest understatement first. */
  const order: Record<CycleAnomalyKind, number> = {
    "step-up": 0,
    "catch-up": 1,
    "step-down": 2,
    spike: 3,
  };
  return anomalies.sort(
    (left, right) =>
      order[left.kind] - order[right.kind]
      || right.understatedByMinor - left.understatedByMinor
      || right.ratioPercent - left.ratioPercent,
  );
}
