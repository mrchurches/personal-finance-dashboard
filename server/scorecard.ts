import type { SqliteDatabase } from "./database";
import { getSpendingPatterns } from "./spending-patterns";
import { projectPayoff } from "./payoff";

/**
 * What one closed cycle actually cost, split by whether it was already decided.
 *
 * The projection charges commitments and assumes everything else stops. That is a
 * defensible thing for a plan to assume - it is what a freeze scenario means - but
 * it turns the headline number into a target rather than a forecast, and nothing
 * on screen said so. This is the scoreboard: how much of each cycle was spending
 * the plan does not account for.
 */
export interface CycleScore {
  period: string;
  totalMinor: number;
  /** Merchants that come back every cycle, excluding instalment-driven ones. */
  committedMinor: number;
  /** Instalments of purchases already made. */
  installmentsMinor: number;
  /** Everything else: intermittent, one-off, and merchants that have lapsed. */
  variableMinor: number;
  /** Share of the cycle that was variable, in whole percent. */
  variableSharePercent: number;
  /**
   * False when no statement fed this cycle, so its total is a floor rather than a
   * figure. Reported because an incomplete cycle looks exactly like a frugal one.
   */
  isComplete: boolean;
}

export interface Scorecard {
  cycles: CycleScore[];
  /** Median variable spending across complete cycles only. */
  typicalVariableMinor: number;
  /** Mean across complete cycles, kept beside the median so a skew is visible. */
  averageVariableMinor: number;
  worstVariableMinor: number;
  bestVariableMinor: number;
  /** Cycles to clear if variable spending really stops, which is what the plan assumes. */
  cyclesAtZeroVariable: number | null;
  interestAtZeroVariableMinor: number;
  /** Cycles to clear if variable spending continues at its typical level. */
  cyclesAtTypicalVariable: number | null;
  interestAtTypicalVariableMinor: number;
  neverClearsAtTypicalVariable: boolean;
  /** What the difference between those two scenarios costs, in interest. */
  costOfDriftMinor: number;
}

interface CycleRow {
  patternKey: string;
  cycle: string;
  totalMinor: number;
}

interface CompletenessRow {
  cycle: string;
  statements: number;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function getCycleScorecard(database: SqliteDatabase, startPeriod: string): Scorecard {
  const patterns = getSpendingPatterns(database);

  /*
   * Classified from the same patterns the projection uses, rather than from a
   * second rule of its own. A scoreboard that scored against a different
   * definition of "committed" would be measuring the wrong thing.
   */
  const committedKeys = new Set<string>();
  const installmentKeys = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.drivenByInstallments) {
      installmentKeys.add(pattern.patternKey);
      continue;
    }
    if (pattern.recurrence === "recurring" && pattern.isActive) {
      committedKeys.add(pattern.patternKey);
    }
  }

  const rows = database
    .prepare<[], CycleRow>(
      `SELECT
        t.merchant_key || '::' || t.category_id AS patternKey,
        COALESCE(t.statement_period, substr(t.transaction_date, 1, 7)) AS cycle,
        SUM(t.amount_minor) AS totalMinor
      FROM transactions t
      WHERE t.transaction_type = 'expense'
        AND t.currency = 'ARS'
        AND t.merchant_key IS NOT NULL
      GROUP BY patternKey, cycle
      ORDER BY cycle`,
    )
    .all();

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

  const byCycle = new Map<string, CycleScore>();
  for (const row of rows) {
    const existing = byCycle.get(row.cycle) ?? {
      period: row.cycle,
      totalMinor: 0,
      committedMinor: 0,
      installmentsMinor: 0,
      variableMinor: 0,
      variableSharePercent: 0,
      isComplete: complete.has(row.cycle),
    };

    existing.totalMinor += row.totalMinor;
    if (installmentKeys.has(row.patternKey)) {
      existing.installmentsMinor += row.totalMinor;
    } else if (committedKeys.has(row.patternKey)) {
      existing.committedMinor += row.totalMinor;
    } else {
      existing.variableMinor += row.totalMinor;
    }

    byCycle.set(row.cycle, existing);
  }

  const cycles = [...byCycle.values()].sort((left, right) => left.period.localeCompare(right.period));
  for (const cycle of cycles) {
    cycle.variableSharePercent =
      cycle.totalMinor === 0 ? 0 : Math.round((cycle.variableMinor / cycle.totalMinor) * 100);
  }

  /*
   * Only complete cycles feed the typical figure. An open cycle is missing most of
   * its charges, so including it would drag the median down and flatter the plan
   * at exactly the moment the owner is most likely to be looking.
   */
  const variables = cycles.filter((cycle) => cycle.isComplete).map((cycle) => cycle.variableMinor);
  const typicalVariableMinor = median(variables);

  const atZero = projectPayoff(database, startPeriod, { paymentPolicy: "maximum" });
  const atTypical = projectPayoff(database, startPeriod, {
    paymentPolicy: "maximum",
    extraChargesMinor: typicalVariableMinor,
  });

  return {
    cycles,
    typicalVariableMinor,
    averageVariableMinor:
      variables.length === 0
        ? 0
        : Math.round(variables.reduce((sum, value) => sum + value, 0) / variables.length),
    worstVariableMinor: variables.length === 0 ? 0 : Math.max(...variables),
    bestVariableMinor: variables.length === 0 ? 0 : Math.min(...variables),
    cyclesAtZeroVariable: atZero.cyclesToClear,
    interestAtZeroVariableMinor: atZero.totalFinancingCostMinor,
    cyclesAtTypicalVariable: atTypical.cyclesToClear,
    interestAtTypicalVariableMinor: atTypical.totalFinancingCostMinor,
    neverClearsAtTypicalVariable: atTypical.neverClears,
    costOfDriftMinor: atTypical.totalFinancingCostMinor - atZero.totalFinancingCostMinor,
  };
}
