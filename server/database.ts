import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REFERENCE_DATA_SEED_VERSION, SEED_ACCOUNTS, SEED_CATEGORIES, SEED_LIABILITIES, type SeedLiability } from "./seed";
import { normalizeMerchant } from "../shared/merchants";
import type { AccountKind, CategoryKind, Currency, TransactionSource } from "../shared/types";

export const DEFAULT_DATABASE_PATH = resolve(process.cwd(), "data", "finance.sqlite");

export type SqliteDatabase = Database.Database;

const LEGACY_AGGREGATE_SEED_VERSION = "2026-08-aggregate-baseline-v1";
const LEGACY_SEEDED_LIABILITY_VERSION = "2026-08-reference-data-v2";

const referenceSchema = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    -- Null for a group or a standalone leaf. One level deep on purpose.
    parent_id TEXT REFERENCES categories(id),
    CHECK (parent_id IS NULL OR parent_id <> id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('card', 'bank', 'cash'))
  );

  CREATE TABLE IF NOT EXISTS source_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    import_key TEXT NOT NULL UNIQUE,
    source_file_path TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('visa_statement', 'mastercard_statement', 'card_movements', 'mercado_pago_history')),
    statement_period TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    transaction_date TEXT,
    section TEXT NOT NULL,
    description TEXT NOT NULL,
    account_id TEXT REFERENCES accounts(id),
    funding_method TEXT CHECK (funding_method IS NULL OR funding_method IN ('visa_credit', 'mastercard_credit', 'available_money', 'bank_transfer')),
    signed_status TEXT NOT NULL CHECK (signed_status IN ('positive', 'negative')),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    record_kind TEXT NOT NULL CHECK (record_kind IN ('card_charge', 'financial_cost', 'payment', 'liability', 'income', 'refund', 'rejected', 'returned', 'prior_balance', 'cash_outflow', 'review_candidate')),
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'returned', 'not_applicable')),
    installment_current INTEGER,
    installment_total INTEGER,
    reconciliation_state TEXT NOT NULL CHECK (reconciliation_state IN ('authoritative', 'duplicate', 'ambiguous', 'unmatched', 'review', 'excluded', 'not_applicable')),
    authoritative_source_record_id INTEGER REFERENCES source_records(id),
    authoritative_transaction_id INTEGER,
    UNIQUE (source_kind, source_id),
    CHECK (
      (installment_current IS NULL AND installment_total IS NULL)
      OR (installment_current IS NOT NULL AND installment_total IS NOT NULL AND installment_current > 0 AND installment_total >= installment_current)
    )
  );

  CREATE TABLE IF NOT EXISTS liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    due_date TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    source TEXT NOT NULL CHECK (source IN ('seeded', 'manual'))
  );

  CREATE TABLE IF NOT EXISTS statement_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    period TEXT NOT NULL,
    opened_on TEXT NOT NULL,
    closed_on TEXT NOT NULL,
    due_on TEXT NOT NULL,
    -- NULL until the cycle closes: the dates of the running cycle are known in
    -- advance because each statement prints its successor, but its balance is not.
    closing_balance_minor INTEGER,
    closing_balance_usd_minor INTEGER NOT NULL DEFAULT 0,
    minimum_payment_minor INTEGER,
    -- Rates as integer thousandths of a percent: 7.172% is 7172. Kept exact
    -- rather than as a float, the same reason money is in minor units.
    tna_pesos_milli INTEGER,
    tem_pesos_milli INTEGER,
    tna_usd_milli INTEGER,
    tem_usd_milli INTEGER,
    source TEXT NOT NULL CHECK (source IN ('declared', 'imported')),
    UNIQUE (account_id, period),
    CHECK (closed_on > opened_on),
    CHECK (due_on >= closed_on)
  );

  CREATE TABLE IF NOT EXISTS committed_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    -- the statement that declared this projection
    statement_period TEXT NOT NULL,
    -- the month the amount falls due
    due_period TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    -- Visa prints a trailing "A partir de <month> $x": a monthly amount from that
    -- month onward, not a single month. Kept distinct instead of flattened.
    open_ended INTEGER NOT NULL DEFAULT 0 CHECK (open_ended IN (0, 1)),
    source TEXT NOT NULL CHECK (source IN ('declared', 'imported')),
    UNIQUE (account_id, statement_period, due_period)
  );

  CREATE TABLE IF NOT EXISTS income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    frequency TEXT NOT NULL CHECK (frequency IN ('monthly')),
    statutory_bonus INTEGER NOT NULL CHECK (statutory_bonus IN (0, 1)),
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
  );

  CREATE TABLE IF NOT EXISTS merchant_aliases (
    -- a normalised spelling that means the same merchant as canonical_key
    alias_key TEXT PRIMARY KEY,
    canonical_key TEXT NOT NULL,
    -- why they were linked, so a later reader can judge the decision
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (alias_key <> canonical_key)
  );

  CREATE TABLE IF NOT EXISTS merchant_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- normalised merchant, see shared/merchants.ts
    merchant_key TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL REFERENCES categories(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plan_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    -- kept at the top of the list, for the few that always matter
    pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    -- how the declared amount meets what the detector already found
    effect TEXT NOT NULL CHECK (effect IN ('addition', 'override', 'substitution', 'termination')),
    -- required by 'override' and 'termination': the merchant this speaks about
    merchant_key TEXT,
    -- narrows that merchant to one of its costs; null means all of them
    category_id TEXT REFERENCES categories(id),
    -- fee grossed into the charge rather than billed as a line, thousandths of a percent
    fee_milli INTEGER NOT NULL CHECK (fee_milli >= 0),
    -- periods, not dates: the cycle is the unit everywhere else in this tool
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (effect NOT IN ('override', 'termination') OR merchant_key IS NOT NULL)
  );

  CREATE TABLE IF NOT EXISTS commitment_replacements (
    commitment_id INTEGER NOT NULL REFERENCES commitments(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    PRIMARY KEY (commitment_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_currency TEXT NOT NULL CHECK (quote_currency IN ('USD')),
    -- minor units of ARS for one whole unit of the quoted currency
    rate_minor INTEGER NOT NULL CHECK (rate_minor > 0),
    -- the day the rate is taken from; a conversion without one is a fabrication
    as_of TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (quote_currency, as_of)
  );

  CREATE TABLE IF NOT EXISTS seed_versions (
    version TEXT PRIMARY KEY
  );
`;

const transactionsSchema = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
    source TEXT NOT NULL CHECK (source IN ('seeded', 'manual', 'imported')),
    statement_period TEXT,
    section TEXT,
    installment_current INTEGER,
    installment_total INTEGER,
    source_record_id INTEGER UNIQUE REFERENCES source_records(id),
    reconciliation_state TEXT CHECK (reconciliation_state IS NULL OR reconciliation_state IN ('authoritative', 'duplicate', 'ambiguous', 'unmatched', 'review', 'excluded', 'not_applicable')),
    -- normalised merchant, so rules and per-merchant reporting are a plain join
    merchant_key TEXT,
    -- how the category got here: a rule may overwrite its own work, never a person's
    category_source TEXT CHECK (category_source IS NULL OR category_source IN ('rule', 'manual')),
    CHECK (
      (installment_current IS NULL AND installment_total IS NULL)
      OR (installment_current IS NOT NULL AND installment_total IS NOT NULL AND installment_current > 0 AND installment_total >= installment_current)
    )
  );
`;

interface CategoryInsert {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
}

interface AccountInsert {
  id: string;
  name: string;
  kind: AccountKind;
}

interface SeedLiabilityInsert extends SeedLiability {
  currency: Currency;
  source: TransactionSource;
}

interface TableNameRow {
  name: string;
}

interface TableColumnRow {
  name: string;
}

interface TableSqlRow {
  sql: string | null;
}

interface CountRow {
  count: number;
}

interface LiabilityLookup {
  description: string;
  accountId: string;
  dueDate: string;
  amountMinor: number;
  currency: Currency;
}

function hasTable(database: SqliteDatabase, tableName: string): boolean {
  return database
    .prepare<[string], TableNameRow>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) !== undefined;
}

function getTableColumns(database: SqliteDatabase, tableName: string): string[] {
  return database
    .prepare<[], TableColumnRow>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function getTableSql(database: SqliteDatabase, tableName: string): string {
  return database
    .prepare<[string], TableSqlRow>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName)?.sql ?? "";
}

function hasDetailedTransactionsSchema(database: SqliteDatabase): boolean {
  const columns = getTableColumns(database, "transactions");
  const sql = getTableSql(database, "transactions");
  return (
    columns.includes("statement_period") &&
    columns.includes("source_record_id") &&
    columns.includes("reconciliation_state") &&
    sql.includes("'imported'")
  );
}

function migrateLegacyTransactions(database: SqliteDatabase): void {
  if (!hasTable(database, "transactions") || hasDetailedTransactionsSchema(database)) {
    return;
  }

  database.exec(`
    DROP INDEX IF EXISTS transactions_date_index;
    DROP INDEX IF EXISTS transactions_category_index;
    DROP INDEX IF EXISTS transactions_account_index;
    ALTER TABLE transactions RENAME TO transactions_legacy;
  `);
  database.exec(transactionsSchema);
  database.exec(`
    INSERT INTO transactions
      (id, transaction_date, description, category_id, account_id, transaction_type, amount_minor, currency, source)
    SELECT id, transaction_date, description, category_id, account_id, transaction_type, amount_minor, currency, source
    FROM transactions_legacy;
    DROP TABLE transactions_legacy;
  `);
}

function removeLegacyAggregateTransactions(database: SqliteDatabase): void {
  database.prepare("DELETE FROM transactions WHERE source = 'seeded'").run();
  database.prepare<[string]>("DELETE FROM seed_versions WHERE version = ?").run(LEGACY_AGGREGATE_SEED_VERSION);
}

/**
 * Drops the hardcoded card balance earlier versions seeded. Card debt is declared
 * per cycle in `statement_cycles`; a seeded amount with no provenance is worse
 * than no amount, because it still renders as a fact.
 */
function removeSeededLiabilities(database: SqliteDatabase): void {
  database.prepare("DELETE FROM liabilities WHERE source = 'seeded'").run();
  database.prepare<[string]>("DELETE FROM seed_versions WHERE version = ?").run(LEGACY_SEEDED_LIABILITY_VERSION);
}

/**
 * Adds the category hierarchy column to a database created before it existed.
 */
function migrateCategoryHierarchy(database: SqliteDatabase): void {
  if (!hasTable(database, "categories") || getTableColumns(database, "categories").includes("parent_id")) {
    return;
  }

  database.exec("ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id)");
}

/**
 * Drops reference categories that are no longer seeded, but only where nothing
 * points at them. A category the owner actually used is never removed silently:
 * it stays, unparented, for them to reassign.
 */
function removeRetiredCategories(database: SqliteDatabase): void {
  const seededIds = SEED_CATEGORIES.map((category) => category.id);
  const placeholders = seededIds.map(() => "?").join(", ");

  /*
   * Every table that references a category has to be checked, not only
   * transactions. Foreign keys are on and none of these declare ON DELETE, so a
   * category still referenced by a rule or a commitment does not fail quietly:
   * the delete raises, createDatabase throws, and the application stops starting.
   */
  database
    .prepare(
      `DELETE FROM categories
       WHERE id NOT IN (${placeholders})
         AND id NOT IN (SELECT DISTINCT category_id FROM transactions)
         AND id NOT IN (SELECT DISTINCT category_id FROM merchant_rules)
         AND id NOT IN (SELECT DISTINCT category_id FROM commitment_replacements)
         AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)`,
    )
    .run(...seededIds);
}

/**
 * Adds the merchant key and category provenance columns, then recomputes every
 * key.
 *
 * All rows rather than only the empty ones: the normaliser evolves as new
 * spellings turn up, and a key computed by an older version is stale in exactly
 * the way that makes a merchant reappear under two identities. Recomputing is
 * cheap and writes only where the result actually changed.
 */
function migrateMerchantKeys(database: SqliteDatabase): void {
  if (!hasTable(database, "transactions")) {
    return;
  }

  const columns = getTableColumns(database, "transactions");
  if (!columns.includes("merchant_key")) {
    database.exec("ALTER TABLE transactions ADD COLUMN merchant_key TEXT");
  }
  if (!columns.includes("category_source")) {
    database.exec(
      "ALTER TABLE transactions ADD COLUMN category_source TEXT CHECK (category_source IS NULL OR category_source IN ('rule', 'manual'))",
    );
  }

  const aliases = hasTable(database, "merchant_aliases")
    ? new Map(
        database
          .prepare<[], { aliasKey: string; canonicalKey: string }>(
            "SELECT alias_key AS aliasKey, canonical_key AS canonicalKey FROM merchant_aliases",
          )
          .all()
          .map((row) => [row.aliasKey, row.canonicalKey]),
      )
    : new Map<string, string>();

  const rows = database
    .prepare<[], { id: number; description: string; merchantKey: string | null }>(
      "SELECT id, description, merchant_key AS merchantKey FROM transactions",
    )
    .all();

  const update = database.prepare<{ id: number; merchantKey: string }, void>(
    "UPDATE transactions SET merchant_key = @merchantKey WHERE id = @id",
  );
  database.transaction(() => {
    for (const row of rows) {
      const normalized = normalizeMerchant(row.description);
      const merchantKey = aliases.get(normalized) ?? normalized;
      if (merchantKey !== row.merchantKey) {
        update.run({ id: row.id, merchantKey });
      }
    }
  })();
}

/**
 * Renormalises the keys merchant rules are stored against.
 *
 * A rule is keyed by the normaliser's output, so evolving the normaliser orphans
 * every rule whose key changed: the rule survives but matches nothing, silently.
 * Where renormalising collides with a rule that already holds the new key, the
 * stale one is dropped rather than overwriting a newer decision.
 */
/** Adds the rate columns to a database created before they existed. */
function migrateStatementRates(database: SqliteDatabase): void {
  if (!hasTable(database, "statement_cycles")) {
    return;
  }

  const columns = getTableColumns(database, "statement_cycles");
  for (const column of ["tna_pesos_milli", "tem_pesos_milli", "tna_usd_milli", "tem_usd_milli"]) {
    if (!columns.includes(column)) {
      database.exec(`ALTER TABLE statement_cycles ADD COLUMN ${column} INTEGER`);
    }
  }
}

/**
 * Recomputes the merchant an override points at.
 *
 * Without this an alias declared after the override silently breaks it: the
 * transactions and the rules get repointed, the commitment does not, and the
 * override stops finding anything to displace. It keeps charging its amount while
 * the merchant it was meant to replace goes back into the floor, so the same cost
 * is counted twice and nothing on screen says so.
 */
/**
 * Narrows a commitment to one of a merchant's costs.
 *
 * Without it an override or a termination naming a merchant reaches every cost that
 * merchant carries, and one counterparty here carries two unrelated ones: a debt
 * instalment and the household money paid to the same person. Terminating the
 * instalment plan therefore credited the household spending as well.
 *
 * The defect was masked by declaration order - another commitment happened to
 * consume the household cost first - which is the reason to fix it rather than
 * leave it: the number was right by accident and would have broken the first time
 * anything was reordered or deleted.
 */
function migrateCommitmentCategory(database: SqliteDatabase): void {
  if (!hasTable(database, "commitments")) {
    return;
  }

  if (!getTableColumns(database, "commitments").includes("category_id")) {
    database.exec("ALTER TABLE commitments ADD COLUMN category_id TEXT REFERENCES categories(id)");
  }
}

/**
 * Widens the commitment effects a database created before `termination` existed.
 *
 * SQLite cannot alter a CHECK constraint, so the table is rebuilt. Guarded on the
 * stored SQL rather than on a version number, which is the convention here and has
 * the advantage of being true rather than recorded: a table that already permits
 * the effect is left alone whatever any bookkeeping says.
 */
function migrateCommitmentEffects(database: SqliteDatabase): void {
  if (!hasTable(database, "commitments") || getTableSql(database, "commitments").includes("termination")) {
    return;
  }

  /*
   * Foreign keys have to be off for the swap, and the pragma is a no-op inside a
   * transaction, so it is set around one. Dropping the old table would otherwise
   * fail outright: the replacements table points at it, and SQLite treats the drop
   * as deleting every parent row.
   */
  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE commitments_widened (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL,
          amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
          currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
          effect TEXT NOT NULL CHECK (effect IN ('addition', 'override', 'substitution', 'termination')),
          merchant_key TEXT,
          fee_milli INTEGER NOT NULL CHECK (fee_milli >= 0),
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          note TEXT,
          created_at TEXT NOT NULL,
          CHECK (effective_to IS NULL OR effective_to >= effective_from),
          CHECK (effect NOT IN ('override', 'termination') OR merchant_key IS NOT NULL)
        );
        INSERT INTO commitments_widened
          (id, label, amount_minor, currency, effect, merchant_key, fee_milli, effective_from, effective_to, note, created_at)
        SELECT
          id, label, amount_minor, currency, effect, merchant_key, fee_milli, effective_from, effective_to, note, created_at
        FROM commitments;
        DROP TABLE commitments;
        ALTER TABLE commitments_widened RENAME TO commitments;
      `);
    })();
  } finally {
    database.pragma("foreign_keys = ON");
  }

  /*
   * Checked rather than assumed. A rebuild that leaves an orphaned replacement is
   * worse than a failed migration, because it fails later and somewhere else.
   */
  const orphans = database
    .prepare<[], { count: number }>(
      `SELECT COUNT(*) AS count FROM commitment_replacements r
       WHERE NOT EXISTS (SELECT 1 FROM commitments c WHERE c.id = r.commitment_id)`,
    )
    .get();
  if (orphans !== undefined && orphans.count > 0) {
    throw new Error("Widening the commitment effects left orphaned replacements.");
  }
}

function migrateCommitmentMerchantKeys(database: SqliteDatabase): void {
  if (!hasTable(database, "commitments")) {
    return;
  }

  const commitments = database
    .prepare<[], { id: number; merchantKey: string | null }>(
      "SELECT id, merchant_key AS merchantKey FROM commitments WHERE merchant_key IS NOT NULL",
    )
    .all();

  const update = database.prepare<{ id: number; merchantKey: string }, void>(
    "UPDATE commitments SET merchant_key = @merchantKey WHERE id = @id",
  );

  database.transaction(() => {
    for (const commitment of commitments) {
      if (commitment.merchantKey === null) {
        continue;
      }

      const merchantKey = normalizeMerchant(commitment.merchantKey);
      if (merchantKey !== commitment.merchantKey) {
        update.run({ id: commitment.id, merchantKey });
      }
    }
  })();
}

function migrateMerchantRuleKeys(database: SqliteDatabase): void {
  if (!hasTable(database, "merchant_rules")) {
    return;
  }

  const rules = database
    .prepare<[], { id: number; merchantKey: string }>(
      "SELECT id, merchant_key AS merchantKey FROM merchant_rules ORDER BY id",
    )
    .all();

  const update = database.prepare<{ id: number; merchantKey: string }, void>(
    "UPDATE merchant_rules SET merchant_key = @merchantKey WHERE id = @id",
  );
  const remove = database.prepare<{ id: number }, void>("DELETE FROM merchant_rules WHERE id = @id");

  database.transaction(() => {
    const claimed = new Set<string>();
    for (const rule of rules) {
      const merchantKey = normalizeMerchant(rule.merchantKey);
      if (merchantKey === rule.merchantKey) {
        claimed.add(merchantKey);
        continue;
      }

      if (claimed.has(merchantKey)) {
        remove.run({ id: rule.id });
        continue;
      }

      update.run({ id: rule.id, merchantKey });
      claimed.add(merchantKey);
    }
  })();
}

function seedReferenceData(database: SqliteDatabase): void {
  const insertCategory = database.prepare<CategoryInsert, void>(
    `INSERT INTO categories (id, name, kind, parent_id) VALUES (@id, @name, @kind, @parentId)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, parent_id = excluded.parent_id`,
  );
  const insertAccount = database.prepare<AccountInsert, void>(
    "INSERT OR IGNORE INTO accounts (id, name, kind) VALUES (@id, @name, @kind)",
  );
  const insertLiability = database.prepare<SeedLiabilityInsert, void>(
    `INSERT INTO liabilities
      (description, account_id, due_date, amount_minor, currency, status, source)
      VALUES (@description, @accountId, @dueDate, @amountMinor, @currency, @status, @source)`,
  );
  const liabilityExists = database.prepare<LiabilityLookup, CountRow>(
    `SELECT COUNT(*) AS count
     FROM liabilities
     WHERE description = @description
       AND account_id = @accountId
       AND due_date = @dueDate
       AND amount_minor = @amountMinor
       AND currency = @currency
       AND status = 'open'`,
  );

  const seed = database.transaction(() => {
    for (const category of SEED_CATEGORIES) {
      insertCategory.run(category);
    }

    for (const account of SEED_ACCOUNTS) {
      insertAccount.run(account);
    }

    for (const liability of SEED_LIABILITIES) {
      if ((liabilityExists.get(liability)?.count ?? 0) === 0) {
        insertLiability.run(liability);
      }
    }

    database.prepare<[string]>("INSERT OR IGNORE INTO seed_versions (version) VALUES (?)").run(REFERENCE_DATA_SEED_VERSION);
  });

  seed();
}

function createIndexes(database: SqliteDatabase): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS transactions_date_index ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS transactions_period_index ON transactions(statement_period);
    CREATE INDEX IF NOT EXISTS transactions_category_index ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS transactions_account_index ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS liabilities_due_date_index ON liabilities(due_date);
    CREATE INDEX IF NOT EXISTS source_records_period_index ON source_records(statement_period);
    CREATE INDEX IF NOT EXISTS source_records_state_index ON source_records(reconciliation_state);
    CREATE INDEX IF NOT EXISTS source_records_authoritative_index ON source_records(authoritative_source_record_id);
    CREATE INDEX IF NOT EXISTS commitments_effective_from_index ON commitments(effective_from);
    CREATE INDEX IF NOT EXISTS commitment_replacements_category_index ON commitment_replacements(category_id);
  `);
}

export function createDatabase(databasePath = DEFAULT_DATABASE_PATH): SqliteDatabase {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(referenceSchema);
  migrateLegacyTransactions(database);
  database.exec(transactionsSchema);
  createIndexes(database);
  removeLegacyAggregateTransactions(database);
  removeSeededLiabilities(database);
  migrateCategoryHierarchy(database);
  migrateMerchantKeys(database);
  migrateStatementRates(database);
  migrateMerchantRuleKeys(database);
  migrateCommitmentEffects(database);
  migrateCommitmentCategory(database);
  migrateCommitmentMerchantKeys(database);
  seedReferenceData(database);
  removeRetiredCategories(database);
  return database;
}
