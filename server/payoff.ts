import { getMonthlyBaseline } from "./baseline";
import type { SqliteDatabase } from "./database";
import { FinanceRepository } from "./finance-repository";
import { getFinancingRate } from "./financing";
import { getSpendingPatterns, summarizeCommittedCost } from "./spending-patterns";
import { listCommitments, resolveCommitments } from "./commitments";
import { totalCommittedInstallmentsFor } from "./committed-installments";

/**
 * How much is paid each cycle.
 *
 * `maximum` puts every peso of income against the card, which is what the owner
 * already does. `minimum` pays only what the statement demands, and exists to
 * show the case where that does not even cover the interest. `fixed` answers what
 * a chosen payment would do.
 */
export type PaymentPolicy = "maximum" | "minimum" | "fixed";

export interface PayoffAssumptions {
  incomePerCycleMinor?: number;
  /**
   * Merchants to treat as stopped, for answering what one costs.
   *
   * Preferred over recomputing the floor outside and passing it in: doing that
   * left the caller with a figure that ignored declared commitments, so the
   * lever table and the payoff panel could quietly disagree about the same cycle.
   */
  suppressMerchantKeys?: string[];
  /** Projects the detected floor alone, for showing what the plan is worth. */
  ignoreCommitments?: boolean;
  /**
   * Charges that are not already inside the recurring floor. A cash envelope
   * drawn on the card belongs here only for the part that does not replace
   * spending the floor already counts, otherwise the same groceries are charged
   * twice.
   */
  extraChargesMinor?: number;
  /** Fee on `extraChargesMinor`, in thousandths of a percent. */
  extraChargesFeeMilli?: number;
  effectiveMonthlyRateMilli?: number;
  paymentPolicy?: PaymentPolicy;
  fixedPaymentMinor?: number;
  horizonCycles?: number;
}

export interface PayoffCycle {
  period: string;
  openingMinor: number;
  committedInstallmentsMinor: number;
  newChargesMinor: number;
  /** Part of `newChargesMinor` that comes from declared commitments. */
  declaredCommitmentsMinor: number;
  /** Detected spending those commitments replaced instead of adding to. */
  displacedSpendingMinor: number;
  paymentMinor: number;
  financingCostMinor: number;
  closingMinor: number;
  /** False when the payment does not even cover the interest, so the debt grows. */
  paymentCoversInterest: boolean;
}

export interface PayoffProjection {
  cycles: PayoffCycle[];
  openingBalanceMinor: number;
  effectiveMonthlyRateMilli: number;
  policy: PaymentPolicy;
  clearedInPeriod: string | null;
  cyclesToClear: number | null;
  totalFinancingCostMinor: number;
  totalPaidMinor: number;
  /** True when the balance is still growing at the end of the horizon. */
  neverClears: boolean;
  assumedIncomePerCycleMinor: number;
  /** The detected floor the projection started from, before commitments. */
  assumedRecurringSpendingMinor: number;
  commitmentsApplied: boolean;
}

const DEFAULT_HORIZON_CYCLES = 24;

function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const total = (year ?? 0) * 12 + (month ?? 1);
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

interface MinimumRow {
  minimumPaymentMinor: number | null;
}

/** The statements' own minimum payments, summed across cards. */
function lastKnownMinimumPayment(database: SqliteDatabase): number {
  const rows = database
    .prepare<[], MinimumRow>(
      `SELECT c.minimum_payment_minor AS minimumPaymentMinor
       FROM statement_cycles c
       WHERE c.minimum_payment_minor IS NOT NULL
         AND c.period = (
           SELECT MAX(latest.period) FROM statement_cycles latest
           WHERE latest.account_id = c.account_id AND latest.minimum_payment_minor IS NOT NULL
         )`,
    )
    .all();

  return rows.reduce((total, row) => total + (row.minimumPaymentMinor ?? 0), 0);
}

/**
 * Rolls the debt forward cycle by cycle.
 *
 * Interest is charged on the part of the opening balance left unpaid, not on the
 * cycle's new charges: a purchase is interest-free until its own statement falls
 * due, and charging it immediately would overstate the cost and make the plan
 * look worse than it is. Payment is applied to the opening balance first for the
 * same reason.
 */
