import {
  ACCOUNT_KIND,
  CATEGORY_KIND,
  type Account,
  type Category,
  type Currency,
  type TransactionSource,
} from "../shared/types";

export const REFERENCE_DATA_SEED_VERSION = "2026-08-reference-data-v3";

export const SEED_CATEGORIES: Category[] = [
  { id: "income", name: "Income", kind: CATEGORY_KIND.INCOME },
  { id: "benefits", name: "Benefits", kind: CATEGORY_KIND.INCOME },
  { id: "existing-installments", name: "Existing installments", kind: CATEGORY_KIND.EXPENSE },
  { id: "utilities", name: "Utilities", kind: CATEGORY_KIND.EXPENSE },
  { id: "installment-purchases", name: "Installment purchases", kind: CATEGORY_KIND.EXPENSE },
  { id: "food", name: "Food and groceries", kind: CATEGORY_KIND.EXPENSE },
  { id: "shopping", name: "Shopping", kind: CATEGORY_KIND.EXPENSE },
  { id: "health", name: "Health", kind: CATEGORY_KIND.EXPENSE },
  { id: "entertainment", name: "Entertainment", kind: CATEGORY_KIND.EXPENSE },
  { id: "services", name: "Services", kind: CATEGORY_KIND.EXPENSE },
  { id: "transport", name: "Transport", kind: CATEGORY_KIND.EXPENSE },
  { id: "uncategorized", name: "Uncategorized", kind: CATEGORY_KIND.EXPENSE },
];

export const SEED_ACCOUNTS: Account[] = [
  { id: "main-income", name: "Main income", kind: ACCOUNT_KIND.BANK },
  { id: "benefits-account", name: "Benefits account", kind: ACCOUNT_KIND.BANK },
  { id: "visa", name: "Visa", kind: ACCOUNT_KIND.CARD },
  { id: "mastercard", name: "Mastercard", kind: ACCOUNT_KIND.CARD },
  { id: "bank-account", name: "Bank account", kind: ACCOUNT_KIND.BANK },
  { id: "cash", name: "Cash", kind: ACCOUNT_KIND.CASH },
];

export interface SeedLiability {
  description: string;
  accountId: string;
  dueDate: string;
  amountMinor: number;
  currency: Currency;
  status: "open";
  source: TransactionSource;
}

/**
 * Intentionally empty. This used to carry a hardcoded card balance, which was
 * wrong twice over: it reconciled with nothing in the statements, and shipping a
 * real debt figure in tracked code breaks the privacy boundary. Card debt now
 * lives in `statement_cycles`, declared per cycle from the statements themselves.
 *
 * The mechanism stays for liabilities that are genuinely reference data. Never
 * seed an amount that belongs to the owner.
 */
export const SEED_LIABILITIES: SeedLiability[] = [];
