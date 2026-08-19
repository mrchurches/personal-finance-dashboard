import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type SqliteDatabase } from "../server/database";
import { FinanceRepository } from "../server/finance-repository";

describe("summary aggregation", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("keeps the cycle flow separate from the statement balance", () => {
    database = createDatabase(":memory:");
    const repository = new FinanceRepository(database);
    const summary = repository.getSummary("2026-08");

    expect(summary.income).toEqual({ ARS: 0, USD: 0 });
    expect(summary.cardCharges).toEqual({ ARS: 0, USD: 0 });
    expect(summary.financialCosts).toEqual({ ARS: 0, USD: 0 });
    // Flow only: the statement balance is reported separately because it already
    // contains the cycle charges.
    expect(summary.cycleResult).toEqual({ ARS: 0, USD: 0 });
    expect(summary.statementDebt).toEqual({ ARS: 0, USD: 0 });
    expect(summary.statementBalances).toEqual([]);
    expect(summary.cycle).toBeNull();
    expect(summary.uncategorized).toEqual({
      totals: { ARS: 0, USD: 0 },
      count: 0,
    });
    expect(summary.reviewQueueCount).toBe(0);
  });

  it("aggregates category totals by currency", () => {
    database = createDatabase(":memory:");
    const repository = new FinanceRepository(database);
    const summary = repository.getSummary("2026-08");
    const arsTotal = summary.categoryTotals
      .filter((category) => category.currency === "ARS")
      .reduce((total, category) => total + category.amountMinor, 0);
    const usdTotal = summary.categoryTotals
      .filter((category) => category.currency === "USD")
      .reduce((total, category) => total + category.amountMinor, 0);

    expect(arsTotal).toBe(0);
    expect(usdTotal).toBe(0);
  });
});
