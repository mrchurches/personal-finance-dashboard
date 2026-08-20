import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { normalizeMerchant } from "../shared/merchants";
import { parseAmountToMinor } from "../shared/money";
import {
  RECONCILIATION_STATE,
  RECORD_KIND,
  SOURCE_KIND,
  type Currency,
  type RecordKind,
  type SignedStatus,
} from "../shared/types";
import type { SqliteDatabase } from "./database";
import { importSourceRecords, type ImportResult, type SourceImportRow } from "./importer";

/**
 * A documented import format, so a statement this project cannot parse can still be used.
 *
 * Deliberately not a column mapper. A mapper looks at somebody's export and guesses which
 * field is an instalment counter, which is exactly the class of mistake that produces
 * confident wrong numbers - this project already found one, where a bare month and year in
 * a statement was read as instalment seven of twenty-six. So the format demands rather than
 * guesses: the person exporting decides what each column means, and the importer refuses
 * anything it cannot read exactly.
 *
 * Two files, because the projection needs both and only one of them is obvious. The charges
 * say where the money went. The cycles say what the card is charging for carrying it, and
 * without them there is a spending report but no payoff.
 */

/** How a row participates in the totals. The word chosen by the person, not inferred. */
const CSV_KINDS: Record<string, { recordKind: RecordKind; signedStatus: SignedStatus }> = {
  /* Money spent. The only kind that becomes an ordinary expense. */
  charge: { recordKind: RECORD_KIND.CARD_CHARGE, signedStatus: "positive" },
  /* Money paid towards the card. Never an expense: it settles charges already counted. */
  payment: { recordKind: RECORD_KIND.PAYMENT, signedStatus: "negative" },
  /* Interest and card fees. Reported apart so spending and the cost of carrying it stay separable. */
  financing_cost: { recordKind: RECORD_KIND.FINANCIAL_COST, signedStatus: "positive" },
  /* Money coming back. Not negative spending: it reverses a charge. */
  refund: { recordKind: RECORD_KIND.REFUND, signedStatus: "negative" },
  rejected: { recordKind: RECORD_KIND.REJECTED, signedStatus: "positive" },
  returned: { recordKind: RECORD_KIND.RETURNED, signedStatus: "negative" },
  /* Spent, but never on the card. Counted against income and not against the statement. */
  cash: { recordKind: RECORD_KIND.CASH_OUTFLOW, signedStatus: "positive" },
};

export const CSV_KIND_NAMES = Object.keys(CSV_KINDS);

const CHARGE_COLUMNS = [
  "date",
  "description",
  "amount",
  "currency",
  "account",
  "cycle",
  "kind",
  "installment",
] as const;

const INCOME_COLUMNS = [
  "name",
  "amount",
  "currency",
  "effective_from",
] as const;

const CYCLE_COLUMNS = [
  "account",
  "cycle",
  "opened_on",
  "closed_on",
  "due_on",
  "closing_balance",
  "minimum_payment",
  "monthly_rate",
] as const;

const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const CYCLE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const INSTALLMENT_PATTERN = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;

/**
 * An account as the file names it, and what it turned out to be.
 *
 * The kind is inferred rather than asked for. The file already says it: an account that
 * only ever holds cash movements is a wallet, and one that holds a card charge is a card.
 * Asking for a column the rows already answer is a way of getting it wrong twice - once in
 * the column, once in the rows - with no way to tell which was meant.
 *
 * A cash advance taken against a card is therefore still a card, which is correct: the
 * money came out of a credit line and is billed like any other charge.
 */
export interface CsvAccount {
  name: string;
  kind: "card" | "cash";
}

/**
 * A recurring income, stated as a rule rather than as rows.
 *
 * The projection has to ask what a month that has not happened yet will pay, and no list of
 * past deposits can answer that. This is also the one part of the format nobody has in a
 * file already: a salary does not arrive as a downloadable statement line, it is something
 * the owner knows. Without it every projection reports that the debt never clears, which is
 * arithmetically true of an income of zero and useless as advice.
 */
