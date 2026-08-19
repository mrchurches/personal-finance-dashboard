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

/**
 * One hop, because chains are rejected at declaration.
 *
 * Kept as a function rather than inlined so that revoking uses exactly the same
 * resolution as declaring: a row that reverts has to land where a fresh import would
 * have put it, or the two paths disagree about the same description.
 */
function resolveThroughAliases(database: SqliteDatabase, merchantKey: string): string {
  const row = database
    .prepare<{ key: string }, { canonicalKey: string }>(
      "SELECT canonical_key AS canonicalKey FROM merchant_aliases WHERE alias_key = @key",
    )
    .get({ key: merchantKey });

  return row?.canonicalKey ?? merchantKey;
}

/**
 * Undoes a declared alias and splits the rows that had been merged under it.
 *
 * Necessary because declaring one is a judgement about someone's identity, made from a
 * truncated string, and a wrong one is invisible afterwards: the rows simply sit under
 * the other name. Without a way back, every alias is a guess that can never be checked.
 *
 * The rows are recomputed from their descriptions rather than blindly reassigned to the
 * revoked key. Several aliases can point at one canonical merchant, so after removing
 * one the remaining ones still have to apply - and a description normalises to whatever
 * it normalises to, which is the only answer that matches what a fresh import would do.
 */
export function revokeMerchantAlias(
  database: SqliteDatabase,
  aliasKey: string,
): { aliasKey: string; canonicalKey: string; repointed: number } {
  const alias = database
    .prepare<{ key: string }, { canonicalKey: string }>(
      "SELECT canonical_key AS canonicalKey FROM merchant_aliases WHERE alias_key = @key",
    )
    .get({ key: aliasKey });
  if (alias === undefined) {
    throw new Error("That alias is not declared.");
  }

  const run = database.transaction(() => {
    database
      .prepare<{ key: string }, void>("DELETE FROM merchant_aliases WHERE alias_key = @key")
      .run({ key: aliasKey });

    const affected = database
      .prepare<{ canonicalKey: string }, { id: number; description: string; merchantKey: string }>(
        `SELECT id, description, merchant_key AS merchantKey
         FROM transactions WHERE merchant_key = @canonicalKey`,
      )
      .all({ canonicalKey: alias.canonicalKey });

    const update = database.prepare<{ id: number; merchantKey: string }, void>(
      "UPDATE transactions SET merchant_key = @merchantKey WHERE id = @id",
    );

    /*
     * A row that changes identity loses a category a rule gave it.
     *
     * Rules only ever assign, never withdraw, so without this the split rows kept the
     * category the merge had earned them - inferred from an identity that has just been
     * withdrawn, and now belonging to a merchant no rule covers. Releasing them puts the
     * question back in the queue, which is where a revoked guess belongs.
     *
     * A category set by hand survives: that was a decision about the charge, not about
     * who the merchant is.
     */
    const release = database.prepare<{ id: number }, void>(
      `UPDATE transactions
       SET category_id = 'uncategorized', category_source = NULL
       WHERE id = @id AND category_source = 'rule'`,
    );

    let repointed = 0;
    for (const row of affected) {
      const merchantKey = resolveThroughAliases(database, normalizeMerchant(row.description));
      if (merchantKey !== row.merchantKey) {
        update.run({ id: row.id, merchantKey });
        release.run({ id: row.id });
        repointed += 1;
      }
    }

    return repointed;
  });

  return { aliasKey, canonicalKey: alias.canonicalKey, repointed: run() };
}
