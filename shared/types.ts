import { getJsonValue, isInteger, isJsonObject, isNumber, isString, type JsonValue } from "./json";

export const CURRENCY = {
  ARS: "ARS",
  USD: "USD",
} as const;

export type Currency = (typeof CURRENCY)[keyof typeof CURRENCY];

export const TRANSACTION_TYPE = {
  INCOME: "income",
  EXPENSE: "expense",
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const TRANSACTION_SOURCE = {
  SEEDED: "seeded",
  MANUAL: "manual",
  IMPORTED: "imported",
} as const;

export type TransactionSource = (typeof TRANSACTION_SOURCE)[keyof typeof TRANSACTION_SOURCE];

export const SOURCE_KIND = {
  VISA_STATEMENT: "visa_statement",
  MASTERCARD_STATEMENT: "mastercard_statement",
  CARD_MOVEMENTS: "card_movements",
  MERCADO_PAGO_HISTORY: "mercado_pago_history",
} as const;

export type SourceKind = (typeof SOURCE_KIND)[keyof typeof SOURCE_KIND];

export const FUNDING_METHOD = {
  VISA_CREDIT: "visa_credit",
  MASTERCARD_CREDIT: "mastercard_credit",
  AVAILABLE_MONEY: "available_money",
  BANK_TRANSFER: "bank_transfer",
} as const;

export type FundingMethod = (typeof FUNDING_METHOD)[keyof typeof FUNDING_METHOD];

export const SIGNED_STATUS = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
} as const;

export type SignedStatus = (typeof SIGNED_STATUS)[keyof typeof SIGNED_STATUS];

export const SOURCE_STATUS = {
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "returned",
  NOT_APPLICABLE: "not_applicable",
} as const;

export type SourceStatus = (typeof SOURCE_STATUS)[keyof typeof SOURCE_STATUS];

export const RECORD_KIND = {
  CARD_CHARGE: "card_charge",
  FINANCIAL_COST: "financial_cost",
  PAYMENT: "payment",
  LIABILITY: "liability",
  INCOME: "income",
  REFUND: "refund",
  REJECTED: "rejected",
  RETURNED: "returned",
  PRIOR_BALANCE: "prior_balance",
  CASH_OUTFLOW: "cash_outflow",
  REVIEW_CANDIDATE: "review_candidate",
} as const;

export type RecordKind = (typeof RECORD_KIND)[keyof typeof RECORD_KIND];

export const RECONCILIATION_STATE = {
  AUTHORITATIVE: "authoritative",
  DUPLICATE: "duplicate",
  AMBIGUOUS: "ambiguous",
  UNMATCHED: "unmatched",
  REVIEW: "review",
  EXCLUDED: "excluded",
  NOT_APPLICABLE: "not_applicable",
} as const;

export type ReconciliationState = (typeof RECONCILIATION_STATE)[keyof typeof RECONCILIATION_STATE];

export const CATEGORY_KIND = {
  INCOME: "income",
  EXPENSE: "expense",
} as const;

export type CategoryKind = (typeof CATEGORY_KIND)[keyof typeof CATEGORY_KIND];

export const ACCOUNT_KIND = {
  CARD: "card",
  BANK: "bank",
  CASH: "cash",
} as const;

export type AccountKind = (typeof ACCOUNT_KIND)[keyof typeof ACCOUNT_KIND];

export interface MoneyTotals {
  ARS: number;
  USD: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
}

export interface Transaction {
  id: number;
  transactionDate: string;
  description: string;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: Currency;
  source: TransactionSource;
  statementPeriod: string | null;
  section: string | null;
  sourceKind: SourceKind | null;
  sourceFilePath: string | null;
  sourceLocator: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  reconciliationState: ReconciliationState | null;
}