export interface CsvIncomeRow {
  name: string;
  amountMinor: number;
  currency: Currency;
  frequency: "monthly";
  /** The Argentine half-salary paid in June and December. */
  statutoryBonus: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CsvCharges {
  rows: SourceImportRow[];
  accounts: Map<string, CsvAccount>;
}

export class CsvImportError extends Error {}

function fail(line: number, message: string): never {
  throw new CsvImportError(`line ${line}: ${message}`);
}

/**
 * Splits one line, honouring double quotes so a description may contain a comma.
 *
 * Written out rather than pulled in: the format is deliberately small, and a dependency
 * that silently accepts a malformed line would undo the point of refusing to guess.
 */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function readTable(text: string, required: readonly string[], what: string): Map<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new CsvImportError(`The ${what} file is empty.`);
  }

  const header = splitRow(headerLine).map((cell) => cell.toLowerCase());
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new CsvImportError(
      `The ${what} file is missing these columns: ${missing.join(", ")}. Expected: ${required.join(", ")}.`,
    );
  }

  return lines.slice(1).map((line, index) => {
    const cells = splitRow(line);
    if (cells.length !== header.length) {
      fail(index + 2, `expected ${header.length} columns and found ${cells.length}.`);
    }

    const row = new Map<string, string>();
    header.forEach((column, position) => row.set(column, cells[position] ?? ""));
    return row;
  });
}

function requireCell(row: Map<string, string>, column: string, line: number): string {
  const value = row.get(column) ?? "";
  if (value.length === 0) {
    fail(line, `${column} is required.`);
  }

  return value;
}

function readCurrency(value: string, line: number): Currency {
  if (value !== "ARS" && value !== "USD") {
    fail(line, `currency must be ARS or USD, and was "${value}".`);
  }

  return value;
}

function readAmount(value: string, column: string, line: number): number {
  try {
    return parseAmountToMinor(value, "ARS");
  } catch {
    fail(line, `${column} must be a positive number with at most two decimals, and was "${value}".`);
  }
}

