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
  /** The documented import format, produced by hand or by somebody else's script. */
  CSV: "csv",
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
  /** Null for a group or a standalone leaf. Transactions attach to leaves only. */
  parentId: string | null;
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
  parentId: string | null;
  parentName: string | null;
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

export interface CommittedInstallmentsResponse {
  installments: CommittedInstallment[];
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
  /**
   * Spending that never touched a card: cash withdrawn or transferred out of the
   * payment account. Reported apart because it is invisible on a statement, and
   * a cycle result that ignored it would flatter every cycle that used it.
   */
  otherSpending: MoneyTotals;
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

/** A merchant still to categorise, with what categorising it would settle. */
/** One charge as the statement printed it, for recognising a merchant by eye. */
export interface MerchantCharge {
  id: number;
  transactionDate: string;
  statementPeriod: string | null;
  description: string;
  amountMinor: number;
  accountId: string;
  /** The transfer before the gateway fee, when the charge shows signs of carrying one. */
  transferBaseMinor: number | null;
}

export interface UncategorizedMerchant {
  merchantKey: string;
  sampleDescription: string;
  transactionCount: number;
  amountMinor: number;
  currency: Currency;
  firstSeen: string;
  lastSeen: string;
  charges: MerchantCharge[];
}

export interface UncategorizedMerchantsResponse {
  merchants: UncategorizedMerchant[];
}

/** What a cycle has left once everything already decided is paid for. */
export interface MonthlyBaseline {
  period: string;
  recurringIncomeMinor: number;
  recurringSpendingMinor: number;
  detectedRecurringSpendingMinor: number;
  declaredCommitmentsMinor: number;
  displacedSpendingMinor: number;
  recurringMerchantCount: number;
  committedInstallmentsMinor: number;
  financingCostMinor: number;
  availableMinor: number;
  financingBasis: "derived-from-balance" | "observed" | "unavailable";
  effectiveMonthlyRateMilli: number | null;
}

export interface BaselineResponse {
  baselines: MonthlyBaseline[];
}

export interface PayoffLever {
  leverKey: string;
  label: string;
  categoryId: string;
  perCycleMinor: number;
  cyclesToClear: number | null;
  cyclesSaved: number | null;
  interestSavedMinor: number;
  amountStability: string;
}

export interface LeverSensitivity {
  extraPerCycleMinor: number;
  cyclesToClear: number | null;
  neverClears: boolean;
  extraInterestMinor: number;
}

export interface PayoffLeversResponse {
  baselineCyclesToClear: number | null;
  baselineInterestMinor: number;
  levers: PayoffLever[];
  sensitivity: LeverSensitivity[];
}

export type PaymentPolicy = "maximum" | "minimum" | "fixed";

export interface PayoffCycle {
  period: string;
  openingMinor: number;
  committedInstallmentsMinor: number;
  newChargesMinor: number;
  declaredCommitmentsMinor: number;
  displacedSpendingMinor: number;
  paymentMinor: number;
  financingCostMinor: number;
  closingMinor: number;
  paymentCoversInterest: boolean;
}

export interface PayoffProjection {
  cycles: PayoffCycle[];
  openingBalanceMinor: number;
  effectiveMonthlyRateMilli: number;
  policy: PaymentPolicy;
  clearedInPeriod: string | null;
  cyclesToClear: number | null;
  totalFinancingCostMinor: number;
  totalPaidMinor: number;
  neverClears: boolean;
  assumedIncomePerCycleMinor: number;
  assumedRecurringSpendingMinor: number;
  commitmentsApplied: boolean;
}

export interface PayoffResponse {
  maximum: PayoffProjection;
  minimum: PayoffProjection;
}

export type CycleAnomalyKind = "catch-up" | "step-up" | "step-down" | "spike";

/** Why one cycle of a recurring cost does not look like the others. */
export interface CycleAnomaly {
  patternKey: string;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  period: string;
  amountMinor: number;
  typicalMinor: number;
  ratioPercent: number;
  kind: CycleAnomalyKind;
  missingBefore: string | null;
  understatedByMinor: number;
  chargeCount: number;
  largestChargeMinor: number;
}

export interface AnomaliesResponse {
  anomalies: CycleAnomaly[];
}

/** A rate stated by hand, for a day it was stated for. */
export interface ExchangeRate {
  id: number;
  quoteCurrency: string;
  rateMinor: number;
  asOf: string;
  note: string | null;
  createdAt: string;
}

export interface ForeignCycle {
  period: string;
  currency: string;
  amountMinor: number;
  transactionCount: number;
  convertedArsMinor: number | null;
  rateMinor: number | null;
  rateAsOf: string | null;
}

export interface ForeignSpendingSummary {
  cycles: ForeignCycle[];
  totalAmountMinor: number;
  convertedArsMinor: number;
  unconvertedCycles: number;
  typicalConvertedArsMinor: number;
  latest: ExchangeRate | null;
}

export interface ExchangeRatesResponse {
  rates: ExchangeRate[];
  foreign: ForeignSpendingSummary;
}

export interface ExchangeRateResponse {
  rate: ExchangeRate;
}

/** What food cost in one cycle, split by where it was eaten. */
export interface FoodCycle {
  period: string;
  homeMinor: number;
  outMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  commissionMinor: number;
  valueMinor: number;
  isComplete: boolean;
}

export interface FoodResponse {
  cycles: FoodCycle[];
  medianValueMinor: number;
  averageValueMinor: number;
  bestValueMinor: number;
  worstValueMinor: number;
  worstOverBestPercent: number;
  shareOfIncomePercent: number;
  totalCommissionMinor: number;
  targetMinor: number | null;
  targetFromPeriod: string | null;
  targetLabel: string | null;
}

/** What one cycle actually cost, split by whether it was already decided. */
export interface CycleScore {
  period: string;
  totalMinor: number;
  committedMinor: number;
  installmentsMinor: number;
  variableMinor: number;
  variableSharePercent: number;
  isComplete: boolean;
}

export interface ScorecardResponse {
  cycles: CycleScore[];
  typicalVariableMinor: number;
  averageVariableMinor: number;
  worstVariableMinor: number;
  bestVariableMinor: number;
  cyclesAtZeroVariable: number | null;
  clearedAtZeroVariable: string | null;
  interestAtZeroVariableMinor: number;
  openingBalanceMinor: number;
  cyclesAtTypicalVariable: number | null;
  interestAtTypicalVariableMinor: number;
  neverClearsAtTypicalVariable: boolean;
  costOfDriftMinor: number;
}

/** A written fact about how the money is handled, carrying no number. */
export interface PlanNote {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanNotesResponse {
  notes: PlanNote[];
}

export interface PlanNoteResponse {
  note: PlanNote;
}

export type CommitmentEffect = "addition" | "override" | "substitution" | "termination";

export const COMMITMENT_EFFECT = {
  ADDITION: "addition",
  OVERRIDE: "override",
  SUBSTITUTION: "substitution",
  TERMINATION: "termination",
} as const satisfies Record<string, CommitmentEffect>;

/** A cost the owner states, with how it meets what the detector already found. */
export interface Commitment {
  id: number;
  label: string;
  amountMinor: number;
  currency: string;
  effect: CommitmentEffect;
  merchantKey: string | null;
  categoryId: string | null;
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
  replacedCategoryIds: string[];
}

export interface CommitmentLine {
  id: number;
  label: string;
  effect: CommitmentEffect;
  chargedMinor: number;
  wouldChargeMinor: number;
  displacedMinor: number;
  netMinor: number;
  displacedKeys: string[];
  applies: boolean;
  skippedReason: "not-yet" | "ended" | "currency-not-projected" | null;
}

export interface ResolvedCommitments {
  period: string;
  chargedMinor: number;
  displacedMinor: number;
  netMinor: number;
  lines: CommitmentLine[];
}

export interface CommitmentsResponse {
  commitments: Commitment[];
  resolved: ResolvedCommitments;
}

export interface CommitmentResponse {
  commitment: Commitment;
}

export interface DeletedResponse {
  deleted: number;
}

export type Recurrence = "recurring" | "intermittent" | "one-off";
export type AmountStability = "stable" | "variable" | "erratic";

/** How one cost behaves across cycles: a commitment, or a choice. */
export interface SpendingPattern {
  /** Merchant plus category. One merchant can carry two unrelated costs. */
  patternKey: string;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  recurrence: Recurrence;
  amountStability: AmountStability;
  cyclesPresent: number;
  cyclesSpanned: number;
  firstCycle: string;
  lastCycle: string;
  transactionCount: number;
  totalMinor: number;
  averagePerCycleMinor: number;
  typicalPerCycleMinor: number;
  spreadPercent: number;
  drivenByInstallments: boolean;
  isActive: boolean;
}

export interface CommittedCostSummary {
  recurringPerCycleMinor: number;
  recurringMerchantCount: number;
  lapsedPerCycleMinor: number;
  intermittentPerCycleMinor: number;
  oneOffPerCycleMinor: number;
  installmentDrivenPerCycleMinor: number;
  cyclesOnRecord: number;
}

export interface SpendingPatternsResponse {
  patterns: SpendingPattern[];
  committedCost: CommittedCostSummary;
}

/** Two spellings the owner confirmed mean one merchant, and why. */
export interface MerchantAlias {
  aliasKey: string;
  canonicalKey: string;
  reason: string;
  createdAt: string;
  transactionCount: number;
}

export interface MerchantAliasesResponse {
  merchantAliases: MerchantAlias[];
}

export interface RevokedAliasResponse {
  aliasKey: string;
  canonicalKey: string;
  repointed: number;
  applied: number;
}

export interface ClearedCategoryResponse {
  cleared: number;
  applied: number;
}

export interface MerchantRule {
  id: number;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  createdAt: string;
  transactionCount: number;
  amountMinor: number;
}

export interface MerchantRulesResponse {
  merchantRules: MerchantRule[];
}

export interface CreateMerchantRuleRequest {
  merchant: string;
  categoryId: string;
}

export interface CreateMerchantRuleResponse {
  merchantKey: string;
  /** Transactions the rule categorised, which is what makes the work feel worth it. */
  applied: number;
}

export interface CategoriesResponse {
  categories: Category[];
}

/** The cycles that have data, newest first. Empty when nothing has been imported. */
export interface PeriodsResponse {
  periods: string[];
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
  return (
    value === SOURCE_KIND.VISA_STATEMENT
    || value === SOURCE_KIND.MASTERCARD_STATEMENT
    || value === SOURCE_KIND.CARD_MOVEMENTS
    || value === SOURCE_KIND.MERCADO_PAGO_HISTORY
    || value === SOURCE_KIND.CSV
  );
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
  const parentId = isJsonObject(value) ? getJsonValue(value, "parentId") : undefined;