export interface SourceRecord {
  id: number;
  sourceId: string;
  importKey: string;
  sourceFilePath: string;
  sourceKind: SourceKind;
  statementPeriod: string;
  sourceLocator: string;
  transactionDate: string | null;
  section: string;
  description: string;
  accountId: string | null;
  fundingMethod: FundingMethod | null;
  signedStatus: SignedStatus;
  currency: Currency;
  amountMinor: number;
  recordKind: RecordKind;
  status: SourceStatus;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  reconciliationState: ReconciliationState;
  authoritativeSourceRecordId: number | null;
  authoritativeTransactionId: number | null;
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  currency: Currency;
  amountMinor: number;
  percentage: number;
  transactionCount: number;
}

export interface UncategorizedTotals {
  totals: MoneyTotals;
  count: number;
}

/**
 * A card cycle runs between statement closes, not between calendar months, and
 * that is the window the owner actually lives in. Both cards close on the same
 * dates today, but the dates are stored per account so that need not stay true.
 */
export interface StatementCycleDates {
  openedOn: string;
  closedOn: string;
  dueOn: string;
}

/**
 * Debt already incurred, falling due in a future month, as the statement itself
 * projects it. `openEnded` marks Visa's trailing "A partir de <month>" figure: a
 * per-month amount from that month onward rather than a single month.
 */
export interface CommittedInstallment {
  accountId: string;
  accountName: string;
  statementPeriod: string;
  duePeriod: string;
  amountMinor: number;
  currency: Currency;
  openEnded: boolean;
}

export interface StatementBalance {
  accountId: string;
  accountName: string;
  period: string;
  openedOn: string;
  closedOn: string;
  dueOn: string;
  amountMinor: number;
  amountUsdMinor: number;
  minimumPaymentMinor: number | null;
}

export interface Summary {
  month: string;
  income: MoneyTotals;
  recurringIncome: MoneyTotals;
  oneOffIncome: MoneyTotals;
  cardCharges: MoneyTotals;
  financialCosts: MoneyTotals;
  /**
   * Flow: what happened inside the cycle. Income minus what was spent and what
   * the financing cost. Answers "did this cycle live within its means".
   */
  cycleResult: MoneyTotals;
  /**
   * Stock: what is owed at the close of the cycle, straight from the statements.
   * Deliberately not subtracted from `cycleResult`, because a statement balance
   * already contains the cycle charges and subtracting both counts them twice.
   */
  statementDebt: MoneyTotals;
  statementBalances: StatementBalance[];
  cycle: StatementCycleDates | null;
  categoryTotals: CategoryTotal[];
  uncategorized: UncategorizedTotals;
  reviewQueueCount: number;
}

export interface TransactionListResponse {
  transactions: Transaction[];
}

export interface SourceRecordListResponse {
  records: SourceRecord[];
}

export interface CategoriesResponse {
  categories: Category[];
}

export interface AccountsResponse {
  accounts: Account[];
}

export const INCOME_FREQUENCY = {
  MONTHLY: "monthly",
} as const;

export type IncomeFrequency = (typeof INCOME_FREQUENCY)[keyof typeof INCOME_FREQUENCY];

/**
 * A recurring income rule, not a historical row. The summary derives the amount
 * for any month from these, which is what lets a payoff projection ask about a
 * month that has not happened yet. One-off income stays an ordinary income
 * transaction.
 */
