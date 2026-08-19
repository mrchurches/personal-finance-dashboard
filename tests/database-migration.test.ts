import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type SqliteDatabase } from "../server/database";

interface CountRow {
  count: number;
}

describe("legacy aggregate migration", () => {
  let database: SqliteDatabase | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
    if (temporaryDirectory !== undefined) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it("removes seeded aggregate transactions and the seeded liability while preserving manual rows", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "personal-finance-dashboard-"));
    const databasePath = join(temporaryDirectory, "finance.sqlite");
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL);
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        description TEXT NOT NULL,
        category_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('seeded', 'manual'))
      );
      CREATE TABLE liabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        account_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE TABLE seed_versions (version TEXT PRIMARY KEY);
      INSERT INTO categories VALUES ('uncategorized', 'Uncategorized', 'expense');
      INSERT INTO accounts VALUES ('cash', 'Cash', 'cash');
      INSERT INTO accounts VALUES ('mastercard', 'Mastercard', 'card');
      INSERT INTO transactions VALUES (1, '2026-08-01', 'Aggregate card seed', 'uncategorized', 'mastercard', 'expense', 1000, 'ARS', 'seeded');
      INSERT INTO transactions VALUES (2, '2026-08-18', 'Manual record', 'uncategorized', 'cash', 'expense', 2000, 'ARS', 'manual');
      INSERT INTO liabilities VALUES (1, 'Overdue Mastercard liability', 'mastercard', '2026-08-07', 123456, 'ARS', 'open', 'seeded');
      INSERT INTO seed_versions VALUES ('2026-08-aggregate-baseline-v1');
    `);
    legacyDatabase.close();

    database = createDatabase(databasePath);

    const seededCount = database.prepare<[], CountRow>("SELECT COUNT(*) AS count FROM transactions WHERE source = 'seeded'").get()?.count ?? 0;
    const manualCount = database.prepare<[], CountRow>("SELECT COUNT(*) AS count FROM transactions WHERE source = 'manual'").get()?.count ?? 0;
    const liabilityCount = database.prepare<[], CountRow>("SELECT COUNT(*) AS count FROM liabilities WHERE description = 'Overdue Mastercard liability'").get()?.count ?? 0;
    expect(seededCount).toBe(0);
    expect(manualCount).toBe(1);
    // The seeded balance had no provenance and reconciled with nothing in the
    // statements. Card debt now lives in statement_cycles, declared per cycle.
    expect(liabilityCount).toBe(0);

    database.close();
    database = createDatabase(databasePath);
    expect(database.prepare<[], CountRow>("SELECT COUNT(*) AS count FROM transactions WHERE source = 'manual'").get()?.count ?? 0).toBe(1);
    expect(database.prepare<[], CountRow>("SELECT COUNT(*) AS count FROM liabilities WHERE source = 'seeded'").get()?.count ?? 0).toBe(0);
  });
});