  return (
    isJsonObject(value) &&
    (parentId === null || isString(parentId)) &&
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

export function isCommittedInstallment(value: JsonValue | object | undefined): value is CommittedInstallment {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "accountId")) &&
    isString(getJsonValue(value, "accountName")) &&
    isString(getJsonValue(value, "duePeriod")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    typeof getJsonValue(value, "openEnded") === "boolean"
  );
}

export function isCommittedInstallmentsResponse(value: JsonValue | object): value is CommittedInstallmentsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const installments = getJsonValue(value, "installments");
  return Array.isArray(installments) && installments.every(isCommittedInstallment);
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
    isMoneyTotals(getJsonValue(value, "otherSpending")) &&
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

export function isPeriodsResponse(value: JsonValue | object): value is PeriodsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const periods = getJsonValue(value, "periods");
  return Array.isArray(periods) && periods.every(isString);
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

export function isUncategorizedMerchant(value: JsonValue | object | undefined): value is UncategorizedMerchant {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "merchantKey")) &&
    isString(getJsonValue(value, "sampleDescription")) &&
    isInteger(getJsonValue(value, "transactionCount")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isCurrency(getJsonValue(value, "currency")) &&
    isString(getJsonValue(value, "firstSeen")) &&
    isString(getJsonValue(value, "lastSeen")) &&
    Array.isArray(getJsonValue(value, "charges"))
  );
}

