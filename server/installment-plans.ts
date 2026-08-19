import type { SqliteDatabase } from "./database";

/**
 * A movement row that continues an instalment plan already billed by an earlier
 * statement.
 *
 * These are the rows that look exactly like duplicates and are not: a fixed
 * instalment repeats its amount every cycle, and the movement file repeats the
 * plan's original purchase date, so account, date, amount and merchant all
 * match the previous cycle's row. What distinguishes them is that the statement
 * itself projected the amount as falling due in this cycle.
 *
 * Matching them serves two purposes: it lets the projection be checked against
 * what actually arrived, and it recovers the instalment counter that the
 * movement file omits.
 */
export interface PlanContinuation {
  transactionId: number;
  accountId: string;
  description: string;
  transactionDate: string;
  amountMinor: number;
  currency: string;
  planPeriod: string;
  installmentCurrent: number;
  installmentTotal: number;
}

/**
 * Instalment plans round across cycles, so consecutive instalments of the same
 * plan can differ by a few centavos. Observed spread is one to four.
 */
const ROUNDING_TOLERANCE_MINOR = 5;

interface ContinuationRow {
  transactionId: number;
  accountId: string;
  description: string;
  transactionDate: string;
  amountMinor: number;
  currency: string;
  planPeriod: string;
  planInstallmentCurrent: number;
  planInstallmentTotal: number;
}

/**
 * Movement rows in `period` that continue a plan billed by an earlier statement.
 *
 * The counter is the matched instalment plus one: the match is taken against the
 * most recent statement strictly before this cycle, and cycles are consecutive.
 * A plan already at its final instalment is not continued.
 */
export function findPlanContinuations(database: SqliteDatabase, period: string): PlanContinuation[] {
  const rows = database
    .prepare<{ period: string; tolerance: number }, ContinuationRow>(
      `SELECT
        movement.id AS transactionId,
        movement.account_id AS accountId,
        movement.description,
        movement.transaction_date AS transactionDate,
        movement.amount_minor AS amountMinor,
        movement.currency,
        plan.statement_period AS planPeriod,
        plan.installment_current AS planInstallmentCurrent,
        plan.installment_total AS planInstallmentTotal
      FROM transactions movement
      INNER JOIN source_records movement_source ON movement_source.id = movement.source_record_id
      INNER JOIN transactions plan
        ON plan.account_id = movement.account_id
       AND plan.currency = movement.currency
       AND plan.transaction_date = movement.transaction_date
       AND plan.description = movement.description
       AND plan.installment_current IS NOT NULL
       AND plan.statement_period < movement.statement_period
       AND ABS(plan.amount_minor - movement.amount_minor) <= :tolerance
      WHERE movement.statement_period = :period
        AND movement_source.source_kind = 'card_movements'
        AND plan.installment_current < plan.installment_total
        AND plan.statement_period = (
          SELECT MAX(latest.statement_period)
          FROM transactions latest
          WHERE latest.account_id = movement.account_id
            AND latest.currency = movement.currency
            AND latest.transaction_date = movement.transaction_date
            AND latest.description = movement.description
            AND latest.installment_current IS NOT NULL
            AND latest.statement_period < movement.statement_period
        )
      ORDER BY movement.amount_minor DESC`,
    )
    .all({ period, tolerance: ROUNDING_TOLERANCE_MINOR });

  return rows.map((row) => ({
    transactionId: row.transactionId,
    accountId: row.accountId,
    description: row.description,
    transactionDate: row.transactionDate,
    amountMinor: row.amountMinor,
    currency: row.currency,
    planPeriod: row.planPeriod,
    installmentCurrent: row.planInstallmentCurrent + 1,
    installmentTotal: row.planInstallmentTotal,
  }));
}

/**
 * Writes the recovered instalment counter onto the movement rows, so the ledger
 * stops needing a cross-reference to be interpretable. Returns how many rows the
 * call changed.
 */