export interface IncomeSource {
  id: number;
  name: string;
  amountMinor: number;
  currency: Currency;
  frequency: IncomeFrequency;
  /**
   * Argentine statutory annual bonus (SAC, "aguinaldo"): when true, June and
   * December each add half of `amountMinor`. Derived from the salary on purpose,
   * so it stays correct when the salary changes.
   */
  statutoryBonus: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface IncomeSourcesResponse {
  incomeSources: IncomeSource[];
}

export interface CreateIncomeSourceRequest {
  name: string;
  amount: string;
  currency: Currency;
  frequency: IncomeFrequency;
  statutoryBonus: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CreateIncomeSourceResponse {
  incomeSource: IncomeSource;
}

export interface CreateTransactionRequest {
  transactionDate: string;
  description: string;
  categoryId: string;
  accountId: string;
  transactionType: TransactionType;
  amount: string;
  currency: Currency;
}

export interface CreateTransactionResponse {
  transaction: Transaction;
}

export function isCurrency(value: JsonValue | undefined): value is Currency {
  return value === CURRENCY.ARS || value === CURRENCY.USD;
}

export function isTransactionType(value: JsonValue | undefined): value is TransactionType {
  return value === TRANSACTION_TYPE.INCOME || value === TRANSACTION_TYPE.EXPENSE;
}

export function isTransactionSource(value: JsonValue | undefined): value is TransactionSource {
  return value === TRANSACTION_SOURCE.SEEDED || value === TRANSACTION_SOURCE.MANUAL || value === TRANSACTION_SOURCE.IMPORTED;
}

export function isSourceKind(value: JsonValue | undefined): value is SourceKind {
  return value === SOURCE_KIND.VISA_STATEMENT || value === SOURCE_KIND.MASTERCARD_STATEMENT || value === SOURCE_KIND.CARD_MOVEMENTS || value === SOURCE_KIND.MERCADO_PAGO_HISTORY;
}

export function isFundingMethod(value: JsonValue | undefined): value is FundingMethod {
  return value === FUNDING_METHOD.VISA_CREDIT || value === FUNDING_METHOD.MASTERCARD_CREDIT || value === FUNDING_METHOD.AVAILABLE_MONEY || value === FUNDING_METHOD.BANK_TRANSFER;
}

export function isSignedStatus(value: JsonValue | undefined): value is SignedStatus {
  return value === SIGNED_STATUS.POSITIVE || value === SIGNED_STATUS.NEGATIVE;
}

export function isSourceStatus(value: JsonValue | undefined): value is SourceStatus {
  return value === SOURCE_STATUS.APPROVED || value === SOURCE_STATUS.REJECTED || value === SOURCE_STATUS.RETURNED || value === SOURCE_STATUS.NOT_APPLICABLE;
}

export function isRecordKind(value: JsonValue | undefined): value is RecordKind {
  return value === RECORD_KIND.CARD_CHARGE || value === RECORD_KIND.FINANCIAL_COST || value === RECORD_KIND.PAYMENT || value === RECORD_KIND.LIABILITY || value === RECORD_KIND.INCOME || value === RECORD_KIND.REFUND || value === RECORD_KIND.REJECTED || value === RECORD_KIND.RETURNED || value === RECORD_KIND.PRIOR_BALANCE || value === RECORD_KIND.CASH_OUTFLOW || value === RECORD_KIND.REVIEW_CANDIDATE;
}

export function isReconciliationState(value: JsonValue | undefined): value is ReconciliationState {
  return value === RECONCILIATION_STATE.AUTHORITATIVE || value === RECONCILIATION_STATE.DUPLICATE || value === RECONCILIATION_STATE.AMBIGUOUS || value === RECONCILIATION_STATE.UNMATCHED || value === RECONCILIATION_STATE.REVIEW || value === RECONCILIATION_STATE.EXCLUDED || value === RECONCILIATION_STATE.NOT_APPLICABLE;
}

export function isCategoryKind(value: JsonValue | undefined): value is CategoryKind {
  return value === CATEGORY_KIND.INCOME || value === CATEGORY_KIND.EXPENSE;
}

export function isAccountKind(value: JsonValue | undefined): value is AccountKind {
  return value === ACCOUNT_KIND.CARD || value === ACCOUNT_KIND.BANK || value === ACCOUNT_KIND.CASH;
}

export function isMoneyTotals(value: JsonValue | object | undefined): value is MoneyTotals {
  return (
    isJsonObject(value) &&
    isInteger(getJsonValue(value, "ARS")) &&
    isInteger(getJsonValue(value, "USD"))
  );
}

export function isCategory(value: JsonValue | object | undefined): value is Category {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "name")) &&
    isCategoryKind(getJsonValue(value, "kind"))
  );
}

export function isAccount(value: JsonValue | object | undefined): value is Account {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "name")) &&
    isAccountKind(getJsonValue(value, "kind"))
  );
}

