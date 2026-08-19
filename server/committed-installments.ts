import type { SqliteDatabase } from "./database";

interface AmountRow {
  amountMinor: number | null;
}

/**
 * Instalments the statements say fall due in one cycle.
 *
 * Each statement reprints the whole forward calendar, so the same instalment
 * appears once per statement that mentions it. Only the most recent statement per
 * account is counted, because a later statement supersedes an earlier one rather
 * than adding to it.
 */
export function committedInstallmentsFor(database: SqliteDatabase, period: string): number {
  const row = database
    .prepare<{ period: string }, AmountRow>(
      `SELECT SUM(amount_minor) AS amountMinor
       FROM committed_installments i
       WHERE i.due_period = :period
         AND i.open_ended = 0
         AND i.statement_period = (
           SELECT MAX(latest.statement_period) FROM committed_installments latest
           WHERE latest.account_id = i.account_id AND latest.due_period = :period
         )`,
    )
    .get({ period });

  return row?.amountMinor ?? 0;
}

/**
 * The per-month tail the statements publish beyond their table, once it starts.
 *
 * Superseded the same way as the dated rows, and for a sharper reason: the tail
 * is not one instalment but a monthly rate that every statement restates. Summing
 * every restatement would multiply the tail by the number of statements imported,
 * so the figure would grow with the size of the archive rather than with the debt.
 */
export function openEndedInstallmentFor(database: SqliteDatabase, period: string): number {
  const row = database
    .prepare<{ period: string }, AmountRow>(
      `SELECT SUM(amount_minor) AS amountMinor
       FROM committed_installments i
       WHERE i.open_ended = 1
         AND i.due_period <= :period
         AND i.statement_period = (
           SELECT MAX(latest.statement_period) FROM committed_installments latest
           WHERE latest.account_id = i.account_id AND latest.open_ended = 1
         )`,
    )
    .get({ period });

  return row?.amountMinor ?? 0;
}

/** Everything a cycle owes from decisions already made, dated rows plus the tail. */
export function totalCommittedInstallmentsFor(database: SqliteDatabase, period: string): number {
  return committedInstallmentsFor(database, period) + openEndedInstallmentFor(database, period);
}