/** A stable identifier for an account named freely in the file. */
function accountIdFor(name: string): string {
  return normalizeMerchant(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || "account";
}

export interface CsvCycleRow {
  accountId: string;
  accountName: string;
  cycle: string;
  openedOn: string;
  closedOn: string;
  dueOn: string;
  closingBalanceMinor: number;
  /**
   * An Argentine card settles pesos and dollars as two separate balances on one statement.
   * Absent from the file it is zero, which is the common case and also the only safe
   * default: a balance that is not stated has not been shown to exist.
   */
  closingBalanceUsdMinor: number;
  minimumPaymentMinor: number | null;
  monthlyRateMilli: number | null;
}

export function parseChargesCsv(text: string, filePath: string): CsvCharges {
  const fileName = basename(filePath);
  const rows = readTable(text, CHARGE_COLUMNS, "charges");
  const accounts = new Map<string, CsvAccount>();

  const parsed = rows.map((row, index) => {
    const line = index + 2;
    const date = requireCell(row, "date", line);
    if (!DATE_PATTERN.test(date)) {
      fail(line, `date must be written YYYY-MM-DD, and was "${date}".`);
    }

    const cycleCell = row.get("cycle") ?? "";
    const cycle = cycleCell.length === 0 ? date.slice(0, 7) : cycleCell;
    if (!CYCLE_PATTERN.test(cycle)) {
      fail(line, `cycle must be written YYYY-MM, and was "${cycleCell}".`);
    }

    const kindCell = requireCell(row, "kind", line);
    const kind = CSV_KINDS[kindCell];
    if (kind === undefined) {
      fail(line, `kind must be one of ${CSV_KIND_NAMES.join(", ")}, and was "${kindCell}".`);
    }

    const installmentCell = row.get("installment") ?? "";
    let installmentCurrent: number | null = null;
    let installmentTotal: number | null = null;
    if (installmentCell.length > 0) {
      const match = INSTALLMENT_PATTERN.exec(installmentCell);
      const current = Number(match?.[1] ?? Number.NaN);
      const total = Number(match?.[2] ?? Number.NaN);
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(total) || current < 1 || total < current) {
        fail(line, `installment must be written like 3/6, and was "${installmentCell}".`);
      }
      installmentCurrent = current;
      installmentTotal = total;
    }

    const accountName = requireCell(row, "account", line);
    const accountId = accountIdFor(accountName);
    const description = requireCell(row, "description", line);
    const currency = readCurrency(requireCell(row, "currency", line), line);

    /*
     * The display name is the one the file wrote. The slug is what the rest of the system
     * joins on, and showing it back to someone who typed a real name is a small betrayal:
     * they never chose it and cannot change it.
     */
    const seen = accounts.get(accountId);
    if (seen === undefined) {
      accounts.set(accountId, {
        name: accountName,
        kind: kind.recordKind === RECORD_KIND.CASH_OUTFLOW ? "cash" : "card",
      });
    } else if (kind.recordKind !== RECORD_KIND.CASH_OUTFLOW) {
      seen.kind = "card";
    }

    /*
     * The locator is the line the row came from. It is what makes re-importing the same
     * file idempotent without deduplicating by description - two identical charges on one
     * day are a real thing, and collapsing them would silently lose money.
     */
    return {
      sourceId: `${SOURCE_KIND.CSV}:${cycle}:${fileName}#${line}:${currency}`,
      importKey: `${SOURCE_KIND.CSV}:${cycle}:${fileName}#${line}:${currency}`,
      sourceFilePath: filePath,
      sourceKind: SOURCE_KIND.CSV,
      statementPeriod: cycle,
      sourceLocator: `${fileName}#${line}`,
      transactionDate: date,
      section: kindCell,
      description,
      accountId,
      fundingMethod: null,
      signedStatus: kind.signedStatus,
      currency,
      amountMinor: readAmount(requireCell(row, "amount", line), "amount", line),
      recordKind: kind.recordKind,
      status: kindCell === "rejected" ? "rejected" : kindCell === "returned" ? "returned" : "approved",
      installmentCurrent,
      installmentTotal,
      reconciliationState:
        kind.recordKind === RECORD_KIND.CARD_CHARGE || kind.recordKind === RECORD_KIND.CASH_OUTFLOW
          ? RECONCILIATION_STATE.AUTHORITATIVE
          : RECONCILIATION_STATE.NOT_APPLICABLE,
    } satisfies SourceImportRow;
  });

  return { rows: parsed, accounts };
}

export function parseCyclesCsv(text: string): CsvCycleRow[] {
  const rows = readTable(text, CYCLE_COLUMNS, "cycles");

  return rows.map((row, index) => {
    const line = index + 2;
    const cycle = requireCell(row, "cycle", line);
    if (!CYCLE_PATTERN.test(cycle)) {
      fail(line, `cycle must be written YYYY-MM, and was "${cycle}".`);
    }

    for (const column of ["opened_on", "closed_on", "due_on"]) {
      const value = requireCell(row, column, line);
      if (!DATE_PATTERN.test(value)) {
        fail(line, `${column} must be written YYYY-MM-DD, and was "${value}".`);
      }
    }

    const minimumCell = row.get("minimum_payment") ?? "";
    const rateCell = row.get("monthly_rate") ?? "";
    const usdCell = row.get("closing_balance_usd") ?? "";
    const accountName = requireCell(row, "account", line);

    return {
      accountId: accountIdFor(accountName),
      accountName,
      cycle,
      openedOn: requireCell(row, "opened_on", line),
      closedOn: requireCell(row, "closed_on", line),
      dueOn: requireCell(row, "due_on", line),
      closingBalanceMinor: readAmount(requireCell(row, "closing_balance", line), "closing_balance", line),
      closingBalanceUsdMinor:
        usdCell.length === 0 ? 0 : readAmount(usdCell, "closing_balance_usd", line),
      minimumPaymentMinor:
        minimumCell.length === 0 ? null : readAmount(minimumCell, "minimum_payment", line),
      /*
       * A percent per month, stored in thousandths of a percent like every other rate here.
       * State the rate the card actually charges, taxes included, since that is what a
       * balance costs to carry - a published rate that excludes them understates it.
       */
      monthlyRateMilli:
        rateCell.length === 0 ? null : Math.round(Number(rateCell.replace(",", ".")) * 1000),
    };
  });
}

