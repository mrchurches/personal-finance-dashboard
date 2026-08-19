import { createApp } from "./app";
import { createDatabase } from "./database";
import { FinanceRepository } from "./finance-repository";

const database = createDatabase();
const repository = new FinanceRepository(database);
const app = createApp(repository, database);
const port = Number(process.env.PORT ?? "3001");

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Finance API listening on http://127.0.0.1:${port}`);
});

function closeServer(): void {
  server.close(() => {
    repository.close();
  });
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
