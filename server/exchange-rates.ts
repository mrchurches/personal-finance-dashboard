import type { SqliteDatabase } from "./database";

/**
 * A rate the owner stated, on a day they stated it for.
 *
 * Never derived and never defaulted. In an economy with several simultaneous
 * exchange rates, a converted figure without a stated rate and a stated date is not
 * an approximation, it is a fabrication - and it looks identical to a real number
 * once it is on screen. So the absence of a rate is reported as an absence rather
 * than filled in, and every converted figure carries the rate that produced it.
 */
export interface ExchangeRate {
  id: number;
  quoteCurrency: string;
  /** Minor units of ARS for one whole unit of the quoted currency. */
  rateMinor: number;
  asOf: string;
  note: string | null;
  createdAt: string;
}

/** Spending in a foreign currency for one cycle, and its conversion if one is possible. */
export interface ForeignCycle {
  period: string;
  currency: string;
  amountMinor: number;
  transactionCount: number;
  /** Null when no rate was declared on or before this cycle. */
  convertedArsMinor: number | null;
  rateMinor: number | null;
  rateAsOf: string | null;
}

export interface ForeignSpending {
  cycles: ForeignCycle[];
  totalAmountMinor: number;
  /** Sum of the conversions that were possible. Cycles without a rate are excluded. */
  convertedArsMinor: number;
  /** Cycles that had spending but no rate to convert it with. */
  unconvertedCycles: number;
  typicalConvertedArsMinor: number;
  latest: ExchangeRate | null;
}

interface ExchangeRateRow {
  id: number;
  quoteCurrency: string;
  rateMinor: number;
  asOf: string;
  note: string | null;
  createdAt: string;
}

interface ForeignRow {
  period: string;
  currency: string;
  amountMinor: number;
  transactionCount: number;
}

const rateSelect = `
  SELECT
    id,
    quote_currency AS quoteCurrency,
    rate_minor AS rateMinor,
    as_of AS asOf,
    note,
    created_at AS createdAt
  FROM exchange_rates
`;

const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const SUPPORTED_QUOTE_CURRENCIES = ["USD"];

/** One peso is worth one peso; anything else needs a declared rate. */
const MINOR_UNITS_PER_UNIT = 100;

export function listExchangeRates(database: SqliteDatabase): ExchangeRate[] {
  return database.prepare<[], ExchangeRateRow>(`${rateSelect} ORDER BY as_of DESC, id DESC`).all();
}

export function declareExchangeRate(
  database: SqliteDatabase,
  input: { quoteCurrency: string; rateMinor: number; asOf: string; note: string | null },
  createdAt: string,
): ExchangeRate {
  if (!SUPPORTED_QUOTE_CURRENCIES.includes(input.quoteCurrency)) {
    throw new Error(`The currency must be one of ${SUPPORTED_QUOTE_CURRENCIES.join(", ")}.`);
  }

  if (!Number.isSafeInteger(input.rateMinor) || input.rateMinor <= 0) {
    throw new Error("The rate must be a positive whole number of minor units per unit.");
  }

  if (!DATE_PATTERN.test(input.asOf)) {
    throw new Error("asOf must be a date in YYYY-MM-DD form.");
  }

  database
    .prepare<{ quoteCurrency: string; rateMinor: number; asOf: string; note: string | null; createdAt: string }, void>(
      `INSERT INTO exchange_rates (quote_currency, rate_minor, as_of, note, created_at)
       VALUES (@quoteCurrency, @rateMinor, @asOf, @note, @createdAt)
       ON CONFLICT (quote_currency, as_of) DO UPDATE SET rate_minor = excluded.rate_minor, note = excluded.note`,
    )
    .run({ ...input, createdAt });

  const declared = listExchangeRates(database).find(
    (rate) => rate.quoteCurrency === input.quoteCurrency && rate.asOf === input.asOf,
  );
  if (declared === undefined) {
    throw new Error("The declared rate could not be read back.");
  }

  return declared;
}

export function deleteExchangeRate(database: SqliteDatabase, id: number): { deleted: number } {
  return {
    deleted: database.prepare<[number], void>("DELETE FROM exchange_rates WHERE id = ?").run(id).changes,
  };
}

/**
 * The rate in force for a cycle: the most recent one declared no later than it.
 *
 * Deliberately not the nearest, and never a later one. A cycle converted at a rate
 * from after it happened is a rate nobody could have used at the time, and in a
 * currency that moves as fast as this one that is not a rounding difference.
 */
export function rateForPeriod(
  database: SqliteDatabase,
  quoteCurrency: string,
  period: string,
): ExchangeRate | null {
  return (
    database
      .prepare<{ quoteCurrency: string; period: string }, ExchangeRateRow>(
        `${rateSelect}
         WHERE quote_currency = @quoteCurrency AND substr(as_of, 1, 7) <= @period
         ORDER BY as_of DESC, id DESC
         LIMIT 1`,
      )
      .get({ quoteCurrency, period }) ?? null
  );
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

/**
 * Spending in currencies the rest of the dashboard filters out.
 *
 * Every other panel restricts itself to pesos, which is correct for arithmetic and
 * wrong for the total: a subscription billed in dollars is spending whether or not
 * it can be added to a peso column, and until it is converted it is simply missing.
 */
export function getForeignSpending(
  database: SqliteDatabase,
  quoteCurrency = "USD",
): ForeignSpending {
  const rows = database
    .prepare<{ currency: string }, ForeignRow>(
      `SELECT
        COALESCE(t.statement_period, substr(t.transaction_date, 1, 7)) AS period,
        t.currency,
        SUM(t.amount_minor) AS amountMinor,
        COUNT(*) AS transactionCount
      FROM transactions t
      WHERE t.transaction_type = 'expense' AND t.currency = :currency
      GROUP BY period
      ORDER BY period`,
    )
    .all({ currency: quoteCurrency });

  const cycles: ForeignCycle[] = rows.map((row) => {
    const rate = rateForPeriod(database, quoteCurrency, row.period);
    return {
      period: row.period,
      currency: row.currency,
      amountMinor: row.amountMinor,
      transactionCount: row.transactionCount,
      convertedArsMinor:
        rate === null
          ? null
          : Math.round((row.amountMinor * rate.rateMinor) / MINOR_UNITS_PER_UNIT),
      rateMinor: rate?.rateMinor ?? null,
      rateAsOf: rate?.asOf ?? null,
    };
  });

  const converted = cycles
    .map((cycle) => cycle.convertedArsMinor)
    .filter((value): value is number => value !== null);

  return {
    cycles,
    totalAmountMinor: cycles.reduce((total, cycle) => total + cycle.amountMinor, 0),
    convertedArsMinor: converted.reduce((total, value) => total + value, 0),
    unconvertedCycles: cycles.length - converted.length,
    typicalConvertedArsMinor: median(converted),
    latest: listExchangeRates(database).find((rate) => rate.quoteCurrency === quoteCurrency) ?? null,
  };
}
