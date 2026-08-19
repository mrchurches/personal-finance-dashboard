import { getJsonValue, isJsonObject, isString, parseJson, type JsonValue } from "../shared/json";
import {
  isAccountsResponse,
  isCategoriesResponse,
  isCreateIncomeSourceResponse,
  isCreateMerchantRuleResponse,
  isCreateTransactionResponse,
  isCommitmentResponse,
  isCommitmentsResponse,
  isDeletedResponse,
  isPlanNoteResponse,
  isAnomaliesResponse,
  isExchangeRateResponse,
  isExchangeRatesResponse,
  isFoodResponse,
  isScorecardResponse,
  isPlanNotesResponse,
  isIncomeSourcesResponse,
  isBaselineResponse,
  isCommittedInstallmentsResponse,
  isPayoffLeversResponse,
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
  type CommitmentResponse,
  type CommitmentsResponse,
  type DeletedResponse,
  type PlanNoteResponse,
  type AnomaliesResponse,
  type ExchangeRateResponse,
  type ExchangeRatesResponse,
  type FoodResponse,
  type ScorecardResponse,
  type PlanNotesResponse,
  type CreateMerchantRuleRequest,
  type CreateMerchantRuleResponse,
  type IncomeSourcesResponse,
  type BaselineResponse,
  type CommittedInstallmentsResponse,
  type PayoffLeversResponse,
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

export async function fetchPayoffLevers(month: string): Promise<PayoffLeversResponse> {
  const response = await fetch(`/api/payoff-levers?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isPayoffLeversResponse);
}

export async function setTransactionCategory(
  transactionId: number,
  categoryId: string,
): Promise<CreateTransactionResponse> {
  const response = await fetch(`/api/transactions/${transactionId}/category`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });

  return readApiResponse(response, isCreateTransactionResponse);
}

export async function fetchPlanNotes(): Promise<PlanNotesResponse> {
  const response = await fetch("/api/plan-notes");
  return readApiResponse(response, isPlanNotesResponse);
}

export interface PlanNoteRequest {
  title: string;
  body: string;
  pinned: boolean;
}

export async function createPlanNote(requestBody: PlanNoteRequest): Promise<PlanNoteResponse> {
  const response = await fetch("/api/plan-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isPlanNoteResponse);
}

export async function updatePlanNote(
  id: number,
  requestBody: PlanNoteRequest,
): Promise<PlanNoteResponse> {
  const response = await fetch(`/api/plan-notes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isPlanNoteResponse);
}

export async function deletePlanNote(id: number): Promise<DeletedResponse> {
  const response = await fetch(`/api/plan-notes/${id}`, { method: "DELETE" });
  return readApiResponse(response, isDeletedResponse);
}

export async function fetchCommitments(month: string): Promise<CommitmentsResponse> {
  const response = await fetch(`/api/commitments?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isCommitmentsResponse);
}

export interface CommitmentRequest {
  label: string;
  amountMinor: number;
  currency: string;
  effect: string;
  merchantKey: string | null;
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  replacedCategoryIds: string[];
}

export async function createCommitment(requestBody: CommitmentRequest): Promise<CommitmentResponse> {
  const response = await fetch("/api/commitments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isCommitmentResponse);
}

export async function deleteCommitment(id: number): Promise<DeletedResponse> {
  const response = await fetch(`/api/commitments/${id}`, { method: "DELETE" });
  return readApiResponse(response, isDeletedResponse);
}

export async function fetchScorecard(month: string): Promise<ScorecardResponse> {
  const response = await fetch(`/api/scorecard?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isScorecardResponse);
}

export async function fetchFood(month: string): Promise<FoodResponse> {
  const response = await fetch(`/api/food?month=${encodeURIComponent(month)}`);
  return readApiResponse(response, isFoodResponse);
}

export async function fetchExchangeRates(): Promise<ExchangeRatesResponse> {
  const response = await fetch("/api/exchange-rates");
  return readApiResponse(response, isExchangeRatesResponse);
}

export interface ExchangeRateRequest {
  quoteCurrency: string;
  rateMinor: number;
  asOf: string;
  note: string | null;
}

export async function declareExchangeRate(
  requestBody: ExchangeRateRequest,
): Promise<ExchangeRateResponse> {
  const response = await fetch("/api/exchange-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return readApiResponse(response, isExchangeRateResponse);
}

export async function fetchAnomalies(): Promise<AnomaliesResponse> {
  const response = await fetch("/api/anomalies");
  return readApiResponse(response, isAnomaliesResponse);
}
