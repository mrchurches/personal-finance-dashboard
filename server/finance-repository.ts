import type {
  Account,
  AccountKind,
  Category,
  CategoryKind,
  CategoryTotal,
  CommittedInstallment,
  Currency,
  FundingMethod,
  IncomeFrequency,
  IncomeSource,
  MoneyTotals,
  RecordKind,
  ReconciliationState,
  SignedStatus,
  SourceKind,
  SourceRecord,
  SourceStatus,
  StatementBalance,
  StatementCycleDates,
  Summary,
  Transaction,
  TransactionSource,
  TransactionType,
} from "../shared/types";
import { RECONCILIATION_STATE, TRANSACTION_SOURCE, TRANSACTION_TYPE } from "../shared/types";
import { normalizeMerchant } from "../shared/merchants";
import type { ParsedIncomeSourceInput, ParsedTransactionInput, TransactionFilters } from "./validation";
import type { SqliteDatabase } from "./database";

interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
}

interface IncomeSourceRow {
  id: number;
  name: string;
  amountMinor: number;
  currency: Currency;
  frequency: IncomeFrequency;
  statutoryBonus: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface CommittedInstallmentRow {
  accountId: string;
  accountName: string;
  statementPeriod: string;
  duePeriod: string;
  amountMinor: number;
  currency: Currency;
  openEnded: number;
}

interface StatementBalanceRow {
  accountId: string;
  accountName: string;
  period: string;
  openedOn: string;
  closedOn: string;
  dueOn: string;
  amountMinor: number;
  amountUsdMinor: number;
  minimumPaymentMinor: number | null;
}

interface StatementCycleRow {
  openedOn: string;
  closedOn: string;
  dueOn: string;
}

interface PeriodParameters {
  period: string;
}

interface IncomeSourceInsert {
  name: string;
  amountMinor: number;
  currency: Currency;
  frequency: IncomeFrequency;
  statutoryBonus: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Months the Argentine statutory annual bonus (SAC) is paid in, half each. */
const STATUTORY_BONUS_MONTHS = new Set(["06", "12"]);

interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
}

interface TransactionRow {
  id: number;
  transactionDate: string;
  description: string;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: Currency;
  source: TransactionSource;
  statementPeriod: string | null;
  section: string | null;
  sourceKind: SourceKind | null;
  sourceFilePath: string | null;
  sourceLocator: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  reconciliationState: ReconciliationState | null;
}

interface SourceRecordRow {
  id: number;
  sourceId: string;
  importKey: string;
  sourceFilePath: string;
  sourceKind: SourceKind;
  statementPeriod: string;
  sourceLocator: string;
  transactionDate: string | null;
  section: string;
  description: string;
  accountId: string | null;
  fundingMethod: FundingMethod | null;
  signedStatus: SignedStatus;
  currency: Currency;
  amountMinor: number;
  recordKind: RecordKind;
  status: SourceStatus;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  reconciliationState: ReconciliationState;
  authoritativeSourceRecordId: number | null;
  authoritativeTransactionId: number | null;
}

interface MoneyTotalsRow {
  ARS: number;
  USD: number;
}

interface CategoryTotalRow {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  currency: Currency;
  amountMinor: number;
  transactionCount: number;
}

interface UncategorizedRow extends MoneyTotalsRow {
  count: number;
}

interface CountRow {
  count: number;
}

interface MonthParameters {
  periodPattern: string;
}

interface TransactionFilterParameters {
  periodPattern: string | null;
  categoryId: string | null;
  accountId: string | null;
}

interface ManualTransactionInsert {
  merchantKey: string;
  transactionDate: string;
  description: string;
  categoryId: string;
  accountId: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: Currency;
  source: TransactionSource;
  reconciliationState: ReconciliationState;
}

export class RepositoryValidationError extends Error {}

const transactionSelect = `
  SELECT
    t.id,
    t.transaction_date AS transactionDate,
    t.description,
    t.category_id AS categoryId,
    c.name AS categoryName,
    t.account_id AS accountId,
    a.name AS accountName,
    t.transaction_type AS transactionType,
    t.amount_minor AS amountMinor,
    t.currency,
    t.source,
    t.statement_period AS statementPeriod,
    t.section,
    sr.source_kind AS sourceKind,
    sr.source_file_path AS sourceFilePath,
    sr.source_locator AS sourceLocator,
    t.installment_current AS installmentCurrent,
    t.installment_total AS installmentTotal,
    COALESCE(t.reconciliation_state, sr.reconciliation_state) AS reconciliationState
  FROM transactions t
  INNER JOIN categories c ON c.id = t.category_id
  INNER JOIN accounts a ON a.id = t.account_id
  LEFT JOIN source_records sr ON sr.id = t.source_record_id
`;

const sourceRecordSelect = `
  SELECT
    id,
    source_id AS sourceId,
    import_key AS importKey,
    source_file_path AS sourceFilePath,
    source_kind AS sourceKind,
    statement_period AS statementPeriod,
    source_locator AS sourceLocator,
    transaction_date AS transactionDate,
    section,
    description,
    account_id AS accountId,
    funding_method AS fundingMethod,
    signed_status AS signedStatus,
    currency,
    amount_minor AS amountMinor,
    record_kind AS recordKind,
    status,
    installment_current AS installmentCurrent,
    installment_total AS installmentTotal,
    reconciliation_state AS reconciliationState,
    authoritative_source_record_id AS authoritativeSourceRecordId,
    authoritative_transaction_id AS authoritativeTransactionId
  FROM source_records
`;

export class FinanceRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public getCategories(): Category[] {
    const rows = this.database
      .prepare<[], CategoryRow>(
        `SELECT c.id, c.name, c.kind, c.parent_id AS parentId
         FROM categories c
         LEFT JOIN categories parent ON parent.id = c.parent_id
         ORDER BY c.kind = 'expense', COALESCE(parent.name, c.name), c.parent_id IS NOT NULL, c.name`,
      )
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, parentId: row.parentId }));
  }

  public getAccounts(): Account[] {
    const rows = this.database
      .prepare<[], AccountRow>("SELECT id, name, kind FROM accounts ORDER BY kind, name")
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind }));
  }

  public getTransactions(filters: TransactionFilters): Transaction[] {
    const rows = this.database
      .prepare<TransactionFilterParameters, TransactionRow>(
        `${transactionSelect}
        WHERE (:periodPattern IS NULL OR COALESCE(t.statement_period, t.transaction_date) LIKE :periodPattern)
          AND (:categoryId IS NULL OR t.category_id = :categoryId)
          AND (:accountId IS NULL OR t.account_id = :accountId)
        ORDER BY COALESCE(t.statement_period, t.transaction_date) DESC, t.transaction_date DESC, t.id DESC`,
      )
      .all({
        periodPattern: filters.month === undefined ? null : `${filters.month}%`,
        categoryId: filters.categoryId ?? null,
        accountId: filters.accountId ?? null,
      });

    return rows.map((row) => this.toTransaction(row));
  }

  public getSourceRecords(month: string | undefined, reviewOnly = false): SourceRecord[] {
    const periodPattern = month === undefined ? null : `${month}%`;
    const query = reviewOnly
      ? `${sourceRecordSelect}
         WHERE (:periodPattern IS NULL OR statement_period LIKE :periodPattern)
           AND reconciliation_state IN ('ambiguous', 'unmatched', 'review')
         ORDER BY COALESCE(transaction_date, statement_period) DESC, id DESC`
      : `${sourceRecordSelect}
         WHERE (:periodPattern IS NULL OR statement_period LIKE :periodPattern)
         ORDER BY COALESCE(transaction_date, statement_period) DESC, id DESC`;
    const rows = this.database
      .prepare<{ periodPattern: string | null }, SourceRecordRow>(query)
      .all({ periodPattern });

    return rows.map((row) => this.toSourceRecord(row));
  }

  public getReviewQueue(month: string | undefined): SourceRecord[] {
    return this.getSourceRecords(month, true);
  }

  /**
   * Committed installments falling due from `fromPeriod` onward, taking the most
   * recent statement that spoke about each month. Later statements restate the
   * projection upward as new plans are opened, so the newest declaration is the
   * only one that is still true.
   */
  public getCommittedInstallments(fromPeriod: string): CommittedInstallment[] {
    return this.database
      .prepare<{ fromPeriod: string }, CommittedInstallmentRow>(
        `SELECT
          i.account_id AS accountId,
          a.name AS accountName,
          i.statement_period AS statementPeriod,
          i.due_period AS duePeriod,
          i.amount_minor AS amountMinor,
          i.currency,
          i.open_ended AS openEnded
        FROM committed_installments i
        INNER JOIN accounts a ON a.id = i.account_id
        WHERE i.due_period >= :fromPeriod
          AND i.statement_period = (
            SELECT MAX(latest.statement_period)
            FROM committed_installments latest
            WHERE latest.account_id = i.account_id
              AND latest.due_period = i.due_period
          )
          AND i.amount_minor > 0
        ORDER BY i.due_period, a.name`,
      )
      .all({ fromPeriod })
      .map((row) => ({ ...row, openEnded: row.openEnded === 1 }));
  }

  /** Dates of the cycle that carries this period, closed or still running. */
  public getCycleDates(period: string): StatementCycleDates | null {
    const row = this.database
      .prepare<PeriodParameters, StatementCycleRow>(
        `SELECT opened_on AS openedOn, closed_on AS closedOn, due_on AS dueOn
         FROM statement_cycles
         WHERE period = :period
         ORDER BY closed_on DESC
         LIMIT 1`,
      )
      .get({ period });

    return row ?? null;
  }

  /**
   * What is owed per card as of this period: the most recent cycle at or before
   * it that has actually closed. A running cycle has dates but no balance yet, so
   * the debt on screen stays the last real statement rather than dropping to zero.
   */
  public getStatementBalances(period: string): StatementBalance[] {
    return this.database
      .prepare<PeriodParameters, StatementBalanceRow>(
        `SELECT
          c.account_id AS accountId,
          a.name AS accountName,
          c.period,
          c.opened_on AS openedOn,
          c.closed_on AS closedOn,
          c.due_on AS dueOn,
          c.closing_balance_minor AS amountMinor,
          c.closing_balance_usd_minor AS amountUsdMinor,
          c.minimum_payment_minor AS minimumPaymentMinor
        FROM statement_cycles c
        INNER JOIN accounts a ON a.id = c.account_id
        WHERE c.closing_balance_minor IS NOT NULL
          AND c.period = (
            SELECT MAX(latest.period)
            FROM statement_cycles latest
            WHERE latest.account_id = c.account_id
              AND latest.period <= :period
              AND latest.closing_balance_minor IS NOT NULL
          )
        ORDER BY a.name`,
      )
      .all({ period });
  }

  public getIncomeSources(): IncomeSource[] {
    return this.database
      .prepare<[], IncomeSourceRow>(
        `SELECT
          id,
          name,
          amount_minor AS amountMinor,
          currency,
          frequency,
          statutory_bonus AS statutoryBonus,
          effective_from AS effectiveFrom,
          effective_to AS effectiveTo
        FROM income_sources
        ORDER BY effective_from DESC, id DESC`,
      )
      .all()
      .map((row) => this.toIncomeSource(row));
  }

  public createIncomeSource(input: ParsedIncomeSourceInput): IncomeSource {
    const result = this.database
      .prepare<IncomeSourceInsert, void>(
        `INSERT INTO income_sources
          (name, amount_minor, currency, frequency, statutory_bonus, effective_from, effective_to)
         VALUES (@name, @amountMinor, @currency, @frequency, @statutoryBonus, @effectiveFrom, @effectiveTo)`,
      )
      .run({
        name: input.name,
        amountMinor: input.amountMinor,
        currency: input.currency,
        frequency: input.frequency,
        statutoryBonus: input.statutoryBonus ? 1 : 0,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
      });

    if (typeof result.lastInsertRowid !== "number" || !Number.isSafeInteger(result.lastInsertRowid)) {
      throw new Error("The income source identifier is invalid.");
    }

    const created = this.getIncomeSources().find((source) => source.id === result.lastInsertRowid);
    if (created === undefined) {
      throw new Error("The created income source could not be read back.");
    }

    return created;
  }

  /**
   * Income implied by the recurring rules for a month, including the statutory
   * annual bonus in June and December. Derived rather than stored, so a payoff
   * projection can ask about a month that has not happened yet.
   */
  public getRecurringIncome(month: string): MoneyTotals {
    const totals: MoneyTotals = { ARS: 0, USD: 0 };
    const monthNumber = month.slice(5, 7);
    const paysStatutoryBonus = STATUTORY_BONUS_MONTHS.has(monthNumber);

    for (const source of this.getIncomeSources()) {
      const startedByNow = source.effectiveFrom <= month;
      const stillActive = source.effectiveTo === null || source.effectiveTo >= month;
      if (!startedByNow || !stillActive) {
        continue;
      }

      const bonus = source.statutoryBonus && paysStatutoryBonus ? Math.floor(source.amountMinor / 2) : 0;
      totals[source.currency] += source.amountMinor + bonus;
    }

    return totals;
  }

  private toIncomeSource(row: IncomeSourceRow): IncomeSource {
    return {
      id: row.id,
      name: row.name,
      amountMinor: row.amountMinor,
      currency: row.currency,
      frequency: row.frequency,
      statutoryBonus: row.statutoryBonus === 1,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    };
  }

  public getSummary(month: string): Summary {
    const monthParameters: MonthParameters = { periodPattern: `${month}%` };
    const oneOffIncome = this.getMoneyTotals(
      this.database
        .prepare<MonthParameters, MoneyTotalsRow>(
          `SELECT
            COALESCE(SUM(CASE WHEN currency = 'ARS' THEN amount_minor ELSE 0 END), 0) AS ARS,
            COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount_minor ELSE 0 END), 0) AS USD
          FROM transactions
          WHERE COALESCE(statement_period, transaction_date) LIKE :periodPattern
            AND transaction_type = 'income'`,
        )
        .get(monthParameters),
    );
    const recurringIncome = this.getRecurringIncome(month);
    const income: MoneyTotals = {
      ARS: recurringIncome.ARS + oneOffIncome.ARS,
      USD: recurringIncome.USD + oneOffIncome.USD,
    };
    const cardCharges = this.getMoneyTotals(
      this.database
        .prepare<MonthParameters, MoneyTotalsRow>(
          `SELECT
            COALESCE(SUM(CASE WHEN t.currency = 'ARS' THEN t.amount_minor ELSE 0 END), 0) AS ARS,
            COALESCE(SUM(CASE WHEN t.currency = 'USD' THEN t.amount_minor ELSE 0 END), 0) AS USD
          FROM transactions t
          INNER JOIN accounts a ON a.id = t.account_id
          LEFT JOIN source_records sr ON sr.id = t.source_record_id
          WHERE COALESCE(t.statement_period, t.transaction_date) LIKE :periodPattern
            AND t.transaction_type = 'expense'
            AND a.kind = 'card'
            AND (t.source_record_id IS NULL OR sr.record_kind = 'card_charge')`,
        )
        .get(monthParameters),
    );
    const otherSpending = this.getMoneyTotals(
      this.database
        .prepare<MonthParameters, MoneyTotalsRow>(
          `SELECT
            COALESCE(SUM(CASE WHEN t.currency = 'ARS' THEN t.amount_minor ELSE 0 END), 0) AS ARS,
            COALESCE(SUM(CASE WHEN t.currency = 'USD' THEN t.amount_minor ELSE 0 END), 0) AS USD
          FROM transactions t
          INNER JOIN accounts a ON a.id = t.account_id
          WHERE COALESCE(t.statement_period, t.transaction_date) LIKE :periodPattern
            AND t.transaction_type = 'expense'
            AND a.kind <> 'card'`,
        )
        .get(monthParameters),
    );
    const statementBalances = this.getStatementBalances(month);
    const statementDebt: MoneyTotals = {
      ARS: statementBalances.reduce((total, balance) => total + balance.amountMinor, 0),
      USD: statementBalances.reduce((total, balance) => total + balance.amountUsdMinor, 0),
    };
    const financialCosts = this.getMoneyTotals(
      this.database
        .prepare<MonthParameters, MoneyTotalsRow>(
          `SELECT
            COALESCE(SUM(CASE WHEN currency = 'ARS' THEN amount_minor ELSE 0 END), 0) AS ARS,
            COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount_minor ELSE 0 END), 0) AS USD
          FROM source_records
          WHERE statement_period LIKE :periodPattern
            AND record_kind = 'financial_cost'`,
        )
        .get(monthParameters),
    );
    const categoryRows = this.database
      .prepare<MonthParameters, CategoryTotalRow>(
        `SELECT
          c.id AS categoryId,
          c.name AS categoryName,
          c.parent_id AS parentId,
          parent.name AS parentName,
          t.currency,
          SUM(t.amount_minor) AS amountMinor,
          COUNT(*) AS transactionCount
        FROM transactions t
        INNER JOIN categories c ON c.id = t.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE COALESCE(t.statement_period, t.transaction_date) LIKE :periodPattern
          AND t.transaction_type = 'expense'
        GROUP BY c.id, c.name, c.parent_id, parent.name, t.currency
        ORDER BY amountMinor DESC`,
      )
      .all(monthParameters);
    const uncategorized = this.database
      .prepare<MonthParameters, UncategorizedRow>(
        `SELECT
          COALESCE(SUM(CASE WHEN t.currency = 'ARS' THEN t.amount_minor ELSE 0 END), 0) AS ARS,
          COALESCE(SUM(CASE WHEN t.currency = 'USD' THEN t.amount_minor ELSE 0 END), 0) AS USD,
          COUNT(*) AS count
        FROM transactions t
        WHERE COALESCE(t.statement_period, t.transaction_date) LIKE :periodPattern
          AND t.transaction_type = 'expense'
          AND t.category_id = 'uncategorized'`,
      )
      .get(monthParameters);
    const reviewQueueCount = this.database
      .prepare<MonthParameters, CountRow>(
        `SELECT COUNT(*) AS count
         FROM source_records
         WHERE statement_period LIKE :periodPattern
           AND reconciliation_state IN ('ambiguous', 'unmatched', 'review')`,
      )
      .get(monthParameters)?.count ?? 0;

    return {
      month,
      income,
      recurringIncome,
      oneOffIncome,
      cardCharges,
      otherSpending,
      financialCosts,
      /*
       * Flow only, and every outflow counts. The statement balance is
       * deliberately absent because it already contains this cycle's charges, but
       * money that left without touching a card is real spending and belongs
       * here: leaving it out flattered exactly the cycles that used cash.
       */
      cycleResult: {
        ARS: income.ARS - cardCharges.ARS - otherSpending.ARS - financialCosts.ARS,
        USD: 0,
      },
      statementDebt,
      statementBalances,
      cycle: this.getCycleDates(month),
      categoryTotals: this.toCategoryTotals(categoryRows),
      uncategorized: {
        totals: {
          ARS: uncategorized?.ARS ?? 0,
          USD: uncategorized?.USD ?? 0,
        },
        count: uncategorized?.count ?? 0,
      },
      reviewQueueCount,
    };
  }

  public createTransaction(input: ParsedTransactionInput): Transaction {
    const category = this.getCategory(input.categoryId);
    if (category === undefined) {
      throw new RepositoryValidationError("The selected category does not exist.");
    }

    const expectedCategoryKind = input.transactionType === TRANSACTION_TYPE.INCOME ? "income" : "expense";
    if (category.kind !== expectedCategoryKind) {
      throw new RepositoryValidationError("The selected category does not match the transaction type.");
    }

    if (this.getAccount(input.accountId) === undefined) {
      throw new RepositoryValidationError("The selected account does not exist.");
    }

    const insert = this.database.prepare<ManualTransactionInsert, void>(
      `INSERT INTO transactions
        (transaction_date, description, category_id, account_id, transaction_type, amount_minor, currency, source, reconciliation_state, merchant_key, category_source)
        VALUES (@transactionDate, @description, @categoryId, @accountId, @transactionType, @amountMinor, @currency, @source, @reconciliationState, @merchantKey, 'manual')`,
    );
    const result = insert.run({
      merchantKey: normalizeMerchant(input.description),
      transactionDate: input.transactionDate,
      description: input.description,
      categoryId: input.categoryId,
      accountId: input.accountId,
      transactionType: input.transactionType,
      amountMinor: input.amountMinor,
      currency: input.currency,
      source: TRANSACTION_SOURCE.MANUAL,
      reconciliationState: RECONCILIATION_STATE.NOT_APPLICABLE,
    });

    if (typeof result.lastInsertRowid !== "number" || !Number.isSafeInteger(result.lastInsertRowid)) {
      throw new Error("The created transaction identifier is invalid.");
    }

    const transaction = this.getTransaction(result.lastInsertRowid);
    if (transaction === undefined) {
      throw new Error("The created transaction could not be read back.");
    }

    return transaction;
  }

  public close(): void {
    this.database.close();
  }

  private getCategory(id: string): CategoryRow | undefined {
    return this.database
      .prepare<[string], CategoryRow>("SELECT id, name, kind FROM categories WHERE id = ?")
      .get(id);
  }

  private getAccount(id: string): AccountRow | undefined {
    return this.database
      .prepare<[string], AccountRow>("SELECT id, name, kind FROM accounts WHERE id = ?")
      .get(id);
  }

  private getTransaction(id: number): Transaction | undefined {
    const row = this.database
      .prepare<[number], TransactionRow>(
        `${transactionSelect}
        WHERE t.id = ?`,
      )
      .get(id);

    return row === undefined ? undefined : this.toTransaction(row);
  }

  private getMoneyTotals(row: MoneyTotalsRow | undefined): MoneyTotals {
    return {
      ARS: row?.ARS ?? 0,
      USD: row?.USD ?? 0,
    };
  }

  private toCategoryTotals(rows: CategoryTotalRow[]): CategoryTotal[] {
    const currencyTotals: MoneyTotals = { ARS: 0, USD: 0 };
    for (const row of rows) {
      currencyTotals[row.currency] += row.amountMinor;
    }

    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      parentId: row.parentId,
      parentName: row.parentName,
      currency: row.currency,
      amountMinor: row.amountMinor,
      percentage: currencyTotals[row.currency] === 0 ? 0 : (row.amountMinor / currencyTotals[row.currency]) * 100,
      transactionCount: row.transactionCount,
    }));
  }

  private toTransaction(row: TransactionRow): Transaction {
    return {
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      accountId: row.accountId,
      accountName: row.accountName,
      transactionType: row.transactionType,
      amountMinor: row.amountMinor,
      currency: row.currency,
      source: row.source,
      statementPeriod: row.statementPeriod,
      section: row.section,
      sourceKind: row.sourceKind,
      sourceFilePath: row.sourceFilePath,
      sourceLocator: row.sourceLocator,
      installmentCurrent: row.installmentCurrent,
      installmentTotal: row.installmentTotal,
      reconciliationState: row.reconciliationState,
    };
  }

  private toSourceRecord(row: SourceRecordRow): SourceRecord {
    return {
      id: row.id,
      sourceId: row.sourceId,
      importKey: row.importKey,
      sourceFilePath: row.sourceFilePath,
      sourceKind: row.sourceKind,
      statementPeriod: row.statementPeriod,
      sourceLocator: row.sourceLocator,
      transactionDate: row.transactionDate,
      section: row.section,
      description: row.description,
      accountId: row.accountId,
      fundingMethod: row.fundingMethod,
      signedStatus: row.signedStatus,
      currency: row.currency,
      amountMinor: row.amountMinor,
      recordKind: row.recordKind,
      status: row.status,
      installmentCurrent: row.installmentCurrent,
      installmentTotal: row.installmentTotal,
      reconciliationState: row.reconciliationState,
      authoritativeSourceRecordId: row.authoritativeSourceRecordId,
      authoritativeTransactionId: row.authoritativeTransactionId,
    };
  }
}
