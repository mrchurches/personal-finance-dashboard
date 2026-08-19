import {
  ACCOUNT_KIND,
  CATEGORY_KIND,
  type Account,
  type Category,
  type Currency,
  type TransactionSource,
} from "../shared/types";

export const REFERENCE_DATA_SEED_VERSION = "2026-08-reference-data-v4";

/**
 * Two levels: a handful of groups whose split actually answers a question, and
 * leaves everywhere else. Transactions are always assigned to a leaf, so a group
 * total is the sum of its children and nothing is counted twice.
 *
 * Food and transport are grouped because "how much goes to food" is only useful
 * once eating at home, eating out and delivery are separable, and because fuel
 * behaves nothing like a bus fare. The rest stay flat until a real question
 * needs them split: an unused level of hierarchy is a cost, not a feature.
 *
 * `installment-purchases` and `existing-installments` are gone. An instalment is
 * a payment arrangement, not a kind of spending, and every row now carries its
 * own instalment counter, so a purchase is categorised by what was bought.
 *
 * Names are English here and translated in the UI by id, the same way domain
 * enums are. Categories the owner adds later keep whatever they are called.
 */
export const SEED_CATEGORIES: Category[] = [
  { id: "income", name: "Salary", kind: CATEGORY_KIND.INCOME, parentId: null },
  { id: "benefits", name: "Benefits", kind: CATEGORY_KIND.INCOME, parentId: null },
  { id: "income-other", name: "Other income", kind: CATEGORY_KIND.INCOME, parentId: null },

  { id: "food", name: "Food", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "food-home", name: "Groceries", kind: CATEGORY_KIND.EXPENSE, parentId: "food" },
  { id: "food-out", name: "Eating out", kind: CATEGORY_KIND.EXPENSE, parentId: "food" },
  { id: "food-delivery", name: "Delivery", kind: CATEGORY_KIND.EXPENSE, parentId: "food" },

  { id: "transport", name: "Transport", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "transport-fuel", name: "Fuel", kind: CATEGORY_KIND.EXPENSE, parentId: "transport" },
  { id: "transport-fares", name: "Fares and rides", kind: CATEGORY_KIND.EXPENSE, parentId: "transport" },
  { id: "transport-vehicle", name: "Vehicle upkeep", kind: CATEGORY_KIND.EXPENSE, parentId: "transport" },

  { id: "utilities", name: "Utilities", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "telecom", name: "Telecom and streaming", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "insurance", name: "Insurance", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "health", name: "Health", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  /*
   * Pet food deliberately sits outside the food tree. The food tree is what a
   * cash envelope replaces and what the food budget is measured against, so
   * folding pet food in would inflate the human figure and quietly assume the
   * envelope covers it. Kept apart, that stays a choice.
   */
  { id: "pets", name: "Pets", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "education", name: "Education", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "clothing", name: "Clothing", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "home", name: "Home and furnishing", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "subscriptions", name: "Subscriptions", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "entertainment", name: "Entertainment", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "shopping", name: "Shopping", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "services", name: "Services", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "transfers", name: "Transfers to people", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "debt-service", name: "Debt service", kind: CATEGORY_KIND.EXPENSE, parentId: null },
  { id: "uncategorized", name: "Uncategorized", kind: CATEGORY_KIND.EXPENSE, parentId: null },
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