const TRUTHY = new Set(["yes", "y", "true", "1", "si", "s"]);
const FALSY = new Set(["", "no", "n", "false", "0"]);

export function parseIncomeCsv(text: string): CsvIncomeRow[] {
  const rows = readTable(text, INCOME_COLUMNS, "income");

  return rows.map((row, index) => {
    const line = index + 2;
    const effectiveFrom = requireCell(row, "effective_from", line);
    if (!CYCLE_PATTERN.test(effectiveFrom)) {
      fail(line, `effective_from must be written YYYY-MM, and was "${effectiveFrom}".`);
    }

    const untilCell = row.get("effective_to") ?? "";
    if (untilCell.length > 0 && !CYCLE_PATTERN.test(untilCell)) {
      fail(line, `effective_to must be written YYYY-MM or left empty, and was "${untilCell}".`);
    }
    if (untilCell.length > 0 && untilCell < effectiveFrom) {
      fail(line, `effective_to (${untilCell}) is before effective_from (${effectiveFrom}).`);
    }

    const frequencyCell = (row.get("frequency") ?? "").toLowerCase();
    if (frequencyCell.length > 0 && frequencyCell !== "monthly") {
      fail(line, `frequency must be monthly, and was "${frequencyCell}".`);
    }

    const bonusCell = (row.get("statutory_bonus") ?? "").toLowerCase();
    if (!TRUTHY.has(bonusCell) && !FALSY.has(bonusCell)) {
      fail(line, `statutory_bonus must be yes or no, and was "${bonusCell}".`);
    }

    const amountMinor = readAmount(requireCell(row, "amount", line), "amount", line);
    if (amountMinor <= 0) {
      fail(line, "amount must be greater than zero.");
    }

    return {
      name: requireCell(row, "name", line),
      amountMinor,
      currency: readCurrency(requireCell(row, "currency", line), line),
      frequency: "monthly",
      statutoryBonus: TRUTHY.has(bonusCell),
      effectiveFrom,
      effectiveTo: untilCell.length === 0 ? null : untilCell,
    } satisfies CsvIncomeRow;
  });
}

/**
 * An income file is a statement of what is true, not a log of events, so re-importing a
 * corrected one has to correct rather than accumulate. The identity is the name together
 * with the month it starts: that is what makes a raise a second row rather than an edit of
 * the first, and it is why the old row keeps paying for the months before it.
 */
function persistIncome(database: SqliteDatabase, sources: CsvIncomeRow[]): number {
  const remove = database.prepare<{ name: string; effectiveFrom: string }, void>(
    "DELETE FROM income_sources WHERE name = @name AND effective_from = @effectiveFrom",
  );
  const insert = database.prepare<
    {
      name: string;
      amountMinor: number;
      currency: string;
      frequency: string;
      statutoryBonus: number;
      effectiveFrom: string;
      effectiveTo: string | null;
    },
    void
  >(
    `INSERT INTO income_sources
      (name, amount_minor, currency, frequency, statutory_bonus, effective_from, effective_to)
     VALUES (@name, @amountMinor, @currency, @frequency, @statutoryBonus, @effectiveFrom, @effectiveTo)`,
  );

  const run = database.transaction(() => {
    for (const source of sources) {
      remove.run({ name: source.name, effectiveFrom: source.effectiveFrom });
      insert.run({
        name: source.name,
        amountMinor: source.amountMinor,
        currency: source.currency,
        frequency: source.frequency,
        statutoryBonus: source.statutoryBonus ? 1 : 0,
        effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo,
      });
    }

    return sources.length;
  });

  return run();
}

