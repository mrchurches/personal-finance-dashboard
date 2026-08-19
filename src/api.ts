import { getJsonValue, isJsonObject, isString, parseJson, type JsonValue } from "../shared/json";
import {
  isAccountsResponse,
  isCategoriesResponse,
  isCreateIncomeSourceResponse,
  isCreateMerchantRuleResponse,
  isCreateTransactionResponse,
  isIncomeSourcesResponse,
  isBaselineResponse,
  isCommittedInstallmentsResponse,
  isPayoffResponse,
  isSpendingPatternsResponse,
  isUncategorizedMerchantsResponse,
  isSourceRecordListResponse,
  isSummary,
  isTransactionListResponse,
  type AccountsResponse,
  type CategoriesResponse,
  type CreateIncomeSourceRequest,
  type CreateIncomeSourceResponse,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
  type CreateMerchantRuleRequest,
  type CreateMerchantRuleResponse,
  type IncomeSourcesResponse,
  type BaselineResponse,
  type CommittedInstallmentsResponse,
  type PayoffResponse,
  type SpendingPatternsResponse,
  type UncategorizedMerchantsResponse,
  type SourceRecordListResponse,
  type Summary,
  type TransactionListResponse,
} from "../shared/types";

type PayloadGuard<T extends object> = (value: JsonValue | object) => value is T;

async function readApiResponse<T extends object>(response: Response, guard: PayloadGuard<T>): Promise<T> {
  let payload: JsonValue;
  try {
    payload = parseJson(await response.text());
  } catch {
    throw new Error("The API returned invalid JSON.");
  }

  if (!response.ok) {
    if (isJsonObject(payload)) {
      const error = getJsonValue(payload, "error");
      if (isString(error)) {
        throw new Error(error);
      }
    }

    throw new Error("The API request failed.");
  }

  if (!guard(payload)) {
    throw new Error("The API returned an invalid response.");
  }

  return payload;
}

export async function fetchSummary(month: string): Promise<Summary> {
  const response = await fetch(`/api/summary?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isSummary);
}

export async function fetchTransactions(
  month: string,
  categoryId: string,
  accountId: string,
): Promise<TransactionListResponse> {
  const search = new URLSearchParams({ month });
  if (categoryId.length > 0) {
    search.set("categoryId", categoryId);
  }
  if (accountId.length > 0) {
    search.set("accountId", accountId);
  }

  const response = await fetch(`/api/transactions?${search.toString()}`);
  return readApiResponse(response, isTransactionListResponse);
}

export async function fetchSourceRecords(month: string): Promise<SourceRecordListResponse> {
  const response = await fetch(`/api/source-records?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isSourceRecordListResponse);
}

export async function fetchReviewQueue(month: string): Promise<SourceRecordListResponse> {
  const response = await fetch(`/api/reconciliation?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isSourceRecordListResponse);
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  const response = await fetch("/api/categories");
  return readApiResponse(response, isCategoriesResponse);
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  const response = await fetch("/api/accounts");
  return readApiResponse(response, isAccountsResponse);
}

export async function createTransaction(
  requestBody: CreateTransactionRequest,
): Promise<CreateTransactionResponse> {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isCreateTransactionResponse);
}

export async function fetchIncomeSources(): Promise<IncomeSourcesResponse> {
  const response = await fetch("/api/income-sources");
  return readApiResponse(response, isIncomeSourcesResponse);
}

export async function createIncomeSource(
  requestBody: CreateIncomeSourceRequest,
): Promise<CreateIncomeSourceResponse> {
  const response = await fetch("/api/income-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isCreateIncomeSourceResponse);
}

export async function fetchUncategorizedMerchants(): Promise<UncategorizedMerchantsResponse> {
  const response = await fetch("/api/uncategorized-merchants");
  return readApiResponse(response, isUncategorizedMerchantsResponse);
}

export async function createMerchantRule(
  requestBody: CreateMerchantRuleRequest,
): Promise<CreateMerchantRuleResponse> {
  const response = await fetch("/api/merchant-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isCreateMerchantRuleResponse);
}

export async function fetchSpendingPatterns(): Promise<SpendingPatternsResponse> {
  const response = await fetch("/api/spending-patterns");
  return readApiResponse(response, isSpendingPatternsResponse);
}

export async function fetchBaseline(month: string): Promise<BaselineResponse> {
  const response = await fetch(`/api/baseline?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isBaselineResponse);
}

export async function fetchCommittedInstallments(month: string): Promise<CommittedInstallmentsResponse> {
  const response = await fetch(`/api/committed-installments?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isCommittedInstallmentsResponse);
}

export async function fetchPayoff(month: string): Promise<PayoffResponse> {
  const response = await fetch(`/api/payoff?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isPayoffResponse);
}
