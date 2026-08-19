import { createDatabase, DEFAULT_DATABASE_PATH } from "./database";
import { importSourceFiles } from "./importer";

const database = createDatabase(DEFAULT_DATABASE_PATH);
try {
  const result = importSourceFiles(database);
  console.log(JSON.stringify(result, null, 2));
} finally {
  database.close();
}
