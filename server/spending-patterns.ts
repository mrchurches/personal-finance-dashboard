import type { SqliteDatabase } from "./database";

/**
 * How reliably a merchant comes back.
 *
 * Measured against the cycles since the merchant first appeared, not against
 * every cycle on record: something that started three cycles ago and has come
 * back every one of them is recurring, and a rule counting six cycles would miss
 * it for another three.
 */
export type Recurrence = "recurring" | "intermittent" | "one-off";

/**
 * How predictable the amount is, reported separately from recurrence on purpose.
 *
 * A subscription and a utility bill are both unavoidable, but one is the same
 * figure every cycle and the other tracks consumption. Collapsing the two into a
 * single "fixed" label would hide exactly the distinction that decides whether
 * an expense is a lever or a constant.
 */
export type AmountStability = "stable" | "variable" | "erratic";

export interface SpendingPattern {
  /**
   * Identity of one cost: a merchant within a category.
   *
   * Not the merchant alone. Once a single charge can be categorised by hand, one
   * merchant can carry two unrelated costs - a monthly debt instalment paid to a
   * person plus the household money paid to the same person - and a single label
   * for both is not merely imprecise, it is wrong in a way that moves money: the
   * whole amount lands under whichever category happened to be read last, and
   * anything that displaces that category then claims to displace the other cost
   * too.
   */
  patternKey: string;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  recurrence: Recurrence;
  amountStability: AmountStability;
  cyclesPresent: number;
  cyclesSpanned: number;
  firstCycle: string;
  lastCycle: string;
  transactionCount: number;
  totalMinor: number;
  averagePerCycleMinor: number;
  typicalPerCycleMinor: number;
  spreadPercent: number;
  /**
   * True when instalment rows drive the pattern. Those commitments are already
   * projected in `committed_installments`, so a monthly baseline that also counts
   * them here would charge for them twice.
   */
  drivenByInstallments: boolean;
  /**
   * Still appearing. Tolerates one missed cycle, because the newest cycle is
   * usually still open: a merchant that bills late in the cycle has not stopped,
   * it just has not billed yet, and treating that as lapsed would quietly drop
   * real commitments out of the baseline.
   */
  isActive: boolean;
}

const MINIMUM_CYCLES_FOR_RECURRENCE = 3;
const MINIMUM_COVERAGE_FOR_RECURRENCE = 0.6;
const STABLE_SPREAD = 0.15;
const VARIABLE_SPREAD = 1;

interface CycleRow {
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  cycle: string;
  totalMinor: number;
  transactionCount: number;
  installmentCount: number;
}