function ensureAccounts(database: SqliteDatabase, accounts: Map<string, CsvAccount>): void {
  const insert = database.prepare<{ id: string; name: string; kind: string }, void>(
    `INSERT INTO accounts (id, name, kind) VALUES (@id, @name, @kind)
     ON CONFLICT (id) DO NOTHING`,
  );

  for (const [id, account] of accounts) {
    insert.run({ id, name: account.name, kind: account.kind });
  }
}

function persistCycles(database: SqliteDatabase, cycles: CsvCycleRow[]): number {
  const upsert = database.prepare<
    {
      accountId: string;
      period: string;
      openedOn: string;
      closedOn: string;
      dueOn: string;
      closingBalanceMinor: number;
      closingBalanceUsdMinor: number;
      minimumPaymentMinor: number | null;
      temMilli: number | null;
    },
    void
  >(
    `INSERT INTO statement_cycles
      (account_id, period, opened_on, closed_on, due_on, closing_balance_minor,
       closing_balance_usd_minor, minimum_payment_minor, tem_pesos_milli, source)
     VALUES (@accountId, @period, @openedOn, @closedOn, @dueOn, @closingBalanceMinor,
       @closingBalanceUsdMinor, @minimumPaymentMinor, @temMilli, 'imported')
     ON CONFLICT (account_id, period) DO UPDATE SET
       opened_on = excluded.opened_on,
       closed_on = excluded.closed_on,
       due_on = excluded.due_on,
       closing_balance_minor = excluded.closing_balance_minor,
       closing_balance_usd_minor = excluded.closing_balance_usd_minor,
       minimum_payment_minor = COALESCE(excluded.minimum_payment_minor, statement_cycles.minimum_payment_minor),
       tem_pesos_milli = COALESCE(excluded.tem_pesos_milli, statement_cycles.tem_pesos_milli)`,
  );

  const run = database.transaction(() => {
    for (const cycle of cycles) {
      upsert.run({
        accountId: cycle.accountId,
        period: cycle.cycle,
        openedOn: cycle.openedOn,
        closedOn: cycle.closedOn,
        dueOn: cycle.dueOn,
        closingBalanceMinor: cycle.closingBalanceMinor,
        closingBalanceUsdMinor: cycle.closingBalanceUsdMinor,
        minimumPaymentMinor: cycle.minimumPaymentMinor,
        temMilli: cycle.monthlyRateMilli,
      });
    }

    return cycles.length;
  });

  return run();
}

export interface CsvImportResult extends ImportResult {
  cycleCount: number;
  incomeSourceCount: number;
  accountsCreated: string[];
}

/**
 * Reads the documented format and loads it through the same path as everything else.
 *
 * Deliberately delegates to `importSourceRecords` rather than writing rows itself. Every
 * invariant that makes the numbers trustworthy lives there - which kinds become ordinary
 * expenses, how a re-import stays idempotent, what counts as authoritative - and a second
 * writer would be a second set of rules that drift apart without anyone noticing.
 */
export function importCsvSources(
  database: SqliteDatabase,
  chargesPath: string,
  cyclesPath: string | null,
  incomePath: string | null = null,
): CsvImportResult {
  const charges = parseChargesCsv(readFileSync(chargesPath, "utf8"), chargesPath);
  const cycles = cyclesPath === null ? [] : parseCyclesCsv(readFileSync(cyclesPath, "utf8"));
  const income = incomePath === null ? [] : parseIncomeCsv(readFileSync(incomePath, "utf8"));

  /*
   * The cycles file is the better authority on an account: anything with a statement is a
   * card, whatever its charges happen to look like.
   */
  const accounts = new Map(charges.accounts);
  for (const cycle of cycles) {
    accounts.set(cycle.accountId, { name: cycle.accountName, kind: "card" });
  }

  const known = new Set(
    database.prepare<[], { id: string }>("SELECT id FROM accounts").all().map((row) => row.id),
  );
  const created = [...accounts.keys()].filter((id) => !known.has(id));

  ensureAccounts(database, accounts);
  const cycleCount = persistCycles(database, cycles);
  const incomeSourceCount = persistIncome(database, income);
  const result = importSourceRecords(database, charges.rows);

  return { ...result, cycleCount, incomeSourceCount, accountsCreated: created };
}
