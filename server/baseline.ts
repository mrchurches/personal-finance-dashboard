import type { SqliteDatabase } from "./database";
import { FinanceRepository } from "./finance-repository";
import { getSpendingPatterns, summarizeCommittedCost } from "./spending-patterns";
import { resolveCommitments } from "./commitments";
import { totalCommittedInstallmentsFor } from "./committed-installments";
import { getFinancingRate } from "./financing";

/**
 * What a cycle has left once everything already decided is paid for.
 *
 * Built only from commitments, never from an average of past spending: an
 * average of cycles that overspent simply predicts overspending. Each term is
 * something that will happen again unless something changes.
 */
export interface MonthlyBaseline {
  period: string;
  recurringIncomeMinor: number;
  /** Detected plus declared: what the cycle is actually expected to be charged. */
  recurringSpendingMinor: number;
  /** Merchants that come back every cycle, excluding instalment-driven ones. */
  detectedRecurringSpendingMinor: number;
  /**
   * Charged by commitments the owner declared, which the detector cannot see.
   * Reported apart from the detected floor rather than folded into it, because a
   * stated figure and a measured one carry different weight and the difference
   * belongs on screen.
   */
  declaredCommitmentsMinor: number;
  /** Detected spending those commitments take the place of instead of adding to. */
  displacedSpendingMinor: number;
  recurringMerchantCount: number;
  /** What the statements themselves project as falling due in this cycle. */
  committedInstallmentsMinor: number;
  financingCostMinor: number;
  /** Income minus every commitment above. Negative means the floor exceeds income. */
  availableMinor: number;
  /**
   * Where the financing figure came from. A rate applied to the balance still
   * outstanding is a stronger claim than a figure carried from the last closed
   * cycle, and the difference belongs on screen rather than inside a formula.
   */
  financingBasis: "derived-from-balance" | "observed" | "unavailable";
  /** Effective monthly cost of carrying a balance, thousandths of a percent. */
  effectiveMonthlyRateMilli: number | null;
}

interface AmountRow {
  amountMinor: number;
}

/** Financing cost of the most recent cycle that actually reported one. */
function lastObservedFinancingCost(database: SqliteDatabase, period: string): number | null {
  const row = database
    .prepare<{ period: string }, AmountRow>(
      `SELECT SUM(amount_minor) AS amountMinor
       FROM source_records
       WHERE record_kind = 'financial_cost'
         AND statement_period = (
           SELECT MAX(statement_period) FROM source_records
           WHERE record_kind = 'financial_cost' AND statement_period <= :period
         )`,
    )
    .get({ period });

  return row?.amountMinor ?? null;
}

/**
 * The balance to charge interest on, when the caller knows it better than the
 * statements do.
 *
 * For a cycle that has closed, the statement is the truth. For a projected cycle
 * there is no statement, and the lookup falls back to the most recent one - so every
 * future row was charged the same interest on the same frozen balance, which reads as
 * a debt that never shrinks while the projection beside it shows the debt retiring.
 * The caller that projects a series passes each cycle's own opening balance instead.
 */
export function getMonthlyBaseline(
  database: SqliteDatabase,
  period: string,
  outstandingOverrideMinor?: number,
): MonthlyBaseline {
  const repository = new FinanceRepository(database);
  const recurringIncomeMinor = repository.getRecurringIncome(period).ARS;

  const patterns = getSpendingPatterns(database);
  const committed = summarizeCommittedCost(patterns);
  const commitments = resolveCommitments(database, period, patterns);
  /*
   * The same helper the payoff projection uses, tail included. Each kept its own
   * copy of this query before, and the copies had drifted: the baseline reported
   * nothing for cycles where the projection was already charging the open-ended
   * tail, so two panels described the same cycle differently.
   */
  const committedInstallmentsMinor = totalCommittedInstallmentsFor(database, period);

  /*
   * Cannot go negative: displacement only ever removes merchants the detected
   * floor already counted, so the sum is at least what the commitments charge.
   */
  const recurringSpendingMinor = committed.recurringPerCycleMinor + commitments.netMinor;

  /*
   * Prefer the rate applied to what is actually still owed. Carrying last
   * cycle's charge forward assumes the balance has not moved, which is exactly
   * what a payoff plan is trying to change.
   */
  const rate = getFinancingRate(database);
  /*
   * A balance the caller states is different from a balance nobody found. Both can be
   * zero, and they mean opposite things: a stated zero is a debt that has been paid,
   * while a looked-up zero is a cycle with no statement yet. Only the second may fall
   * back to what was last observed - the first fell through to a historical charge and
   * put interest on a debt the projection had already retired.
   */
  const isStated = outstandingOverrideMinor !== undefined;
  const outstanding = isStated
    ? outstandingOverrideMinor
    : repository.getStatementBalances(period).reduce((total, balance) => total + balance.amountMinor, 0);
  const effectiveMonthlyRateMilli =
    rate.temMilli === null ? null : Math.round(rate.temMilli * rate.taxGrossUp);

  const derivedFinancing =
    effectiveMonthlyRateMilli === null || (outstanding === 0 && !isStated)
      ? null
      : Math.round((outstanding * effectiveMonthlyRateMilli) / 100 / 1000);

  const observedFinancing = lastObservedFinancingCost(database, period);
  const financingCostMinor = derivedFinancing ?? observedFinancing ?? 0;
  const financingBasis: MonthlyBaseline["financingBasis"] =
    derivedFinancing !== null ? "derived-from-balance" : observedFinancing !== null ? "observed" : "unavailable";

  return {
    period,
    recurringIncomeMinor,
    recurringSpendingMinor,
    detectedRecurringSpendingMinor: committed.recurringPerCycleMinor,
    declaredCommitmentsMinor: commitments.chargedMinor,
    displacedSpendingMinor: commitments.displacedMinor,
    recurringMerchantCount: committed.recurringMerchantCount,
    committedInstallmentsMinor,
    financingCostMinor,
    availableMinor:
      recurringIncomeMinor
      - recurringSpendingMinor
      - committedInstallmentsMinor
      - financingCostMinor,
    financingBasis,
    effectiveMonthlyRateMilli,
  };
}