export function projectPayoff(
  database: SqliteDatabase,
  startPeriod: string,
  assumptions: PayoffAssumptions = {},
): PayoffProjection {
  const repository = new FinanceRepository(database);
  const baseline = getMonthlyBaseline(database, startPeriod);
  const rate = getFinancingRate(database);

  const openingBalanceMinor = repository
    .getStatementBalances(startPeriod)
    .reduce((total, balance) => total + balance.amountMinor, 0);

  /*
   * Suppressed merchants drop out of the detected floor and out of what a
   * commitment may displace, in one place. Leaving them displaceable would let a
   * substitution take credit for removing spending the lever had already removed.
   */
  const suppressed = new Set(assumptions.suppressMerchantKeys ?? []);
  const patterns = getSpendingPatterns(database).filter(
    (pattern) => !suppressed.has(pattern.merchantKey),
  );
  const detectedRecurringMinor = summarizeCommittedCost(patterns).recurringPerCycleMinor;
  const commitments = assumptions.ignoreCommitments === true ? [] : listCommitments(database);

  const incomePerCycleMinor = assumptions.incomePerCycleMinor ?? baseline.recurringIncomeMinor;
  const recurringSpendingMinor = detectedRecurringMinor;
  const extraChargesMinor = assumptions.extraChargesMinor ?? 0;
  const extraChargesFeeMilli = assumptions.extraChargesFeeMilli ?? 0;
  const effectiveMonthlyRateMilli =
    assumptions.effectiveMonthlyRateMilli
    ?? baseline.effectiveMonthlyRateMilli
    ?? (rate.temMilli === null ? 0 : Math.round(rate.temMilli * rate.taxGrossUp));
  const policy = assumptions.paymentPolicy ?? "maximum";
  const horizon = assumptions.horizonCycles ?? DEFAULT_HORIZON_CYCLES;
  const minimumPaymentMinor = lastKnownMinimumPayment(database);

  const extraWithFee =
    extraChargesMinor + Math.round((extraChargesMinor * extraChargesFeeMilli) / 100 / 1000);

  const cycles: PayoffCycle[] = [];
  let opening = openingBalanceMinor;
  let period = startPeriod;
  let totalFinancingCostMinor = 0;
  let totalPaidMinor = 0;
  let clearedInPeriod: string | null = null;

  for (let index = 0; index < horizon; index += 1) {
    const committedInstallmentsMinor = totalCommittedInstallmentsFor(database, period);

    /*
     * Resolved per cycle rather than once, because a commitment carries the
     * periods it runs between: "the envelope starts next cycle" is only
     * expressible if the floor is allowed to differ from one cycle to the next.
     */
    const declared = resolveCommitments(database, period, patterns, commitments);
    const newChargesMinor =
      recurringSpendingMinor + declared.netMinor + extraWithFee + committedInstallmentsMinor;
    const owed = opening + newChargesMinor;

    let paymentMinor: number;
    if (policy === "minimum") {
      paymentMinor = Math.min(minimumPaymentMinor, owed);
    } else if (policy === "fixed") {
      paymentMinor = Math.min(assumptions.fixedPaymentMinor ?? 0, owed);
    } else {
      paymentMinor = Math.min(incomePerCycleMinor, owed);
    }

    const unpaidOpening = Math.max(opening - paymentMinor, 0);
    const financingCostMinor = Math.round((unpaidOpening * effectiveMonthlyRateMilli) / 100 / 1000);
    const paymentLeftForCharges = Math.max(paymentMinor - opening, 0);
    const unpaidCharges = Math.max(newChargesMinor - paymentLeftForCharges, 0);
    const closingMinor = unpaidOpening + financingCostMinor + unpaidCharges;

    totalFinancingCostMinor += financingCostMinor;
    totalPaidMinor += paymentMinor;

    cycles.push({
      period,
      openingMinor: opening,
      committedInstallmentsMinor,
      newChargesMinor,
      declaredCommitmentsMinor: declared.chargedMinor,
      displacedSpendingMinor: declared.displacedMinor,
      paymentMinor,
      financingCostMinor,
      closingMinor,
      paymentCoversInterest: paymentMinor >= financingCostMinor,
    });

    if (closingMinor === 0 && clearedInPeriod === null) {
      clearedInPeriod = period;
      break;
    }

    opening = closingMinor;
    period = nextPeriod(period);
  }

  const lastCycle = cycles[cycles.length - 1];
  const neverClears =
    clearedInPeriod === null
    && lastCycle !== undefined
    && lastCycle.closingMinor >= lastCycle.openingMinor;

  return {
    cycles,
    openingBalanceMinor,
    effectiveMonthlyRateMilli,
    policy,
    clearedInPeriod,
    cyclesToClear: clearedInPeriod === null ? null : cycles.length,
    totalFinancingCostMinor,
    totalPaidMinor,
    neverClears,
    assumedIncomePerCycleMinor: incomePerCycleMinor,
    assumedRecurringSpendingMinor: recurringSpendingMinor,
    commitmentsApplied: commitments.length > 0,
  };
}
