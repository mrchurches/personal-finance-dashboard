import type { SqliteDatabase } from "./database";

interface CompletenessRow {
  period: string;
  pending: number;
}

/**
 * The cycles whose charges are all in, and can therefore be compared with each other.
 *
 * A cycle is complete when the statement that bills it has closed. The signal is the
 * closing balance: an issuer prints the dates of the next cycle in advance, so a row can
 * exist for a cycle that is still running, but it cannot state a balance for a cycle whose
 * charges have not stopped arriving. A closing balance is therefore the one fact that only
 * a closed statement can supply.
 *
 * This used to be decided by looking for a source record whose kind ended in `_statement`,
 * which asked the wrong question: it tested which file a figure arrived in rather than
 * whether the cycle had closed. On the statement importer the two answers happen to agree.
 * On any other route in they do not, and the failure is silent - the cycle is quietly
 * treated as still running, so it is dropped from every median and every comparison, and a
 * dashboard with months of data reports a typical spend of zero without ever saying why.
 *
 * The distinction matters beyond the arithmetic. An open cycle is missing charges and has
 * not been billed its interest yet; shown next to closed ones it reads as a frugal month,
 * which is the most flattering way to be wrong about your own spending.
 */
export function completeCycles(database: SqliteDatabase): Set<string> {
  const rows = database
    .prepare<[], CompletenessRow>(
      `SELECT period,
              SUM(CASE WHEN closing_balance_minor IS NULL THEN 1 ELSE 0 END) AS pending
       FROM statement_cycles
       GROUP BY period`,
    )
    .all();

  /*
   * Every account has to have closed, not merely one of them. A cycle where one card has
   * settled and another has not is missing charges just as surely as one nobody has closed.
   */
  return new Set(rows.filter((row) => row.pending === 0).map((row) => row.period));
}
