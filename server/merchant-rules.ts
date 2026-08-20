import { normalizeMerchant } from "../shared/merchants";
import type { SqliteDatabase } from "./database";
import { commissionInside } from "./gateway-commission";

const UNCATEGORIZED_ID = "uncategorized";

export interface MerchantRule {
  id: number;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  createdAt: string;
  /** Transactions the rule currently accounts for. */
  transactionCount: number;
  amountMinor: number;
}

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
  currency: string;
  firstSeen: string;
  lastSeen: string;
  charges: MerchantCharge[];
}

export function listMerchantRules(database: SqliteDatabase): MerchantRule[] {
  return database
    .prepare<[], MerchantRule>(
      `SELECT
        r.id,
        r.merchant_key AS merchantKey,
        r.category_id AS categoryId,
        c.name AS categoryName,
        r.created_at AS createdAt,
        COUNT(t.id) AS transactionCount,
        COALESCE(SUM(t.amount_minor), 0) AS amountMinor
      FROM merchant_rules r
      INNER JOIN categories c ON c.id = r.category_id
      LEFT JOIN transactions t ON t.merchant_key = r.merchant_key AND t.transaction_type = 'expense'
      GROUP BY r.id, r.merchant_key, r.category_id, c.name, r.created_at
      ORDER BY amountMinor DESC`,
    )
    .all();
}

/**
 * Creates or repoints a rule. The key is normalised on the way in so a rule
 * written against whatever spelling the owner happened to be looking at still
 * matches every other spelling of the same merchant.
 */
export function upsertMerchantRule(
  database: SqliteDatabase,
  merchant: string,
  categoryId: string,
  createdAt: string,
): string {
  const merchantKey = normalizeMerchant(merchant);

  database
    .prepare<{ merchantKey: string; categoryId: string; createdAt: string }, void>(
      `INSERT INTO merchant_rules (merchant_key, category_id, created_at)
       VALUES (@merchantKey, @categoryId, @createdAt)
       ON CONFLICT (merchant_key) DO UPDATE SET category_id = excluded.category_id`,
    )
    .run({ merchantKey, categoryId, createdAt });

  return merchantKey;
}

export function deleteMerchantRule(database: SqliteDatabase, merchantKey: string): number {
  const cleared = database
    .prepare<{ merchantKey: string }, void>(
      `UPDATE transactions
       SET category_id = '${UNCATEGORIZED_ID}', category_source = NULL
       WHERE merchant_key = @merchantKey AND category_source = 'rule'`,
    )
    .run({ merchantKey });

  database
    .prepare<{ merchantKey: string }, void>("DELETE FROM merchant_rules WHERE merchant_key = @merchantKey")
    .run({ merchantKey });

  return cleared.changes;
}

/**
 * Applies every rule to the transactions it matches.
 *
 * Touches only rows that are uncategorised or were categorised by a rule. A
 * category the owner set by hand is never overwritten: a rule may revise its own
 * work when it is repointed, but silently undoing a person's decision on the
 * next import would make the whole mechanism untrustworthy.
 */
export function applyMerchantRules(database: SqliteDatabase): number {
  const result = database
    .prepare(
      `UPDATE transactions
       SET category_id = (
             SELECT r.category_id FROM merchant_rules r WHERE r.merchant_key = transactions.merchant_key
           ),
           category_source = 'rule'
       WHERE transactions.transaction_type = 'expense'
         AND transactions.merchant_key IS NOT NULL
         AND (transactions.category_source IS NULL OR transactions.category_source = 'rule')
         AND EXISTS (
           SELECT 1 FROM merchant_rules r
           WHERE r.merchant_key = transactions.merchant_key
             AND r.category_id <> transactions.category_id
         )`,
    )
    .run();

  return result.changes;
}

interface ChargeRow {
  id: number;
  merchantKey: string;
  transactionDate: string;
  statementPeriod: string | null;
  description: string;
  amountMinor: number;
  accountId: string;
}

/**
 * The individual charges behind a merchant that still needs a category.
 *
 * The normalised key is what the rest of the system works with, and it is also almost
 * useless to a human: a truncated surname or a gateway prefix says nothing about what was
 * bought. Recognising a merchant means seeing what a person can actually recognise - when
 * it happened, how much, how often, and the description as the statement printed it.
 *
 * The gateway fee is reported per charge because it is the strongest available hint about
 * the KIND of counterparty. A charge that carries it was a transfer to an alias, which is
 * how people are paid; a charge without it was made at a till, which is how shops are.
 */
function chargesFor(database: SqliteDatabase, merchantKeys: string[]): Map<string, MerchantCharge[]> {
  if (merchantKeys.length === 0) {
    return new Map();
  }

  const placeholders = merchantKeys.map(() => "?").join(", ");
  const rows = database
    .prepare<string[], ChargeRow>(
      `SELECT
        id,
        merchant_key AS merchantKey,
        transaction_date AS transactionDate,
        statement_period AS statementPeriod,
        description,
        amount_minor AS amountMinor,
        account_id AS accountId
      FROM transactions
      WHERE merchant_key IN (${placeholders})
        AND transaction_type = 'expense'
      ORDER BY transaction_date DESC, id DESC`,
    )
    .all(...merchantKeys);

  const byMerchant = new Map<string, MerchantCharge[]>();
  for (const row of rows) {
    const fee = commissionInside(row.amountMinor);
    const charge: MerchantCharge = {
      id: row.id,
      transactionDate: row.transactionDate,
      statementPeriod: row.statementPeriod,
      description: row.description,
      amountMinor: row.amountMinor,
      accountId: row.accountId,
      transferBaseMinor: fee === null ? null : row.amountMinor - fee,
    };

    const existing = byMerchant.get(row.merchantKey);
    if (existing === undefined) {
      byMerchant.set(row.merchantKey, [charge]);
      continue;
    }
    existing.push(charge);
  }

  return byMerchant;
}

/**
 * What is left to categorise, heaviest first, since that is the order in which
 * the work actually pays off.
 *
 * The cap is high enough to cover the whole queue rather than a page of it. A limit
 * below the number of merchants is worse than no limit: the panel paginates what it
 * receives, so the tail simply never appears and nothing says it was cut.
 */
export function listUncategorizedMerchants(
  database: SqliteDatabase,
  limit = 500,
): UncategorizedMerchant[] {
  const merchants = database
    .prepare<{ limit: number }, Omit<UncategorizedMerchant, "charges">>(
      `SELECT
        merchant_key AS merchantKey,
        MIN(description) AS sampleDescription,
        COUNT(*) AS transactionCount,
        SUM(amount_minor) AS amountMinor,
        currency,
        MIN(COALESCE(statement_period, transaction_date)) AS firstSeen,
        MAX(COALESCE(statement_period, transaction_date)) AS lastSeen
      FROM transactions
      WHERE transaction_type = 'expense'
        AND category_id = '${UNCATEGORIZED_ID}'
        AND merchant_key IS NOT NULL
      GROUP BY merchant_key, currency
      ORDER BY amountMinor DESC
      LIMIT :limit`,
    )
    .all({ limit });

  const charges = chargesFor(database, merchants.map((merchant) => merchant.merchantKey));
  return merchants.map((merchant) => ({
    ...merchant,
    charges: charges.get(merchant.merchantKey) ?? [],
  }));
}
