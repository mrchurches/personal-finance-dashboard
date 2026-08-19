import type { SqliteDatabase } from "./database";

/**
 * A cycle's financing cost, the rate the statement declares, and the rate the
 * charges actually imply.
 *
 * The two are compared rather than trusted individually. A stated rate can be
 * misparsed by a factor of ten without looking wrong, and an implied rate alone
 * cannot separate interest from the taxes levied on it. Together they catch the
 * mistake that matters: an order-of-magnitude error.
 */
export interface FinancingObservation {
  accountId: string;
  period: string;
  /** Statement balance that went unpaid into this cycle. */
  financedMinor: number;
  /** Interest, VAT and perceptions the statement charged. */
  financingCostMinor: number;
  statedTemMilli: number | null;
  /** Financing cost over the financed balance, in thousandths of a percent. */
  impliedTemMilli: number | null;
  /**
   * How much larger the total charge is than interest at the stated rate. Above
   * one because VAT and tax perceptions ride on the interest.
   */
  taxGrossUp: number | null;
  plausible: boolean;
}

/**
 * The implied rate is not expected to equal the stated one: interest accrues from
 * the previous due date rather than over a whole cycle, and the base the issuer
 * finances is not exactly the unpaid balance. A wide band is therefore correct.
 * Its job is to catch a decimal-point error, not to reconcile a formula the
 * statement never publishes.
 */
const PLAUSIBLE_LOWER = 0.25;
const PLAUSIBLE_UPPER = 3;

interface ObservationRow {
  accountId: string;
  period: string;
  closingBalanceMinor: number | null;
  previousClosingMinor: number | null;
  statedTemMilli: number | null;
  financingCostMinor: number | null;
  paymentsMinor: number | null;
}

export function getFinancingObservations(database: SqliteDatabase): FinancingObservation[] {
  const rows = database
    .prepare<[], ObservationRow>(
      `SELECT
        c.account_id AS accountId,
        c.period,
        c.closing_balance_minor AS closingBalanceMinor,
        c.tem_pesos_milli AS statedTemMilli,
        (
          SELECT previous.closing_balance_minor
          FROM statement_cycles previous
          WHERE previous.account_id = c.account_id
            AND previous.period < c.period
            AND previous.closing_balance_minor IS NOT NULL
          ORDER BY previous.period DESC
          LIMIT 1
        ) AS previousClosingMinor,
        (
          SELECT SUM(amount_minor) FROM source_records
          WHERE statement_period = c.period
            AND account_id = c.account_id
            AND record_kind = 'financial_cost'
        ) AS financingCostMinor,
        (
          SELECT SUM(amount_minor) FROM source_records
          WHERE statement_period = c.period
            AND account_id = c.account_id
            AND record_kind = 'payment'
        ) AS paymentsMinor
      FROM statement_cycles c
      WHERE c.closing_balance_minor IS NOT NULL
      ORDER BY c.period, c.account_id`,
    )
    .all();

  return rows.map((row) => {
    const financedMinor = Math.max((row.previousClosingMinor ?? 0) - (row.paymentsMinor ?? 0), 0);
    const financingCostMinor = row.financingCostMinor ?? 0;
    const impliedTemMilli =
      financedMinor === 0 ? null : Math.round((financingCostMinor / financedMinor) * 100 * 1000);

    const statedInterest =
      row.statedTemMilli === null ? null : (financedMinor * row.statedTemMilli) / 100 / 1000;
    const taxGrossUp =
      statedInterest === null || statedInterest === 0 ? null : financingCostMinor / statedInterest;

    const ratio =
      impliedTemMilli === null || row.statedTemMilli === null || row.statedTemMilli === 0
        ? null
        : impliedTemMilli / row.statedTemMilli;

    return {
      accountId: row.accountId,
      period: row.period,
      financedMinor,
      financingCostMinor,
      statedTemMilli: row.statedTemMilli,
      impliedTemMilli,
      taxGrossUp,
      plausible: ratio === null ? true : ratio >= PLAUSIBLE_LOWER && ratio <= PLAUSIBLE_UPPER,
    };
  });
}

export interface FinancingRate {
  /** Stated monthly rate, thousandths of a percent, averaged across the cards. */
  temMilli: number | null;
  /** Observed multiple of stated interest once taxes are included. */
  taxGrossUp: number;
  basis: "stated-with-observed-taxes" | "stated-only" | "unavailable";
}

/**
 * The rate to project a future cycle with.
 *
 * The statement's own monthly rate, grossed up by the ratio the charges actually
 * showed once VAT and perceptions were added. Neither figure alone answers what
 * carrying a balance costs: the stated rate excludes the taxes that ride on it,
 * and the observed total cannot be applied to a balance that has changed.
 */
export function getFinancingRate(database: SqliteDatabase): FinancingRate {
  const observations = getFinancingObservations(database).filter(
    (observation) => observation.financedMinor > 0 && observation.plausible,
  );

  const stated = observations
    .map((observation) => observation.statedTemMilli)
    .filter((value): value is number => value !== null);
  if (stated.length === 0) {
    return { temMilli: null, taxGrossUp: 1, basis: "unavailable" };
  }

  const temMilli = Math.round(stated.reduce((sum, value) => sum + value, 0) / stated.length);
  const grossUps = observations
    .map((observation) => observation.taxGrossUp)
    .filter((value): value is number => value !== null && value > 0);

  if (grossUps.length === 0) {
    return { temMilli, taxGrossUp: 1, basis: "stated-only" };
  }

  return {
    temMilli,
    taxGrossUp: grossUps.reduce((sum, value) => sum + value, 0) / grossUps.length,
    basis: "stated-with-observed-taxes",
  };
}