export function isUncategorizedMerchantsResponse(value: JsonValue | object): value is UncategorizedMerchantsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const merchants = getJsonValue(value, "merchants");
  return Array.isArray(merchants) && merchants.every(isUncategorizedMerchant);
}

export function isCreateMerchantRuleResponse(value: JsonValue | object): value is CreateMerchantRuleResponse {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "merchantKey")) &&
    isInteger(getJsonValue(value, "applied"))
  );
}

function isRecurrence(value: JsonValue | undefined): value is Recurrence {
  return value === "recurring" || value === "intermittent" || value === "one-off";
}

function isAmountStability(value: JsonValue | undefined): value is AmountStability {
  return value === "stable" || value === "variable" || value === "erratic";
}

function isPayoffProjection(value: JsonValue | object | undefined): value is PayoffProjection {
  if (!isJsonObject(value)) {
    return false;
  }

  const cycles = getJsonValue(value, "cycles");
  const cleared = getJsonValue(value, "clearedInPeriod");
  return (
    Array.isArray(cycles) &&
    isInteger(getJsonValue(value, "openingBalanceMinor")) &&
    isInteger(getJsonValue(value, "effectiveMonthlyRateMilli")) &&
    isInteger(getJsonValue(value, "totalFinancingCostMinor")) &&
    typeof getJsonValue(value, "neverClears") === "boolean" &&
    (cleared === null || isString(cleared))
  );
}

