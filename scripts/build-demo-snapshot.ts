import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { createDatabase } from "../server/database";
import { importCsvSources } from "../server/csv-import";
import { FinanceRepository } from "../server/finance-repository";

/**
 * Freezes the demo into a file the browser can answer from, so the dashboard can be
 * published as a static site with no server and no database behind it.
 *
 * It works by running the real API against the real sample import and recording what it
 * says. Nothing is reimplemented for the demo: if a panel would be wrong when hosted, it is
 * wrong here too, which is the only version of this worth publishing.
 *
 * Every read the client can make is enumerable - each one takes either nothing or a cycle,
 * and only the transactions list takes filters - so the whole space fits in one file. That
 * is a fact about this API rather than a general technique, and it stops being true the
 * moment a read takes a free-text parameter. Should that happen, this script should fail
 * loudly rather than quietly snapshot a subset.
 */
const DATABASE_PATH = "data/demo.sqlite";
const OUTPUT_PATH = "public/demo-api.json";

/** Reads that take no parameters at all. */
const PLAIN = [
  "/api/periods",
  "/api/categories",
  "/api/accounts",
  "/api/income-sources",
  "/api/spending-patterns",
  "/api/anomalies",
  "/api/merchant-rules",
  "/api/merchant-aliases",
  "/api/manual-categories",
  "/api/uncategorized-merchants",
  "/api/exchange-rates",
  "/api/plan-notes",
];

/** Reads that take a cycle and nothing else. */
const PER_CYCLE = [
  "/api/summary",
  "/api/source-records",
  "/api/reconciliation",
  "/api/baseline",
  "/api/payoff",
  "/api/payoff-levers",
  "/api/committed-installments",
  "/api/scorecard",
  "/api/food",
  "/api/commitments",
];

interface Recorded {
  status: number;
  body: unknown;
}

async function main(): Promise<void> {
  rmSync(DATABASE_PATH, { force: true });
  mkdirSync(dirname(DATABASE_PATH), { recursive: true });

  const database = createDatabase(DATABASE_PATH);
  const imported = importCsvSources(
    database,
    "samples/charges.csv",
    "samples/cycles.csv",
    "samples/income.csv",
  );
  console.log(
    `imported ${imported.transactionCount} transactions across ${imported.cycleCount} cycles`,
  );

  const repository = new FinanceRepository(database);
  const app = createApp(repository, database);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const snapshot: Record<string, Recorded> = {};
  const record = async (path: string): Promise<unknown> => {
    const response = await fetch(`${origin}${path}`);
    const body: unknown = await response.json();
    snapshot[path] = { status: response.status, body };

    /*
     * A demo built from error responses would still load, still render, and still be
     * empty, and the reason would be buried in a JSON file nobody opens.
     */
    if (!response.ok) {
      throw new Error(`${path} answered ${response.status}: ${JSON.stringify(body)}`);
    }

    return body;
  };

  const periods = repository.getPeriods();
  const categoryIds = repository.getCategories().map((category) => category.id);
  const accountIds = repository.getAccounts().map((account) => account.id);

  for (const path of PLAIN) {
    await record(path);
  }

  for (const period of periods) {
    for (const path of PER_CYCLE) {
      await record(`${path}?month=${encodeURIComponent(period)}`);
    }

    /*
     * The filters are recorded exactly as the client builds them: an empty filter is
     * omitted rather than sent empty, so a snapshot keyed on the sent URL has to be built
     * the same way or every unfiltered view misses.
     */
    for (const categoryId of ["", ...categoryIds]) {
      for (const accountId of ["", ...accountIds]) {
        const search = new URLSearchParams({ month: period });
        if (categoryId.length > 0) {
          search.set("categoryId", categoryId);
        }
        if (accountId.length > 0) {
          search.set("accountId", accountId);
        }
        await record(`/api/transactions?${search.toString()}`);
      }
    }
  }

  server.close();
  repository.close();

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(`wrote ${Object.keys(snapshot).length} responses to ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
