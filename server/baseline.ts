import type { SqliteDatabase } from "./database";
import { FinanceRepository } from "./finance-repository";
import { getSpendingPatterns, summarizeCommittedCost } from "./spending-patterns";
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
  /** Merchants that come back every cycle, excluding instalment-driven ones. */
  recurringSpendingMinor: number;
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

/**
 * Instalments the statements say fall due in this cycle, taking the most recent
 * statement that spoke about it and ignoring the open-ended tail, which is a
 * per-month rate rather than a single month.
 */
function committedInstallmentsFor(database: SqliteDatabase, period: string): number {
  const rows = database
    .prepare<{ period: string }, AmountRow>(
      `SELECT SUM(amount_minor) AS amountMinor
       FROM committed_installments i
       WHERE i.due_period = :period
         AND i.open_ended = 0
         AND i.statement_period = (
           SELECT MAX(latest.statement_period)
           FROM committed_installments latest
           WHERE latest.account_id = i.account_id AND latest.due_period = :period
         )`,
    )
    .get({ period });

  return rows?.amountMinor ?? 0;
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

export function getMonthlyBaseline(database: SqliteDatabase, period: string): MonthlyBaseline {
  const repository = new FinanceRepository(database);
  const recurringIncomeMinor = repository.getRecurringIncome(period).ARS;

  const committed = summarizeCommittedCost(getSpendingPatterns(database));
  const committedInstallmentsMinor = committedInstallmentsFor(database, period);

  /*
   * Prefer the rate applied to what is actually still owed. Carrying last
   * cycle's charge forward assumes the balance has not moved, which is exactly
   * what a payoff plan is trying to change.
   */
  const rate = getFinancingRate(database);
  const outstanding = repository.getStatementBalances(period)
    .reduce((total, balance) => total + balance.amountMinor, 0);
  const effectiveMonthlyRateMilli =
    rate.temMilli === null ? null : Math.round(rate.temMilli * rate.taxGrossUp);

  const derivedFinancing =
    effectiveMonthlyRateMilli === null || outstanding === 0
      ? null
      : Math.round((outstanding * effectiveMonthlyRateMilli) / 100 / 1000);

  const observedFinancing = lastObservedFinancingCost(database, period);
  const financingCostMinor = derivedFinancing ?? observedFinancing ?? 0;
  const financingBasis: MonthlyBaseline["financingBasis"] =
    derivedFinancing !== null ? "derived-from-balance" : observedFinancing !== null ? "observed" : "unavailable";

  return {
    period,
    recurringIncomeMinor,
    recurringSpendingMinor: committed.recurringPerCycleMinor,
    recurringMerchantCount: committed.recurringMerchantCount,
    committedInstallmentsMinor,
    financingCostMinor,
    availableMinor:
      recurringIncomeMinor
      - committed.recurringPerCycleMinor
      - committedInstallmentsMinor
      - financingCostMinor,
    financingBasis,
    effectiveMonthlyRateMilli,
  };
}
