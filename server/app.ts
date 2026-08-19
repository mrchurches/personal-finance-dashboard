import express, { type Express, type Request, type Response } from "express";
import type { SqliteDatabase } from "./database";
import { getJsonValue, isInteger, isJsonObject, isString, type JsonValue } from "../shared/json";
import { FinanceRepository, RepositoryValidationError } from "./finance-repository";
import { applyMerchantRules, deleteMerchantRule, listMerchantRules, listUncategorizedMerchants, upsertMerchantRule } from "./merchant-rules";
import { getSpendingPatterns, summarizeCommittedCost } from "./spending-patterns";
import { getMonthlyBaseline } from "./baseline";
import { projectPayoff } from "./payoff";
import { getPayoffLevers } from "./levers";
import { getCycleScorecard } from "./scorecard";
import { declareMerchantAlias, listMerchantAliases } from "./merchant-aliases";
import { createPlanNote, deletePlanNote, listPlanNotes, updatePlanNote } from "./plan-notes";
import {
  createCommitment,
  deleteCommitment,
  listCommitments,
  resolveCommitments,
  type CommitmentEffect,
} from "./commitments";
import {
  validateCreateIncomeSourceRequest,
  validateCreateTransactionRequest,
  validateMonthQuery,
  validateTransactionFilters,
} from "./validation";

const DEFAULT_MONTH = "2026-08";

/*
 * Only canonical decimal digits name a row. Number() also accepts "1e1", "+1"
 * and "0x10", so a path that names no row at all would resolve to a different
 * real one and delete it.
 */