export function applyPlanContinuations(database: SqliteDatabase, period: string): number {
  const continuations = findPlanContinuations(database, period);
  const update = database.prepare<{ id: number; current: number; total: number }, void>(
    `UPDATE transactions
     SET installment_current = @current, installment_total = @total
     WHERE id = @id
       AND (installment_current IS NULL OR installment_current <> @current)`,
  );

  const apply = database.transaction(() => {
    let changed = 0;
    for (const continuation of continuations) {
      const result = update.run({
        id: continuation.transactionId,
        current: continuation.installmentCurrent,
        total: continuation.installmentTotal,
      });
      changed += result.changes;
    }
    return changed;
  });

  return apply();
}

export interface ProjectionCheck {
  accountId: string;
  period: string;
  projectedMinor: number;
  arrivedMinor: number;
  differenceMinor: number;
  continuingCount: number;
  /** False when the cycle has no imported charges to compare against. */
  applicable: boolean;
  agrees: boolean;
}

interface ProjectionRow {
  accountId: string;
  projectedMinor: number;
}

interface ArrivedRow {
  accountId: string;
  arrivedMinor: number;
  continuingCount: number;
}

/**
 * Compares what the previous statement projected for this cycle against the
 * instalments that actually continued into it.
 *
 * Only instalments past the first count. A plan opened during this cycle bills
 * its first instalment here, and the earlier statement could not have known
 * about it, so including those would guarantee a mismatch. Everything at
 * instalment two or beyond is exactly what the projection was describing,
 * whether it reached the ledger through a statement or a movement file.
 *
 * A mismatch beyond rounding means the projection was misparsed or a plan
 * changed, and both deserve a look before the numbers are trusted. The tolerance
 * scales with the number of instalments because each one rounds independently.
 */
export function checkProjectedInstallments(
  database: SqliteDatabase,
  period: string,
): ProjectionCheck[] {
  const projections = database
    .prepare<{ period: string }, ProjectionRow>(
      `SELECT account_id AS accountId, amount_minor AS projectedMinor
       FROM committed_installments
       WHERE due_period = :period
         AND open_ended = 0
         AND statement_period = (
           SELECT MAX(latest.statement_period)
           FROM committed_installments latest
           WHERE latest.account_id = committed_installments.account_id
             AND latest.due_period = :period
             AND latest.statement_period < :period
         )`,
    )
    .all({ period });

  const arrivedRows = database
    .prepare<{ period: string }, ArrivedRow>(
      `SELECT
        account_id AS accountId,
        COALESCE(SUM(amount_minor), 0) AS arrivedMinor,
        COUNT(*) AS continuingCount
      FROM transactions
      WHERE statement_period = :period
        AND transaction_type = 'expense'
        AND installment_current > 1
      GROUP BY account_id`,
    )
    .all({ period });

  const chargedAccounts = new Set(
    database
      .prepare<{ period: string }, { accountId: string }>(
        `SELECT DISTINCT account_id AS accountId
         FROM transactions
         WHERE statement_period = :period AND transaction_type = 'expense'`,
      )
      .all({ period })
      .map((row) => row.accountId),
  );

  return projections.map((projection) => {
    const arrived = arrivedRows.find((row) => row.accountId === projection.accountId);
    const arrivedMinor = arrived?.arrivedMinor ?? 0;
    const continuingCount = arrived?.continuingCount ?? 0;
    const differenceMinor = arrivedMinor - projection.projectedMinor;
    const applicable = chargedAccounts.has(projection.accountId);

    return {
      accountId: projection.accountId,
      period,
      projectedMinor: projection.projectedMinor,
      arrivedMinor,
      differenceMinor,
      continuingCount,
      applicable,
      agrees:
        applicable
        && Math.abs(differenceMinor) <= ROUNDING_TOLERANCE_MINOR * Math.max(continuingCount, 1),
    };
  });
}
