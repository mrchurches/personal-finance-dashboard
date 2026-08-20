import { createDatabase, DEFAULT_DATABASE_PATH } from "./database";
import { CsvImportError, importCsvSources } from "./csv-import";

/**
 * Loads the documented format.
 *
 *   npm run import:csv -- charges.csv [cycles.csv] [income.csv] [--database path]
 *
 * Only the charges file is required. The other two are what turn a spending report into a
 * payoff plan, and the tool says which one is missing and what that costs, rather than
 * quietly producing a projection built on a balance of nothing and an income of zero.
 */
const args = process.argv.slice(2);
const databaseFlag = args.indexOf("--database");
const databasePath = databaseFlag === -1 ? DEFAULT_DATABASE_PATH : args[databaseFlag + 1];
const files = args.filter((value, index) => {
  if (value.startsWith("--")) {
    return false;
  }

  return index !== databaseFlag + 1 || databaseFlag === -1;
});

const [chargesPath, cyclesPath, incomePath] = files;

const USAGE = "Usage: npm run import:csv -- charges.csv [cycles.csv] [income.csv] [--database path]";

if (chargesPath === undefined || databasePath === undefined) {
  console.error(USAGE);
  process.exit(1);
}

if (files.length > 3) {
  console.error(`${USAGE}\n\nToo many files were given: ${files.join(", ")}.`);
  process.exit(1);
}

const database = createDatabase(databasePath);
try {
  const result = importCsvSources(database, chargesPath, cyclesPath ?? null, incomePath ?? null);
  console.log(JSON.stringify(result, null, 2));

  /*
   * Named one at a time, because the two absences cost different things and a reader who
   * supplied one of them should not be told about the other.
   */
  const missing: string[] = [];
  if (cyclesPath === undefined) {
    missing.push(
      "No cycles file: there are no closing balances, minimum payments or interest rates.\n"
        + "  Spending is reported. What is owed, and what carrying it costs, are not.",
    );
  }
  if (incomePath === undefined) {
    missing.push(
      "No income file: there is nothing to pay the card with.\n"
        + "  The projection would report that the debt never clears, which is true of an\n"
        + "  income of zero and says nothing about yours.",
    );
  }

  if (missing.length > 0) {
    console.log(`\n${missing.map((line) => `- ${line}`).join("\n")}`);
  }
} catch (error) {
  if (error instanceof CsvImportError) {
    /*
     * A malformed file is the user's to fix, and the message already names the line and
     * what was expected. A stack trace on top of that only buries it.
     */
    console.error(`\nThe file could not be read.\n\n  ${error.message}\n`);
    process.exit(1);
  }

  throw error;
} finally {
  database.close();
}