export function isPayoffLeversResponse(value: JsonValue | object): value is PayoffLeversResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const levers = getJsonValue(value, "levers");
  const sensitivity = getJsonValue(value, "sensitivity");
  return (
    Array.isArray(levers) &&
    Array.isArray(sensitivity) &&
    isInteger(getJsonValue(value, "baselineInterestMinor"))
  );
}

export function isPayoffResponse(value: JsonValue | object): value is PayoffResponse {
  return (
    isJsonObject(value) &&
    isPayoffProjection(getJsonValue(value, "maximum")) &&
    isPayoffProjection(getJsonValue(value, "minimum"))
  );
}

export function isMonthlyBaseline(value: JsonValue | object | undefined): value is MonthlyBaseline {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "period")) &&
    isInteger(getJsonValue(value, "recurringIncomeMinor")) &&
    isInteger(getJsonValue(value, "recurringSpendingMinor")) &&
    isInteger(getJsonValue(value, "committedInstallmentsMinor")) &&
    isInteger(getJsonValue(value, "financingCostMinor")) &&
    isInteger(getJsonValue(value, "availableMinor"))
  );
}

export function isBaselineResponse(value: JsonValue | object): value is BaselineResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const baselines = getJsonValue(value, "baselines");
  return Array.isArray(baselines) && baselines.every(isMonthlyBaseline);
}

export function isSpendingPattern(value: JsonValue | object | undefined): value is SpendingPattern {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "merchantKey")) &&
    isString(getJsonValue(value, "categoryId")) &&
    isRecurrence(getJsonValue(value, "recurrence")) &&
    isAmountStability(getJsonValue(value, "amountStability")) &&
    isInteger(getJsonValue(value, "typicalPerCycleMinor")) &&
    typeof getJsonValue(value, "drivenByInstallments") === "boolean" &&
    typeof getJsonValue(value, "isActive") === "boolean"
  );
}

