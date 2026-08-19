import { normalizeMerchant } from "../shared/merchants";
import type { SqliteDatabase } from "./database";

/**
 * Two spellings the owner has confirmed mean one merchant.
 *
 * Needed because the normaliser cannot derive this: two issuers clip the same
 * counterparty name at different lengths, and deciding that a shared prefix is
 * one person is a judgement about someone's identity rather than a formatting
 * rule. Every link carries the reason it was made, so a later reader can weigh
 * the decision instead of trusting it.
 */
export interface MerchantAlias {
  aliasKey: string;
  canonicalKey: string;
  reason: string;
  createdAt: string;
  transactionCount: number;
}

export function listMerchantAliases(database: SqliteDatabase): MerchantAlias[] {
  return database
    .prepare<[], MerchantAlias>(
      `SELECT
        a.alias_key AS aliasKey,
        a.canonical_key AS canonicalKey,
        a.reason,
        a.created_at AS createdAt,
        (SELECT COUNT(*) FROM transactions t WHERE t.merchant_key = a.canonical_key) AS transactionCount
      FROM merchant_aliases a
      ORDER BY a.canonical_key, a.alias_key`,
    )
    .all();
}

/**
 * Links a spelling to a canonical merchant and repoints the rows that carried it.
 *
 * Chains are rejected rather than followed: if the canonical key is itself an
 * alias, resolving would depend on insertion order and a later edit could quietly
 * change what an earlier one meant.
 */
export function declareMerchantAlias(
  database: SqliteDatabase,
  alias: string,
  canonical: string,
  reason: string,
  createdAt: string,
): { aliasKey: string; canonicalKey: string; repointed: number } {
  const aliasKey = normalizeMerchant(alias);
  const canonicalKey = normalizeMerchant(canonical);

  if (aliasKey === canonicalKey) {
    throw new Error("An alias cannot point at itself.");
  }

  const existing = database
    .prepare<{ key: string }, { canonicalKey: string }>(
      "SELECT canonical_key AS canonicalKey FROM merchant_aliases WHERE alias_key = @key",
    )
    .get({ key: canonicalKey });
  if (existing !== undefined) {
    throw new Error("The canonical merchant is itself an alias; point at the canonical one instead.");
  }

  const run = database.transaction(() => {
    database
      .prepare<{ aliasKey: string; canonicalKey: string; reason: string; createdAt: string }, void>(
        `INSERT INTO merchant_aliases (alias_key, canonical_key, reason, created_at)
         VALUES (@aliasKey, @canonicalKey, @reason, @createdAt)
         ON CONFLICT (alias_key) DO UPDATE SET canonical_key = excluded.canonical_key, reason = excluded.reason`,
      )
      .run({ aliasKey, canonicalKey, reason, createdAt });

    return database
      .prepare<{ aliasKey: string; canonicalKey: string }, void>(
        "UPDATE transactions SET merchant_key = @canonicalKey WHERE merchant_key = @aliasKey",
      )
      .run({ aliasKey, canonicalKey }).changes;
  });

  return { aliasKey, canonicalKey, repointed: run() };
}
