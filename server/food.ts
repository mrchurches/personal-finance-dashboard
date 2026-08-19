import type { SqliteDatabase } from "./database";
import { FinanceRepository } from "./finance-repository";
import { commissionInside, valueInside } from "./gateway-commission";
import { listCommitments } from "./commitments";

/**
 * What food actually costs, cycle by cycle.
 *
 * Separated from the general category breakdown because food is the one block the
 * owner can still decide about. Rent-like costs are answered by cancelling them or
 * not; food is answered by a number, and a number needs a distribution rather than
 * a single total: the question "how much should I budget" is unanswerable from an
 * average when the worst cycle is nearly three times the best.
 */
export interface FoodCycle {
  period: string;
  homeMinor: number;
  outMinor: number;
  deliveryMinor: number;
  /** Charged to the card, gateway fees included. */
  totalMinor: number;
  /** Of that total, what the gateway took rather than the grocer. At least this much. */
  commissionMinor: number;
  /** The food itself, once the gateway fee is taken out. */
  valueMinor: number;
  isComplete: boolean;
}

export interface FoodBreakdown {
  cycles: FoodCycle[];
  /** Across complete cycles only, on the value rather than the charge. */
  medianValueMinor: number;
  averageValueMinor: number;
  bestValueMinor: number;
  worstValueMinor: number;
  /** How many times the worst cycle exceeded the best, in whole percent. */
  worstOverBestPercent: number;
  /** Median food as a share of recurring income, in whole percent. */
  shareOfIncomePercent: number;
  totalCommissionMinor: number;
  /**
   * The cash a declared envelope provides, if one has been declared against food.
   *
   * Joined here rather than in the interface because the food category ids live here.
   * The median and the cap chosen against it had been eight panels apart and never
   * referenced each other, so the reader could not answer the one question the two of
   * them exist to answer together: is this cap a cut, or a ceiling nobody reaches?
   */
  targetMinor: number | null;
  targetFromPeriod: string | null;
  targetLabel: string | null;
}

interface FoodRow {
  period: string;
  categoryId: string;
  amountMinor: number;
}

interface CompletenessRow {
  period: string;
  statements: number;
}

const FOOD_CATEGORY_IDS = ["food", "food-home", "food-out", "food-delivery"];

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

export function getFoodBreakdown(database: SqliteDatabase, period: string): FoodBreakdown {
  const placeholders = FOOD_CATEGORY_IDS.map(() => "?").join(", ");
  const rows = database
    .prepare<string[], FoodRow>(
      `SELECT
        COALESCE(t.statement_period, substr(t.transaction_date, 1, 7)) AS period,
        t.category_id AS categoryId,
        t.amount_minor AS amountMinor
      FROM transactions t
      WHERE t.transaction_type = 'expense'
        AND t.currency = 'ARS'
        AND t.category_id IN (${placeholders})`,
    )
    .all(...FOOD_CATEGORY_IDS);

  const completeness = database
    .prepare<[], CompletenessRow>(
      `SELECT statement_period AS period,
              SUM(CASE WHEN source_kind LIKE '%_statement' THEN 1 ELSE 0 END) AS statements
       FROM source_records
       GROUP BY statement_period`,
    )
    .all();
  const complete = new Set(completeness.filter((row) => row.statements > 0).map((row) => row.period));

  const byPeriod = new Map<string, FoodCycle>();
  for (const row of rows) {
    const cycle = byPeriod.get(row.period) ?? {
      period: row.period,
      homeMinor: 0,
      outMinor: 0,
      deliveryMinor: 0,
      totalMinor: 0,
      commissionMinor: 0,
      valueMinor: 0,
      isComplete: complete.has(row.period),
    };

    if (row.categoryId === "food-out") {
      cycle.outMinor += row.amountMinor;
    } else if (row.categoryId === "food-delivery") {
      cycle.deliveryMinor += row.amountMinor;
    } else {
      /*
       * The bare parent lands with groceries. A transaction should never carry it,
       * since the pickers only offer leaves, but putting it somewhere visible beats
       * dropping it from a total that is supposed to reconcile.
       */
      cycle.homeMinor += row.amountMinor;
    }

    cycle.totalMinor += row.amountMinor;
    cycle.commissionMinor += commissionInside(row.amountMinor) ?? 0;
    cycle.valueMinor += valueInside(row.amountMinor);
    byPeriod.set(row.period, cycle);
  }

  const cycles = [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period));
  const values = cycles.filter((cycle) => cycle.isComplete).map((cycle) => cycle.valueMinor);
  const medianValueMinor = median(values);
  const bestValueMinor = values.length === 0 ? 0 : Math.min(...values);
  const worstValueMinor = values.length === 0 ? 0 : Math.max(...values);

  const recurringIncomeMinor = new FinanceRepository(database).getRecurringIncome(period).ARS;

  const foodIds = new Set(FOOD_CATEGORY_IDS);
  const envelope = listCommitments(database).find(
    (commitment) =>
      commitment.effect === "substitution"
      && commitment.replacedCategoryIds.some((categoryId) => foodIds.has(categoryId)),
  );

  return {
    cycles,
    medianValueMinor,
    averageValueMinor:
      values.length === 0
        ? 0
        : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    bestValueMinor,
    worstValueMinor,
    worstOverBestPercent:
      bestValueMinor === 0 ? 0 : Math.round((worstValueMinor / bestValueMinor) * 100),
    shareOfIncomePercent:
      recurringIncomeMinor === 0 ? 0 : Math.round((medianValueMinor / recurringIncomeMinor) * 100),
    totalCommissionMinor: cycles.reduce((total, cycle) => total + cycle.commissionMinor, 0),
    targetMinor: envelope?.amountMinor ?? null,
    targetFromPeriod: envelope?.effectiveFrom ?? null,
    targetLabel: envelope?.label ?? null,
  };
}