export function isSpendingPatternsResponse(value: JsonValue | object): value is SpendingPatternsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const patterns = getJsonValue(value, "patterns");
  const committedCost = getJsonValue(value, "committedCost");
  return (
    Array.isArray(patterns) &&
    patterns.every(isSpendingPattern) &&
    isJsonObject(committedCost) &&
    isInteger(getJsonValue(committedCost, "recurringPerCycleMinor"))
  );
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

export function isPlanNote(value: JsonValue | object | undefined): value is PlanNote {
  return (
    isJsonObject(value) &&
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "title")) &&
    isString(getJsonValue(value, "body")) &&
    typeof getJsonValue(value, "pinned") === "boolean" &&
    isString(getJsonValue(value, "createdAt")) &&
    isString(getJsonValue(value, "updatedAt"))
  );
}

export function isPlanNotesResponse(value: JsonValue | object): value is PlanNotesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const notes = getJsonValue(value, "notes");
  return Array.isArray(notes) && notes.every(isPlanNote);
}

export function isPlanNoteResponse(value: JsonValue | object): value is PlanNoteResponse {
  return isJsonObject(value) && isPlanNote(getJsonValue(value, "note"));
}

function isCommitmentEffect(value: JsonValue | undefined): value is CommitmentEffect {
  return (
    value === "addition"
    || value === "override"
    || value === "substitution"
    || value === "termination"
  );
}

export function isCommitment(value: JsonValue | object | undefined): value is Commitment {
  if (!isJsonObject(value)) {
    return false;
  }

  const merchantKey = getJsonValue(value, "merchantKey");
  const effectiveTo = getJsonValue(value, "effectiveTo");
  const note = getJsonValue(value, "note");
  const replaced = getJsonValue(value, "replacedCategoryIds");
  return (
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "label")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isString(getJsonValue(value, "currency")) &&
    isCommitmentEffect(getJsonValue(value, "effect")) &&
    isInteger(getJsonValue(value, "feeMilli")) &&
    isString(getJsonValue(value, "effectiveFrom")) &&
    isString(getJsonValue(value, "createdAt")) &&
    (merchantKey === null || isString(merchantKey)) &&
    (effectiveTo === null || isString(effectiveTo)) &&
    (note === null || isString(note)) &&
    Array.isArray(replaced) &&
    replaced.every(isString)
  );
}

function isCommitmentLine(value: JsonValue | object | undefined): value is CommitmentLine {
  if (!isJsonObject(value)) {
    return false;
  }

  const displaced = getJsonValue(value, "displacedKeys");
  const skipped = getJsonValue(value, "skippedReason");
  return (
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "label")) &&
    isCommitmentEffect(getJsonValue(value, "effect")) &&
    /*
     * Validated because the panel interpolates it into a translation key. An
     * unchecked value renders as the literal key text, which reads like a label.
     */
    (skipped === null
      || skipped === "not-yet"
      || skipped === "ended"
      || skipped === "currency-not-projected") &&
    isInteger(getJsonValue(value, "chargedMinor")) &&
    isInteger(getJsonValue(value, "displacedMinor")) &&
    isInteger(getJsonValue(value, "netMinor")) &&
    typeof getJsonValue(value, "applies") === "boolean" &&
    Array.isArray(displaced) &&
    displaced.every(isString)
  );
}

function isResolvedCommitments(value: JsonValue | object | undefined): value is ResolvedCommitments {
  if (!isJsonObject(value)) {
    return false;
  }

  const lines = getJsonValue(value, "lines");
  return (
    isString(getJsonValue(value, "period")) &&
    isInteger(getJsonValue(value, "chargedMinor")) &&
    isInteger(getJsonValue(value, "displacedMinor")) &&
    isInteger(getJsonValue(value, "netMinor")) &&
    Array.isArray(lines) &&
    lines.every(isCommitmentLine)
  );
}

export function isCommitmentsResponse(value: JsonValue | object): value is CommitmentsResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const commitments = getJsonValue(value, "commitments");
  return (
    Array.isArray(commitments) &&
    commitments.every(isCommitment) &&
    isResolvedCommitments(getJsonValue(value, "resolved"))
  );
}

