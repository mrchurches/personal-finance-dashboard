import { describe, expect, it } from "vitest";
import { validateCreateTransactionRequest } from "../server/validation";
import type { JsonValue } from "../shared/json";

describe("transaction validation", () => {
  it("parses a valid manual transaction at the request boundary", () => {
    const body: JsonValue = {
      transactionDate: "2026-08-18",
      description: "Household purchase",
      categoryId: "shopping",
      accountId: "cash",
      transactionType: "expense",
      amount: "1250.50",
      currency: "ARS",
    };

    const result = validateCreateTransactionRequest(body);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.amountMinor).toBe(125050);
      expect(result.value.currency).toBe("ARS");
    }
  });

  it("rejects malformed dates and unsupported precision", () => {
    const body: JsonValue = {
      transactionDate: "2026-02-30",
      description: "Invalid transaction",
      categoryId: "shopping",
      accountId: "cash",
      transactionType: "expense",
      amount: "10.999",
      currency: "USD",
    };

    const result = validateCreateTransactionRequest(body);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("transactionDate must be a valid YYYY-MM-DD date.");
      expect(result.errors).toContain("Amount must be a non-negative number with up to two decimals.");
    }
  });

  it("rejects non-object request bodies", () => {
    const result = validateCreateTransactionRequest(null);

    expect(result).toEqual({ valid: false, errors: ["Request body must be a JSON object."] });
  });
});