export function isTransaction(value: JsonValue | object | undefined): value is Transaction {
  return (
    isJsonObject(value) &&
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "transactionDate")) &&
    isString(getJsonValue(value, "description")) &&
    isString(getJsonValue(value, "categoryId")) &&
    isString(getJsonValue(value, "categoryName")) &&
    isString(getJsonValue(value, "accountId")) &&
    isString(getJsonValue(value, "accountName")) &&
    isTransactionType(getJsonValue(value, "transactionType")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isCurrency(getJsonValue(value, "currency")) &&
    isTransactionSource(getJsonValue(value, "source")) &&
    isNullableString(getJsonValue(value, "statementPeriod")) &&
    isNullableString(getJsonValue(value, "section")) &&
    isNullableSourceKind(getJsonValue(value, "sourceKind")) &&
    isNullableString(getJsonValue(value, "sourceFilePath")) &&
    isNullableString(getJsonValue(value, "sourceLocator")) &&
    isNullableInteger(getJsonValue(value, "installmentCurrent")) &&
    isNullableInteger(getJsonValue(value, "installmentTotal")) &&
    isNullableReconciliationState(getJsonValue(value, "reconciliationState"))
  );
}

function isNullableString(value: JsonValue | undefined): value is string | null {
  return value === null || isString(value);
}

function isNullableInteger(value: JsonValue | undefined): value is number | null {
  return value === null || isInteger(value);
}

function isNullableSourceKind(value: JsonValue | undefined): value is SourceKind | null {
  return value === null || isSourceKind(value);
}

function isNullableReconciliationState(value: JsonValue | undefined): value is ReconciliationState | null {
  return value === null || isReconciliationState(value);
}

export function isCategoryTotal(value: JsonValue | object | undefined): value is CategoryTotal {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "categoryId")) &&
    isString(getJsonValue(value, "categoryName")) &&
    isCurrency(getJsonValue(value, "currency")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isNumber(getJsonValue(value, "percentage")) &&
    isInteger(getJsonValue(value, "transactionCount"))
  );
}

export function isStatementCycleDates(value: JsonValue | object | undefined): value is StatementCycleDates {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "openedOn")) &&
    isString(getJsonValue(value, "closedOn")) &&
    isString(getJsonValue(value, "dueOn"))
  );
}

function isNullableStatementCycleDates(value: JsonValue | object | undefined): value is StatementCycleDates | null {
  return value === null || isStatementCycleDates(value);
}

export function isStatementBalance(value: JsonValue | object | undefined): value is StatementBalance {
  if (!isJsonObject(value)) {
    return false;
  }

  const minimumPayment = getJsonValue(value, "minimumPaymentMinor");

  return (
    isString(getJsonValue(value, "accountId")) &&
    isString(getJsonValue(value, "accountName")) &&
    isString(getJsonValue(value, "period")) &&
    isString(getJsonValue(value, "openedOn")) &&
    isString(getJsonValue(value, "closedOn")) &&
    isString(getJsonValue(value, "dueOn")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isInteger(getJsonValue(value, "amountUsdMinor")) &&
    (minimumPayment === null || isInteger(minimumPayment))
  );
}

function isStatementBalanceList(value: JsonValue | object | undefined): value is StatementBalance[] {
  return Array.isArray(value) && value.every(isStatementBalance);
}

export function isSummary(value: JsonValue | object): value is Summary {
  if (!isJsonObject(value)) {
    return false;
  }

  const categoryTotals = getJsonValue(value, "categoryTotals");
  const uncategorized = getJsonValue(value, "uncategorized");

  return (
    isString(getJsonValue(value, "month")) &&
    isMoneyTotals(getJsonValue(value, "income")) &&
    isMoneyTotals(getJsonValue(value, "recurringIncome")) &&
    isMoneyTotals(getJsonValue(value, "oneOffIncome")) &&
    isMoneyTotals(getJsonValue(value, "cardCharges")) &&
    isMoneyTotals(getJsonValue(value, "financialCosts")) &&
    isMoneyTotals(getJsonValue(value, "cycleResult")) &&
    isMoneyTotals(getJsonValue(value, "statementDebt")) &&
    isStatementBalanceList(getJsonValue(value, "statementBalances")) &&
    isNullableStatementCycleDates(getJsonValue(value, "cycle")) &&
    Array.isArray(categoryTotals) &&
    categoryTotals.every(isCategoryTotal) &&
    isJsonObject(uncategorized) &&
    isMoneyTotals(getJsonValue(uncategorized, "totals")) &&
    isInteger(getJsonValue(uncategorized, "count")) &&
    isInteger(getJsonValue(value, "reviewQueueCount"))
  );
}

export function isTransactionListResponse(value: JsonValue | object): value is TransactionListResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const transactions = getJsonValue(value, "transactions");
  return Array.isArray(transactions) && transactions.every(isTransaction);
}