export function isCommitmentResponse(value: JsonValue | object): value is CommitmentResponse {
  return isJsonObject(value) && isCommitment(getJsonValue(value, "commitment"));
}

export function isDeletedResponse(value: JsonValue | object): value is DeletedResponse {
  return isJsonObject(value) && isInteger(getJsonValue(value, "deleted"));
}

function isCycleScore(value: JsonValue | object | undefined): value is CycleScore {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "period")) &&
    isInteger(getJsonValue(value, "totalMinor")) &&
    isInteger(getJsonValue(value, "committedMinor")) &&
    isInteger(getJsonValue(value, "installmentsMinor")) &&
    isInteger(getJsonValue(value, "variableMinor")) &&
    isInteger(getJsonValue(value, "variableSharePercent")) &&
    typeof getJsonValue(value, "isComplete") === "boolean"
  );
}

export function isScorecardResponse(value: JsonValue | object): value is ScorecardResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const cycles = getJsonValue(value, "cycles");
  const atZero = getJsonValue(value, "cyclesAtZeroVariable");
  const atTypical = getJsonValue(value, "cyclesAtTypicalVariable");
  return (
    Array.isArray(cycles) &&
    cycles.every(isCycleScore) &&
    isInteger(getJsonValue(value, "typicalVariableMinor")) &&
    isInteger(getJsonValue(value, "costOfDriftMinor")) &&
    (atZero === null || isInteger(atZero)) &&
    (atTypical === null || isInteger(atTypical))
  );
}

function isFoodCycle(value: JsonValue | object | undefined): value is FoodCycle {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "period")) &&
    isInteger(getJsonValue(value, "homeMinor")) &&
    isInteger(getJsonValue(value, "outMinor")) &&
    isInteger(getJsonValue(value, "deliveryMinor")) &&
    isInteger(getJsonValue(value, "totalMinor")) &&
    isInteger(getJsonValue(value, "commissionMinor")) &&
    isInteger(getJsonValue(value, "valueMinor")) &&
    typeof getJsonValue(value, "isComplete") === "boolean"
  );
}

export function isFoodResponse(value: JsonValue | object): value is FoodResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const cycles = getJsonValue(value, "cycles");
  return (
    Array.isArray(cycles) &&
    cycles.every(isFoodCycle) &&
    isInteger(getJsonValue(value, "medianValueMinor")) &&
    isInteger(getJsonValue(value, "shareOfIncomePercent")) &&
    isInteger(getJsonValue(value, "totalCommissionMinor"))
  );
}

function isExchangeRate(value: JsonValue | object | undefined): value is ExchangeRate {
  if (!isJsonObject(value)) {
    return false;
  }

  const note = getJsonValue(value, "note");
  return (
    isInteger(getJsonValue(value, "id")) &&
    isString(getJsonValue(value, "quoteCurrency")) &&
    isInteger(getJsonValue(value, "rateMinor")) &&
    isString(getJsonValue(value, "asOf")) &&
    isString(getJsonValue(value, "createdAt")) &&
    (note === null || isString(note))
  );
}

