import type { SqliteDatabase } from "./database";
import { projectPayoff } from "./payoff";
import { getSpendingPatterns, summarizeCommittedCost } from "./spending-patterns";

/**
 * What one recurring cost is worth if it stops.
 *
 * Measured by re-running the whole projection without it rather than by dividing
 * the balance by the amount: interest compounds, so removing a cost early is
 * worth more than its face value, and a division would miss that entirely.
 */
export interface PayoffLever {
  leverKey: string;
  label: string;
  categoryId: string;
  perCycleMinor: number;
  cyclesToClear: number | null;
  cyclesSaved: number | null;
  interestSavedMinor: number;
  amountStability: string;
}

export interface LeverSensitivity {
  /** Extra charges per cycle being tested. */
  extraPerCycleMinor: number;
  cyclesToClear: number | null;
  neverClears: boolean;
  extraInterestMinor: number;
}

export interface PayoffLevers {
  baselineCyclesToClear: number | null;
  baselineInterestMinor: number;
  levers: PayoffLever[];
  /** What letting spending drift back up costs, per step. */
  sensitivity: LeverSensitivity[];
}

const SENSITIVITY_STEPS_MINOR = [10_000_00, 25_000_00, 50_000_00, 100_000_00];

export function getPayoffLevers(database: SqliteDatabase, startPeriod: string): PayoffLevers {
  const patterns = getSpendingPatterns(database);
  const committed = summarizeCommittedCost(patterns);
  const baseline = projectPayoff(database, startPeriod, { paymentPolicy: "maximum" });

  /*
   * Only what the projection actually charges each cycle can be a lever. An
   * instalment-driven merchant cannot be switched off — the purchase already
   * happened — and one-off spending is already assumed gone.
   */
  const candidates = patterns.filter(
    (pattern) => pattern.recurrence === "recurring" && pattern.isActive && !pattern.drivenByInstallments,
  );

  const levers: PayoffLever[] = candidates.map((pattern) => {
    const withoutIt = projectPayoff(database, startPeriod, {
      paymentPolicy: "maximum",
      recurringSpendingMinor: Math.max(committed.recurringPerCycleMinor - pattern.typicalPerCycleMinor, 0),
    });

    const cyclesSaved =
      baseline.cyclesToClear === null || withoutIt.cyclesToClear === null
        ? null
        : baseline.cyclesToClear - withoutIt.cyclesToClear;

    return {
      leverKey: pattern.merchantKey,
      label: pattern.merchantKey,
      categoryId: pattern.categoryId,
      perCycleMinor: pattern.typicalPerCycleMinor,
      cyclesToClear: withoutIt.cyclesToClear,
      cyclesSaved,
      interestSavedMinor: baseline.totalFinancingCostMinor - withoutIt.totalFinancingCostMinor,
      amountStability: pattern.amountStability,
    };
  });

  const sensitivity: LeverSensitivity[] = SENSITIVITY_STEPS_MINOR.map((extraPerCycleMinor) => {
    const projection = projectPayoff(database, startPeriod, {
      paymentPolicy: "maximum",
      extraChargesMinor: extraPerCycleMinor,
    });

    return {
      extraPerCycleMinor,
      cyclesToClear: projection.cyclesToClear,
      neverClears: projection.neverClears,
      extraInterestMinor: projection.totalFinancingCostMinor - baseline.totalFinancingCostMinor,
    };
  });

  return {
    baselineCyclesToClear: baseline.cyclesToClear,
    baselineInterestMinor: baseline.totalFinancingCostMinor,
    levers: levers.sort((left, right) => right.interestSavedMinor - left.interestSavedMinor),
    sensitivity,
  };
}