const ID_PATTERN = /^\d+$/;
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

  app.get("/api/payoff-levers", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json(getPayoffLevers(database, monthValidation.month));
  });

  app.get("/api/payoff", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    /*
     * Both policies, always. The maximum answers how long this takes, and the
     * minimum answers whether paying the least demanded ever finishes. Showing
     * only the first would hide the more consequential answer.
     */
    response.json({
      maximum: projectPayoff(database, monthValidation.month, { paymentPolicy: "maximum" }),
      minimum: projectPayoff(database, monthValidation.month, { paymentPolicy: "minimum" }),
    });
  });

  app.get("/api/committed-installments", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json({ installments: repository.getCommittedInstallments(monthValidation.month) });
  });

  app.get("/api/baseline", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    /*
     * Six cycles ahead: far enough to show the statutory bonus and the point
     * where committed instalments run out, which are the two things that change
     * what is available.
     */
    const periods: string[] = [];
    const [year, month] = monthValidation.month.split("-").map(Number);
    for (let offset = 0; offset < 6; offset += 1) {
      const total = (year ?? 0) * 12 + (month ?? 1) - 1 + offset;
      periods.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
    }

    response.json({ baselines: periods.map((period) => getMonthlyBaseline(database, period)) });
  });

  app.get("/api/spending-patterns", (_request: Request, response: Response) => {
    const patterns = getSpendingPatterns(database);
    response.json({ patterns, committedCost: summarizeCommittedCost(patterns) });
  });

  app.get("/api/merchant-aliases", (_request: Request, response: Response) => {
    response.json({ merchantAliases: listMerchantAliases(database) });
  });

  app.post("/api/merchant-aliases", (request: JsonBodyRequest, response: Response) => {
    const body = request.body;
    if (!isJsonObject(body)) {
      response.status(400).json({ error: "Request body must be a JSON object." });
      return;
    }

    const alias = getJsonValue(body, "alias");
    const canonical = getJsonValue(body, "canonical");
    const reason = getJsonValue(body, "reason");
    if (!isString(alias) || !isString(canonical) || !isString(reason) || reason.trim().length === 0) {
      response.status(400).json({ error: "alias, canonical and reason are required." });
      return;
    }

    try {
      const result = declareMerchantAlias(database, alias, canonical, reason, new Date().toISOString());
      const applied = applyMerchantRules(database);
      response.status(201).json({ ...result, applied });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "The alias could not be saved." });
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

  app.patch("/api/transactions/:id/category", (request: JsonBodyRequest, response: Response) => {
    const transactionId = readPathId(request);
    if (transactionId === null) {
      response.status(400).json({ error: "A valid transaction id is required." });
      return;
    }

    const body = request.body;
    const categoryId = isJsonObject(body) ? getJsonValue(body, "categoryId") : undefined;
    if (!isString(categoryId) || categoryId.trim().length === 0) {
      response.status(400).json({ error: "categoryId is required." });
      return;
    }

    try {
      response.json({ transaction: repository.setTransactionCategory(transactionId, categoryId.trim()) });
    } catch (error) {
      if (error instanceof RepositoryValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }

      response.status(500).json({ error: "The category could not be saved." });
    }
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

  /*
   * Path identifiers are parsed here rather than trusted: express hands over a
   * string, and a repository asked to delete row "NaN" would report zero rows
   * deleted, which reads exactly like a row that was never there.
   */
  function readPathId(request: Request): number | null {
    const raw = request.params["id"];
    if (typeof raw !== "string" || !ID_PATTERN.test(raw)) {
      return null;
    }

    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function readNoteInput(
    body: JsonValue,
  ): { title: string; body: string; pinned: boolean } | null {
    if (!isJsonObject(body)) {
      return null;
    }

    const title = getJsonValue(body, "title");
    const noteBody = getJsonValue(body, "body");
    const pinned = getJsonValue(body, "pinned");
    if (!isString(title) || title.trim().length === 0 || !isString(noteBody)) {
      return null;
    }

    return { title, body: noteBody, pinned: pinned === true };
  }

  app.get("/api/scorecard", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    response.json(getCycleScorecard(database, monthValidation.month));
  });

  app.get("/api/plan-notes", (_request: Request, response: Response) => {
    response.json({ notes: listPlanNotes(database) });
  });

  app.post("/api/plan-notes", (request: JsonBodyRequest, response: Response) => {
    const input = readNoteInput(request.body);
    if (input === null) {
      response.status(400).json({ error: "title and body are required." });
      return;
    }

    try {
      response.status(201).json({ note: createPlanNote(database, input, new Date().toISOString()) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "The note could not be saved." });
    }
  });

  app.put("/api/plan-notes/:id", (request: JsonBodyRequest, response: Response) => {
    const id = readPathId(request);
    const input = readNoteInput(request.body);
    if (id === null || input === null) {
      response.status(400).json({ error: "A valid id, title and body are required." });
      return;
    }

    try {
      response.json({ note: updatePlanNote(database, id, input, new Date().toISOString()) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "The note could not be saved." });
    }
  });

  app.delete("/api/plan-notes/:id", (request: Request, response: Response) => {
    const id = readPathId(request);
    if (id === null) {
      response.status(400).json({ error: "A valid note id is required." });
      return;
    }

    response.json(deletePlanNote(database, id));
  });

  app.get("/api/commitments", (request: Request, response: Response) => {
    const monthValidation = validateMonthQuery(request.query, DEFAULT_MONTH);
    if (!monthValidation.valid) {
      response.status(400).json({ error: "Invalid month filter.", details: monthValidation.errors });
      return;
    }

    const commitments = listCommitments(database);
    response.json({
      commitments,
      resolved: resolveCommitments(
        database,
        monthValidation.month,
        getSpendingPatterns(database),
        commitments,
      ),
    });
  });

  app.post("/api/commitments", (request: JsonBodyRequest, response: Response) => {
    const body = request.body;
    if (!isJsonObject(body)) {
      response.status(400).json({ error: "Request body must be a JSON object." });
      return;
    }

    const label = getJsonValue(body, "label");
    const amountMinor = getJsonValue(body, "amountMinor");
    const currency = getJsonValue(body, "currency");
    const effect = getJsonValue(body, "effect");
    const merchantKey = getJsonValue(body, "merchantKey");
    const feeMilli = getJsonValue(body, "feeMilli");
    const effectiveFrom = getJsonValue(body, "effectiveFrom");
    const effectiveTo = getJsonValue(body, "effectiveTo");
    const note = getJsonValue(body, "note");
    const replacedCategoryIds = getJsonValue(body, "replacedCategoryIds");

    const isEffect = (value: JsonValue | undefined): value is CommitmentEffect =>
      value === "addition" || value === "override" || value === "substitution";

    if (
      !isString(label)
      || !isInteger(amountMinor)
      || !isString(currency)
      || !isEffect(effect)
      || !isInteger(feeMilli)
      || !isString(effectiveFrom)
      || !Array.isArray(replacedCategoryIds)
      || !replacedCategoryIds.every(isString)
    ) {
      response.status(400).json({
        error: "label, amountMinor, currency, effect, feeMilli, effectiveFrom and replacedCategoryIds are required.",
      });
      return;
    }

    try {
      const commitment = createCommitment(
        database,
        {
          label,
          amountMinor,
          currency,
          effect,
          merchantKey: isString(merchantKey) && merchantKey.length > 0 ? merchantKey : null,
          feeMilli,
          effectiveFrom,
          effectiveTo: isString(effectiveTo) && effectiveTo.length > 0 ? effectiveTo : null,
          note: isString(note) && note.length > 0 ? note : null,
          replacedCategoryIds,
        },
        new Date().toISOString(),
      );

      response.status(201).json({ commitment });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "The commitment could not be saved.",
      });
    }
  });

  app.delete("/api/commitments/:id", (request: Request, response: Response) => {
    const id = readPathId(request);
    if (id === null) {
      response.status(400).json({ error: "A valid commitment id is required." });
      return;
    }

    response.json(deleteCommitment(database, id));
  });

  return app;
}