function isForeignCycle(value: JsonValue | object | undefined): value is ForeignCycle {
  if (!isJsonObject(value)) {
    return false;
  }

  const converted = getJsonValue(value, "convertedArsMinor");
  const rate = getJsonValue(value, "rateMinor");
  const asOf = getJsonValue(value, "rateAsOf");
  return (
    isString(getJsonValue(value, "period")) &&
    isString(getJsonValue(value, "currency")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isInteger(getJsonValue(value, "transactionCount")) &&
    (converted === null || isInteger(converted)) &&
    (rate === null || isInteger(rate)) &&
    (asOf === null || isString(asOf))
  );
}

export function isExchangeRatesResponse(value: JsonValue | object): value is ExchangeRatesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const rates = getJsonValue(value, "rates");
  const foreign = getJsonValue(value, "foreign");
  if (!Array.isArray(rates) || !rates.every(isExchangeRate) || !isJsonObject(foreign)) {
    return false;
  }

  const cycles = getJsonValue(foreign, "cycles");
  const latest = getJsonValue(foreign, "latest");
  return (
    Array.isArray(cycles) &&
    cycles.every(isForeignCycle) &&
    isInteger(getJsonValue(foreign, "totalAmountMinor")) &&
    isInteger(getJsonValue(foreign, "convertedArsMinor")) &&
    isInteger(getJsonValue(foreign, "unconvertedCycles")) &&
    isInteger(getJsonValue(foreign, "typicalConvertedArsMinor")) &&
    (latest === null || isExchangeRate(latest))
  );
}

export function isExchangeRateResponse(value: JsonValue | object): value is ExchangeRateResponse {
  return isJsonObject(value) && isExchangeRate(getJsonValue(value, "rate"));
}

function isCycleAnomalyKind(value: JsonValue | undefined): value is CycleAnomalyKind {
  return value === "catch-up" || value === "step-up" || value === "step-down" || value === "spike";
}

function isCycleAnomaly(value: JsonValue | object | undefined): value is CycleAnomaly {
  if (!isJsonObject(value)) {
    return false;
  }

  const missingBefore = getJsonValue(value, "missingBefore");
  return (
    isString(getJsonValue(value, "patternKey")) &&
    isString(getJsonValue(value, "merchantKey")) &&
    isString(getJsonValue(value, "categoryId")) &&
    isString(getJsonValue(value, "period")) &&
    isInteger(getJsonValue(value, "amountMinor")) &&
    isInteger(getJsonValue(value, "typicalMinor")) &&
    isInteger(getJsonValue(value, "ratioPercent")) &&
    isCycleAnomalyKind(getJsonValue(value, "kind")) &&
    isInteger(getJsonValue(value, "understatedByMinor")) &&
    isInteger(getJsonValue(value, "chargeCount")) &&
    isInteger(getJsonValue(value, "largestChargeMinor")) &&
    (missingBefore === null || isString(missingBefore))
  );
}

export function isAnomaliesResponse(value: JsonValue | object): value is AnomaliesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const anomalies = getJsonValue(value, "anomalies");
  return Array.isArray(anomalies) && anomalies.every(isCycleAnomaly);
}

function isMerchantAlias(value: JsonValue | object | undefined): value is MerchantAlias {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "aliasKey")) &&
    isString(getJsonValue(value, "canonicalKey")) &&
    isString(getJsonValue(value, "reason")) &&
    isString(getJsonValue(value, "createdAt")) &&
    isInteger(getJsonValue(value, "transactionCount"))
  );
}

export function isMerchantAliasesResponse(value: JsonValue | object): value is MerchantAliasesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const aliases = getJsonValue(value, "merchantAliases");
  return Array.isArray(aliases) && aliases.every(isMerchantAlias);
}

export function isMerchantRulesResponse(value: JsonValue | object): value is MerchantRulesResponse {
  if (!isJsonObject(value)) {
    return false;
  }

  const rules = getJsonValue(value, "merchantRules");
  return (
    Array.isArray(rules) &&
    rules.every(
      (rule) =>
        isJsonObject(rule) &&
        isString(getJsonValue(rule, "merchantKey")) &&
        isString(getJsonValue(rule, "categoryId")),
    )
  );
}

export function isRevokedAliasResponse(value: JsonValue | object): value is RevokedAliasResponse {
  return (
    isJsonObject(value) &&
    isString(getJsonValue(value, "aliasKey")) &&
    isInteger(getJsonValue(value, "repointed"))
  );
}

export function isClearedCategoryResponse(value: JsonValue | object): value is ClearedCategoryResponse {
  return isJsonObject(value) && isInteger(getJsonValue(value, "cleared"));
}