function patternKeyOf(merchantKey: string, categoryId: string): string {
  return `${merchantKey}::${categoryId}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/** Distance between cycles, so coverage can be measured over the right span. */
function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  if (fromYear === undefined || fromMonth === undefined || toYear === undefined || toMonth === undefined) {
    return 0;
  }

  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function classifyRecurrence(cyclesPresent: number, cyclesSpanned: number): Recurrence {
  if (cyclesPresent === 1) {
    return "one-off";
  }

  const coverage = cyclesSpanned === 0 ? 1 : cyclesPresent / cyclesSpanned;
  if (cyclesPresent >= MINIMUM_CYCLES_FOR_RECURRENCE && coverage >= MINIMUM_COVERAGE_FOR_RECURRENCE) {
    return "recurring";
  }

  return "intermittent";
}

function classifyStability(spread: number): AmountStability {
  if (spread <= STABLE_SPREAD) {
    return "stable";
  }

  return spread <= VARIABLE_SPREAD ? "variable" : "erratic";
}

/**
 * Groups spending by merchant across cycles and describes how each one behaves.
 *
 * This is what separates a commitment from a choice. A merchant that returns
 * every cycle is a cost the next cycle will carry whether or not anything
 * changes; one that appeared once is not, however large it was.
 */
export function getSpendingPatterns(database: SqliteDatabase, currency = "ARS"): SpendingPattern[] {
  const rows = database
    .prepare<{ currency: string }, CycleRow>(
      `SELECT
        t.merchant_key AS merchantKey,
        t.category_id AS categoryId,
        c.name AS categoryName,
        COALESCE(t.statement_period, substr(t.transaction_date, 1, 7)) AS cycle,
        SUM(t.amount_minor) AS totalMinor,
        COUNT(*) AS transactionCount,
        SUM(CASE WHEN t.installment_current IS NOT NULL THEN 1 ELSE 0 END) AS installmentCount
      FROM transactions t
      INNER JOIN categories c ON c.id = t.category_id
      WHERE t.transaction_type = 'expense'
        AND t.currency = :currency
        AND t.merchant_key IS NOT NULL
      GROUP BY t.merchant_key, t.category_id, cycle
      ORDER BY t.merchant_key, t.category_id, cycle`,
    )
    .all({ currency });

  const latestCycle = rows.reduce((latest, row) => (row.cycle > latest ? row.cycle : latest), "");
  const ACTIVE_GRACE_CYCLES = 1;

  const byPattern = new Map<string, CycleRow[]>();
  for (const row of rows) {
    const key = patternKeyOf(row.merchantKey, row.categoryId);
    const existing = byPattern.get(key);
    if (existing === undefined) {
      byPattern.set(key, [row]);
      continue;
    }
    existing.push(row);
  }

  const patterns: SpendingPattern[] = [];
  for (const [patternKey, cycleRows] of byPattern) {
    const cycles = cycleRows.map((row) => row.cycle);
    const amounts = cycleRows.map((row) => row.totalMinor);
    const firstCycle = cycles[0] ?? "";
    const lastCycle = cycles[cycles.length - 1] ?? "";
    const cyclesPresent = cycles.length;
    const cyclesSpanned = monthsBetween(firstCycle, lastCycle) + 1;

    const totalMinor = amounts.reduce((sum, amount) => sum + amount, 0);
    const averagePerCycleMinor = Math.round(totalMinor / cyclesPresent);
    const spread =
      averagePerCycleMinor === 0
        ? 0
        : (Math.max(...amounts) - Math.min(...amounts)) / averagePerCycleMinor;

    const last = cycleRows[cycleRows.length - 1];

    patterns.push({
      patternKey,
      merchantKey: last?.merchantKey ?? "",
      categoryId: last?.categoryId ?? "uncategorized",
      categoryName: last?.categoryName ?? "",
      recurrence: classifyRecurrence(cyclesPresent, cyclesSpanned),
      amountStability: classifyStability(spread),
      cyclesPresent,
      cyclesSpanned,
      firstCycle,
      lastCycle,
      transactionCount: cycleRows.reduce((sum, row) => sum + row.transactionCount, 0),
      totalMinor,
      averagePerCycleMinor,
      typicalPerCycleMinor: median(amounts),
      spreadPercent: Math.round(spread * 100),
      drivenByInstallments: cycleRows.some((row) => row.installmentCount > 0),
      isActive: monthsBetween(lastCycle, latestCycle) <= ACTIVE_GRACE_CYCLES,
    });
  }

  return patterns.sort((left, right) => right.averagePerCycleMinor - left.averagePerCycleMinor);
}

export interface CommittedCostSummary {
  /** Recurring, still active, and not already counted as a committed instalment. */
  recurringPerCycleMinor: number;
  recurringMerchantCount: number;
  /** Recurring but no longer appearing, so probably ended. */
  lapsedPerCycleMinor: number;
  /**
   * Spread across every cycle on record, not summed.
   *
   * A merchant that appears in two cycles out of six has a median describing what it
   * costs WHEN it appears, and a merchant that appeared once has a median that is
   * simply that one charge. Adding those medians up produces a figure with no
   * denominator - and the panel puts it beside two genuine per-cycle rates at the
   * same size, so the reader compares three numbers of which one is a multi-cycle
   * total wearing a per-cycle name.
   */
  intermittentPerCycleMinor: number;
  oneOffPerCycleMinor: number;
  installmentDrivenPerCycleMinor: number;
  /** How many cycles the occasional figures were spread over. */
  cyclesOnRecord: number;
}

/**
 * What a cycle costs before any decision is made.
 *
 * Instalment-driven merchants are reported apart rather than folded in, because
 * the committed-instalment calendar already carries them forward and a baseline
 * that adds both would overstate the floor.
 */
export function summarizeCommittedCost(patterns: SpendingPattern[]): CommittedCostSummary {
  /*
   * The record runs from the earliest cycle any pattern was seen in to the latest.
   * Derived from the patterns rather than passed in, so the denominator cannot drift
   * away from the numerators it divides.
   */
  const firstCycles = patterns.map((pattern) => pattern.firstCycle).filter((cycle) => cycle !== "");
  const lastCycles = patterns.map((pattern) => pattern.lastCycle).filter((cycle) => cycle !== "");
  const cyclesOnRecord =
    firstCycles.length === 0 || lastCycles.length === 0
      ? 1
      : Math.max(monthsBetween(firstCycles.sort()[0] ?? "", lastCycles.sort().at(-1) ?? "") + 1, 1);

  const summary: CommittedCostSummary = {
    recurringPerCycleMinor: 0,
    recurringMerchantCount: 0,
    lapsedPerCycleMinor: 0,
    intermittentPerCycleMinor: 0,
    oneOffPerCycleMinor: 0,
    installmentDrivenPerCycleMinor: 0,
    cyclesOnRecord,
  };

  for (const pattern of patterns) {
    if (pattern.drivenByInstallments) {
      summary.installmentDrivenPerCycleMinor += pattern.typicalPerCycleMinor;
      continue;
    }

    if (pattern.recurrence === "recurring") {
      if (pattern.isActive) {
        summary.recurringPerCycleMinor += pattern.typicalPerCycleMinor;
        summary.recurringMerchantCount += 1;
      } else {
        summary.lapsedPerCycleMinor += pattern.typicalPerCycleMinor;
      }
      continue;
    }

    if (pattern.recurrence === "intermittent") {
      summary.intermittentPerCycleMinor += Math.round(pattern.totalMinor / cyclesOnRecord);
      continue;
    }

    summary.oneOffPerCycleMinor += Math.round(pattern.totalMinor / cyclesOnRecord);
  }

  return summary;
}
