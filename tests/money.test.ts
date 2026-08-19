import { describe, expect, it } from "vitest";
import { formatMoney, parseAmountToMinor } from "../shared/money";

describe("money utilities", () => {
  it("converts decimal amounts to integer minor units", () => {
    expect(parseAmountToMinor("1234.5", "ARS")).toBe(123450);
    expect(parseAmountToMinor("9.49", "USD")).toBe(949);
  });

  it("formats minor units without floating point rounding", () => {
    expect(formatMoney(123456789, "ARS")).toBe("ARS 1,234,567.89");
    expect(formatMoney(-98765432, "ARS")).toBe("-ARS 987,654.32");
  });

  it("rejects amounts with more than two decimals", () => {
    expect(() => parseAmountToMinor("10.999", "ARS")).toThrow(
      "Amount must be a non-negative number with up to two decimals.",
    );
  });
});