export function isSourceRecord(value: JsonValue | object | undefined): value is SourceRecord {
  return (
    isJsonObject(value) &&
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "sourceId")) &&
    isString(getJsonValue(value, "importKey")) &&
    isString(getJsonValue(value, "sourceFilePath")) &&
    isSourceKind(getJsonValue(value, "sourceKind")) &&
    isString(getJsonValue(value, "statementPeriod")) &&
    isString(getJsonValue(value, "sourceLocator")) &&
    isNullableString(getJsonValue(value, "transactionDate")) &&
    isString(getJsonValue(value, "section")) &&
    isString(getJsonValue(value, "description")) &&
    isNullableString(getJsonValue(value, "accountId")) &&
    isNullableFundingMethod(getJsonValue(value, "fundingMethod")) &&
    isSignedStatus(getJsonValue(value, "signedStatus")) &&
    isCurrency(getJsonValue(value, "currency")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isRecordKind(getJsonValue(value, "recordKind")) &&
    isSourceStatus(getJsonValue(value, "status")) &&
    isNullableInteger(getJsonValue(value, "installmentCurrent")) &&
    isNullableInteger(getJsonValue(value, "installmentTotal")) &&
    isReconciliationState(getJsonValue(value, "reconciliationState")) &&
    isNullableInteger(getJsonValue(value, "authoritativeSourceRecordId")) &&
    isNullableInteger(getJsonValue(value, "authoritativeTransactionId"))
  );
}

function isNullableFundingMethod(value: JsonValue | undefined): value is FundingMethod | null {
  return value === null || isFundingMethod(value);
}

export function isSourceRecordListResponse(value: JsonValue | object): value is SourceRecordListResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const records = getJsonValue(value, "records");
  return Array.isArray(records) && records.every(isSourceRecord);
}

export function isCategoriesResponse(value: JsonValue | object): value is CategoriesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const categories = getJsonValue(value, "categories");
  return Array.isArray(categories) && categories.every(isCategory);
}

export function isAccountsResponse(value: JsonValue | object): value is AccountsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const accounts = getJsonValue(value, "accounts");
  return Array.isArray(accounts) && accounts.every(isAccount);
}

export function isCreateTransactionResponse(value: JsonValue | object): value is CreateTransactionResponse {
  return isJsonObject(value) && isTransaction(getJsonValue(value, "transaction"));
}

export function isIncomeFrequency(value: JsonValue | undefined): value is IncomeFrequency {
  return value === INCOME_FREQUENCY.MONTHLY;
}

export function isIncomeSource(value: JsonValue | object | undefined): value is IncomeSource {
  if (!isJsonObject(value)) {
    return false;
  }

  const effectiveTo = getJsonValue(value, "effectiveTo");

  return (
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "name")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isCurrency(getJsonValue(value, "currency")) &&
    isIncomeFrequency(getJsonValue(value, "frequency")) &&
    typeof getJsonValue(value, "statutoryBonus") === "boolean" &&
    isString(getJsonValue(value, "effectiveFrom")) &&
    (effectiveTo === null || isString(effectiveTo))
  );
}

export function isIncomeSourcesResponse(value: JsonValue | object): value is IncomeSourcesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const incomeSources = getJsonValue(value, "incomeSources");
  return Array.isArray(incomeSources) && incomeSources.every(isIncomeSource);
}

export function isCreateIncomeSourceResponse(value: JsonValue | object): value is CreateIncomeSourceResponse {
  return isJsonObject(value) && isIncomeSource(getJsonValue(value, "incomeSource"));
}
