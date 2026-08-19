import express, { type Express, type Request, type Response } from "express";
import type { SqliteDatabase } from "./database";
import { getJsonValue, isJsonObject, isString, type JsonValue } from "../shared/json";
import { FinanceRepository, RepositoryValidationError } from "./finance-repository";
import { applyMerchantRules, deleteMerchantRule, listMerchantRules, listUncategorizedMerchants, upsertMerchantRule } from "./merchant-rules";
import {
  validateCreateIncomeSourceRequest,
  validateCreateTransactionRequest,
  validateMonthQuery,
  validateTransactionFilters,
} from "./validation";

const DEFAULT_MONTH = "2026-08";
type JsonBodyRequest = Request<Record<string, string>, JsonValue, JsonValue>;

export function createApp(repository: FinanceRepository, database: SqliteDatabase): Express {
  const app = express();

  app.use(express.json());

  app.get("/api/summary", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json(repository.getSummary(monthValidation.month));
  });

  app.get("/api/transactions", (request: Request, response: Response) => {
    const filtersValidation = validateTransactionFilters(request.query);
    if (!filtersValidation.valid) {
      response.status(400).json({ error: "Invalid transaction filters.", details: filtersValidation.errors });
      return;
    }

    response.json({ transactions: repository.getTransactions(filtersValidation.filters) });
  });

  app.get("/api/source-records", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json({ records: repository.getSourceRecords(monthValidation.month) });
  });

  app.get("/api/reconciliation", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json({ records: repository.getReviewQueue(monthValidation.month) });
  });

  app.get("/api/categories", (_request: Request, response: Response) => {
    response.json({ categories: repository.getCategories() });
  });

  app.get("/api/accounts", (_request: Request, response: Response) => {
    response.json({ accounts: repository.getAccounts() });
  });

  app.get("/api/income-sources", (_request: Request, response: Response) => {
    response.json({ incomeSources: repository.getIncomeSources() });
  });

  app.post("/api/income-sources", (request: JsonBodyRequest, response: Response) => {
    const validation = validateCreateIncomeSourceRequest(request.body);
    if (!validation.valid) {
      response.status(400).json({ error: "Invalid income source.", details: validation.errors });
      return;
    }

    try {
      response.status(201).json({ incomeSource: repository.createIncomeSource(validation.value) });
    } catch (error) {
      if (error instanceof RepositoryValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }

      response.status(500).json({ error: "The income source could not be saved." });
    }
  });

  app.get("/api/merchant-rules", (_request: Request, response: Response) => {
    response.json({ merchantRules: listMerchantRules(database) });
  });

  app.get("/api/uncategorized-merchants", (_request: Request, response: Response) => {
    response.json({ merchants: listUncategorizedMerchants(database) });
  });

  app.post("/api/merchant-rules", (request: JsonBodyRequest, response: Response) => {
    const body = request.body;
    if (!isJsonObject(body)) {
      response.status(400).json({ error: "Request body must be a JSON object." });
      return;
    }

    const merchant = getJsonValue(body, "merchant");
    const categoryId = getJsonValue(body, "categoryId");
    if (!isString(merchant) || merchant.trim().length === 0 || !isString(categoryId)) {
      response.status(400).json({ error: "merchant and categoryId are required." });
      return;
    }

    try {
      const merchantKey = upsertMerchantRule(database, merchant, categoryId, new Date().toISOString());
      const applied = applyMerchantRules(database);
      response.status(201).json({ merchantKey, applied });
    } catch {
      response.status(400).json({ error: "The rule could not be saved. Check the category." });
    }
  });

  app.delete("/api/merchant-rules/:merchantKey", (request: Request, response: Response) => {
    const raw = request.params["merchantKey"];
    const merchantKey = typeof raw === "string" ? raw : "";
    response.json({ cleared: deleteMerchantRule(database, merchantKey) });
  });

  app.post("/api/transactions", (request: JsonBodyRequest, response: Response) => {
    const validation = validateCreateTransactionRequest(request.body);
    if (!validation.valid) {
      response.status(400).json({ error: "Invalid transaction.", details: validation.errors });
      return;
    }

    try {
      response.status(201).json({ transaction: repository.createTransaction(validation.value) });
    } catch (error) {
      if (error instanceof RepositoryValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }

      response.status(500).json({ error: "The transaction could not be saved." });
    }
  });

  return app;
}
