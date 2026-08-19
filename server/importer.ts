import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SqliteDatabase } from "./database";
import {
  FUNDING_METHOD,
  RECORD_KIND,
  RECONCILIATION_STATE,
  SIGNED_STATUS,
  SOURCE_KIND,
  SOURCE_STATUS,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
  type Currency,
  type FundingMethod,
  type RecordKind,
  type ReconciliationState,
  type SignedStatus,
  type SourceKind,
  type SourceStatus,
} from "../shared/types";

export interface SourceFilePaths {
  visaStatement: string;
  mastercardStatement: string;
  mercadoPagoHistory: string;
  augustCardMovements: string;
}

const sourceDirectory = resolve(process.cwd(), "..", "resumenes");

export const DEFAULT_SOURCE_PATHS: SourceFilePaths = {
  visaStatement: resolve(sourceDirectory, "julio-visa.pdf"),
  mastercardStatement: resolve(sourceDirectory, "julio-master.pdf"),
  mercadoPagoHistory: resolve(sourceDirectory, "historico-mp-julio.txt"),
  augustCardMovements: resolve(sourceDirectory, "movimientos tarjetas agosto.txt"),
};

export interface SourceImportRow {
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
}

export interface ImportResult {
  sourceRecordCount: number;
  insertedSourceRecordCount: number;
  transactionCount: number;
  insertedTransactionCount: number;
  cardDuplicateCount: number;
  cardAmbiguousCount: number;
  cardUnmatchedCount: number;
  cashOutflowTransactionCount: number;
}

interface MoneyToken {
  value: string;
  index: number;
}

interface ParsedAmount {
  amountMinor: number;
  signedStatus: SignedStatus;
}

interface SourceRecordIdRow {
  id: number;
}

interface TransactionIdRow {
  id: number;
}

interface SourceRecordInsert {
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
}

interface ImportedTransactionInsert {
  transactionDate: string;
  description: string;
  categoryId: string;
  accountId: string;
  transactionType: typeof TRANSACTION_TYPE.EXPENSE;
  amountMinor: number;
  currency: Currency;
  source: typeof TRANSACTION_SOURCE.IMPORTED;
  statementPeriod: string;
  section: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  sourceRecordId: number;
  reconciliationState: ReconciliationState;
}

interface SourceImportReference {
  id: number;
  row: SourceImportRow;
  transactionId: number | null;
}

const statementDatePattern = /^(\d{2})-(?:(\d{2})|([A-Za-z]{3}))-(\d{2})\b/;
const movementDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const mercadoPagoDatePattern = /^(\d{1,2}) de ([A-Za-zÁÉÍÓÚáéíóú]+)$/;
const moneyTokenPattern = /[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/g;
const movementAmountPattern = /^[+-]?\s*\$?\s*(?:USD\s+)?[\d.]+(?:,\d{1,2})?$/i;
const installmentPattern = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s|$)/;
const statementMonths: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
const mercadoPagoMonths: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const PDFTOTEXT_COMMAND = process.env["PDFTOTEXT_PATH"] ?? "pdftotext";

let extractorVerified = false;

/**
 * The statement parsers are written against Poppler's `-layout` output, which
 * keeps a merchant and its amount on one line. Xpdf ships a `pdftotext` of the
 * same name that lays the columns out differently, and Git for Windows puts one
 * on PATH ahead of Poppler inside a Git Bash shell.
 *
 * Reading a statement with the wrong one does not fail: it silently drops rows
 * and mis-pairs labels with amounts. Refuse to run rather than import garbage.
 * `PDFTOTEXT_PATH` pins an explicit binary when PATH order cannot be trusted.
 */
function assertPopplerExtractor(): void {
  if (extractorVerified) {
    return;
  }

  const probe = spawnSync(PDFTOTEXT_COMMAND, ["-v"], { encoding: "utf8" });
  if (probe.error !== undefined) {
    throw new Error(
      `Could not run "${PDFTOTEXT_COMMAND}": ${probe.error.message}. `
      + "Install Poppler, or set PDFTOTEXT_PATH to its pdftotext binary.",
    );
  }

  const banner = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.trim();
  if (!/poppler/i.test(banner)) {
    const firstLine = banner.split("\n")[0]?.trim() ?? "unknown build";
    throw new Error(
      `"${PDFTOTEXT_COMMAND}" is not Poppler (${firstLine}). The statement parsers `
      + "depend on Poppler's -layout output; another build silently drops rows and "
      + "mis-pairs amounts. Put Poppler ahead on PATH, or set PDFTOTEXT_PATH to its "
      + "pdftotext binary. On Windows, Git Bash resolves Git's own Xpdf build first.",
    );
  }

  extractorVerified = true;
}

function readPdfText(path: string): string {
  assertPopplerExtractor();

  try {
    return execFileSync(PDFTOTEXT_COMMAND, ["-layout", path, "-"], { encoding: "utf8" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the PDF text extractor failed";
    throw new Error(`Could not read ${path} with ${PDFTOTEXT_COMMAND}: ${reason}`);
  }
}

const spanishMonths: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const futureInstallmentHeaderPattern =
  /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*[-/]\s*(\d{2})/gi;
const futureInstallmentAmountPattern = /\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const openEndedPattern =
  /A partir de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*[-/]\s*(\d{2})\s+\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i;

export interface FutureInstallmentRow {
  duePeriod: string;
  amountMinor: number;
  openEnded: boolean;
}

function toPeriod(monthName: string, twoDigitYear: string): string {
  const month = spanishMonths[monthName.toLowerCase()];
  if (month === undefined) {
    throw new Error(`Unsupported month name: ${monthName}`);
  }

  return `20${twoDigitYear}-${month}`;
}

/**
 * Reads the statement's own forward projection of committed installments.
 *
 * Worth more than a display feature: it is the only thing that distinguishes a
 * movement row continuing an instalment plan from a duplicate of the previous
 * statement row, since a fixed instalment repeats its amount and the movement
 * file repeats the original purchase date. See docs/ROADMAP.md.
 *
 * Both issuers print a row of month labels followed by a row of amounts, using
 * `Mes-YY` or `Mes/YY` and either spelling of September. Visa may add a trailing
 * "A partir de <month> $x", which is a per-month amount from that month onward.
 */
export function parseFutureInstallments(text: string): FutureInstallmentRow[] {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /cuotas a vencer/i.test(line));
  if (startIndex === -1) {
    return [];
  }

  const window = lines.slice(startIndex, startIndex + 12);

  let periods: string[] = [];
  let amounts: number[] = [];
  for (const line of window) {
    if (periods.length === 0) {
      const headers = [...line.matchAll(futureInstallmentHeaderPattern)];
      if (headers.length >= 2) {
        periods = headers.map((match) => toPeriod(match[1] ?? "", match[2] ?? ""));
      }
      continue;
    }

    const values = [...line.matchAll(futureInstallmentAmountPattern)];
    if (values.length >= 2) {
      amounts = values.map((match) => parseArgentineAmount(match[1] ?? "").amountMinor);
      break;
    }
  }

  if (periods.length === 0 || periods.length !== amounts.length) {
    throw new Error(
      `The future-installment table did not line up: ${periods.length} months against ${amounts.length} amounts.`,
    );
  }

  const rows: FutureInstallmentRow[] = periods.map((duePeriod, index) => ({
    duePeriod,
    amountMinor: amounts[index] ?? 0,
    openEnded: false,
  }));

  const openEnded = openEndedPattern.exec(window.join("\n"));
  if (openEnded !== null) {
    rows.push({
      duePeriod: toPeriod(openEnded[1] ?? "", openEnded[2] ?? ""),
      amountMinor: parseArgentineAmount(openEnded[3] ?? "").amountMinor,
      openEnded: true,
    });
  }

  return rows;
}

export function readFutureInstallments(path: string): FutureInstallmentRow[] {
  return parseFutureInstallments(readPdfText(path));
}

function parseArgentineAmount(rawAmount: string): ParsedAmount {
  const trimmed = rawAmount.trim();
  const signedStatus = trimmed.startsWith("-") ? SIGNED_STATUS.NEGATIVE : SIGNED_STATUS.POSITIVE;
  const digits = trimmed.replace(/[^\d,]/g, "");
  const parts = digits.split(",");
  const wholePart = parts[0];
  const fractionalPart = parts[1] ?? "";

  if (wholePart === undefined || wholePart.length === 0 || fractionalPart.length > 2) {
    throw new Error(`Invalid source amount: ${rawAmount}`);
  }

  const amountMinor = Number(`${wholePart}${fractionalPart.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Source amount is outside the supported range: ${rawAmount}`);
  }

  return { amountMinor, signedStatus };
}

function extractMoneyTokens(line: string): MoneyToken[] {
  const tokens: MoneyToken[] = [];
  for (const match of line.matchAll(moneyTokenPattern)) {
    if (match.index === undefined) {
      throw new Error("Could not locate a source amount.");
    }

    tokens.push({ value: match[0], index: match.index });
  }

  return tokens;
}

function createSourceRow(input: Omit<SourceImportRow, "sourceId" | "importKey">): SourceImportRow {
  const sourceId = `${input.sourceKind}:${input.sourceLocator}:${input.currency}`;
  return { ...input, sourceId, importKey: sourceId };
}

function parseStatementDate(match: RegExpMatchArray): string {
  const day = match[1];
  const numericMonth = match[2];
  const textMonth = match[3];
  const month = numericMonth ?? statementMonths[textMonth?.toLowerCase() ?? ""];
  const year = match[4];
  if (day === undefined || month === undefined || year === undefined) {
    throw new Error(`Unsupported statement date: ${match[0]}`);
  }

  return `20${year}-${month}-${day}`;
}

function parseMovementDate(match: RegExpMatchArray): string {
  const day = match[1];
  const month = match[2];
  const year = match[3];
  if (day === undefined || month === undefined || year === undefined) {
    throw new Error(`Unsupported movement date: ${match[0]}`);
  }

  return `${year}-${month}-${day}`;
}

function parseMercadoPagoDate(match: RegExpMatchArray): string {
  const day = match[1];
  const month = mercadoPagoMonths[match[2]?.toLowerCase() ?? ""];
  if (day === undefined || month === undefined) {
    throw new Error(`Unsupported Mercado Pago date: ${match[0]}`);
  }

  return `2026-${month}-${day.padStart(2, "0")}`;
}

/**
 * Reads `NN/MM` as an instalment counter.
 *
 * A statement line can also carry a bare `MM/YY` date in the same position, and
 * the two are indistinguishable by shape. Treat it as a date, not an instalment,
 * when the second number is the statement's own two-digit year and the first is a
 * valid month: `07/26` on a 2026 statement is July 2026, not instalment 7 of 26,
 * and no issuer here sells a 26-instalment plan. Real plans in this data run to
 * 3, 6 or 9, and none of those collide with a year.
 */
function readInstallment(line: string, statementPeriod: string): { current: number; total: number } | null {
  const match = installmentPattern.exec(line);
  const current = match?.[1];
  const total = match?.[2];
  if (current === undefined || total === undefined) {
    return null;
  }

  const currentNumber = Number(current);
  const totalNumber = Number(total);
  const yearSuffix = statementPeriod.slice(2, 4);

  if (total === yearSuffix && currentNumber >= 1 && currentNumber <= 12) {
    return null;
  }

  return { current: currentNumber, total: totalNumber };
}

function isFinancialCostDescription(description: string): boolean {
  return /^(?:IIBB |IVA |I\.V\.A\.|DB\.RG|INTERESES |PERCEPCION |PERCEP\.|PERC IIBB )/i.test(description);
}

function statementCurrency(token: MoneyToken, line: string): Currency {
  return token.index >= 130 || /\bUSD\b/i.test(line) ? "USD" : "ARS";
}

function stripStatementDescription(body: string, amountIndex: number): string {
  let description = body.slice(0, amountIndex).trim();
  description = description.replace(/\s+\d{5,15}\s*$/, "").trim();
  description = description.replace(/\s+\d{1,2}\/\d{1,2}\s*$/, "").trim();
  return description.replace(/^[K*]\s+/, "").trim();
}

function extractOwnerNames(pdfText: string): string[] {
  const names: string[] = [];
  for (const rawLine of pdfText.split(/\r?\n/)) {
    const line = rawLine.replace(/\f/g, "").trim();
    const match = /^(.+?)\s+(?:Monotributo|Monotributista)\b/i.exec(line);
    const name = match?.[1]?.trim();
    if (name !== undefined && name.length > 0) {
      names.push(name);
    }
  }

  return names;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseStatementPdf(
  text: string,
  sourceFilePath: string,
  sourceKind: SourceKind,
  accountId: string,
): SourceImportRow[] {
  const rows: SourceImportRow[] = [];
  const lines = text.split(/\r?\n/);
  let page = 1;
  let section = "statement_consolidated";
  let afterSubtotal = false;
  let detailStarted = false;

  function addRow(input: Omit<SourceImportRow, "sourceId" | "importKey">): void {
    rows.push(createSourceRow(input));
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    if (rawLine.includes("\f")) {
      page += 1;
    }

    const line = rawLine.replace(/\f/g, "").trim();
    if (line.length === 0) {
      continue;
    }

    if (line === "DETALLE DEL CONSUMO") {
      detailStarted = true;
      section = "consumption_detail";
      continue;
    }

    if (line === "COMPRAS DEL MES") {
      section = afterSubtotal ? "additional_cardholder_purchases" : "purchases";
      continue;
    }

    if (line === "DEBITOS AUTOMATICOS") {
      section = "automatic_debits";
      continue;
    }

    if (line === "CUOTA DEL MES") {
      section = "current_installment";
      continue;
    }

    if (line === "CUOTAS DEL MES") {
      section = "installments";
      continue;
    }

    if (line === "SUBTOTAL") {
      afterSubtotal = true;
      continue;
    }

    const locator = `page-${page}-line-${index + 1}`;
    const moneyTokens = extractMoneyTokens(line);

    if (/^SALDO ANTERIOR\b/i.test(line) && moneyTokens.length > 0) {
      const firstToken = moneyTokens[0];
      if (firstToken !== undefined) {
        const parsed = parseArgentineAmount(firstToken.value);
        addRow({
          sourceFilePath,
          sourceKind,
          statementPeriod: "2026-07",
          sourceLocator: `${locator}-ars`,
          transactionDate: null,
          section: "statement_consolidated",
          description: line,
          accountId,
          fundingMethod: accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT,
          signedStatus: parsed.signedStatus,
          currency: "ARS",
          amountMinor: parsed.amountMinor,
          recordKind: RECORD_KIND.PRIOR_BALANCE,
          status: SOURCE_STATUS.NOT_APPLICABLE,
          installmentCurrent: null,
          installmentTotal: null,
          reconciliationState: RECONCILIATION_STATE.NOT_APPLICABLE,
        });
      }

      const secondToken = moneyTokens[1];
      if (secondToken !== undefined) {
        const parsed = parseArgentineAmount(secondToken.value);
        if (parsed.amountMinor > 0) {
          addRow({
            sourceFilePath,
            sourceKind,
            statementPeriod: "2026-07",
            sourceLocator: `${locator}-usd`,
            transactionDate: null,
            section: "statement_consolidated",
            description: line,
            accountId,
            fundingMethod: accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT,
            signedStatus: parsed.signedStatus,
            currency: "USD",
            amountMinor: parsed.amountMinor,
            recordKind: RECORD_KIND.PRIOR_BALANCE,
            status: SOURCE_STATUS.NOT_APPLICABLE,
            installmentCurrent: null,
            installmentTotal: null,
            reconciliationState: RECONCILIATION_STATE.NOT_APPLICABLE,
          });
        }
      }
      continue;
    }

    if (/^SALDO PENDIENTE\b/i.test(line) && moneyTokens.length > 0) {
      const token = moneyTokens[0];
      if (token !== undefined) {
        const parsed = parseArgentineAmount(token.value);
        addRow({
          sourceFilePath,
          sourceKind,
          statementPeriod: "2026-07",
          sourceLocator: locator,
          transactionDate: null,
          section: "statement_consolidated",
          description: line,
          accountId,
          fundingMethod: accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT,
          signedStatus: parsed.signedStatus,
          currency: "ARS",
          amountMinor: parsed.amountMinor,
          recordKind: RECORD_KIND.LIABILITY,
          status: SOURCE_STATUS.NOT_APPLICABLE,
          installmentCurrent: null,
          installmentTotal: null,
          reconciliationState: RECONCILIATION_STATE.NOT_APPLICABLE,
        });
      }
      continue;
    }

    const dateMatch = statementDatePattern.exec(line);
    if (dateMatch === null || moneyTokens.length === 0) {
      if (!detailStarted && isFinancialCostDescription(line)) {
        const token = moneyTokens[moneyTokens.length - 1];
        if (token !== undefined) {
          const parsed = parseArgentineAmount(token.value);
          addRow({
            sourceFilePath,
            sourceKind,
            statementPeriod: "2026-07",
            sourceLocator: locator,
            transactionDate: null,
            section: "statement_costs",
            description: line,
            accountId,
            fundingMethod: accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT,
            signedStatus: parsed.signedStatus,
            currency: "ARS",
            amountMinor: parsed.amountMinor,
            recordKind: RECORD_KIND.FINANCIAL_COST,
            status: SOURCE_STATUS.NOT_APPLICABLE,
            installmentCurrent: null,
            installmentTotal: null,
            reconciliationState: RECONCILIATION_STATE.NOT_APPLICABLE,
          });
        }
      }
      continue;
    }

    const date = parseStatementDate(dateMatch);
    const body = line.slice(dateMatch[0].length).trim();
    const amountToken = moneyTokens[moneyTokens.length - 1];
    if (amountToken === undefined) {
      continue;
    }

    const parsed = parseArgentineAmount(amountToken.value);
    const description = stripStatementDescription(body, body.lastIndexOf(amountToken.value));
    const installment = readInstallment(body, "2026-07");
    const isPayment = /^SU PAGO\b/i.test(description);
    const isFinancialCost = isFinancialCostDescription(description);
    const recordKind = isPayment
      ? RECORD_KIND.PAYMENT
      : isFinancialCost
        ? RECORD_KIND.FINANCIAL_COST
        : RECORD_KIND.CARD_CHARGE;
    const currency = statementCurrency(amountToken, body);
    const sourceSection = isPayment ? "statement_consolidated" : isFinancialCost ? "statement_costs" : section;

    addRow({
      sourceFilePath,
      sourceKind,
      statementPeriod: "2026-07",
      sourceLocator: `${locator}-${currency.toLowerCase()}`,
      transactionDate: date,
      section: sourceSection,
      description,
      accountId,
      fundingMethod: accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT,
      signedStatus: parsed.signedStatus,
      currency,
      amountMinor: parsed.amountMinor,
      recordKind,
      status: SOURCE_STATUS.NOT_APPLICABLE,
      installmentCurrent: installment?.current ?? null,
      installmentTotal: installment?.total ?? null,
      reconciliationState: recordKind === RECORD_KIND.CARD_CHARGE ? RECONCILIATION_STATE.AUTHORITATIVE : RECONCILIATION_STATE.NOT_APPLICABLE,
    });
  }

  return rows;
}

function movementFundingMethod(accountId: string): FundingMethod {
  return accountId === "visa" ? FUNDING_METHOD.VISA_CREDIT : FUNDING_METHOD.MASTERCARD_CREDIT;
}

function movementAccountId(line: string): string | null {
  if (/^Visa\s+/i.test(line)) {
    return "visa";
  }

  if (/^Mastercard\s+/i.test(line)) {
    return "mastercard";
  }

  return null;
}

function isMovementAmount(line: string): boolean {
  return movementAmountPattern.test(line.trim());
}

function parseCardMovements(text: string, sourceFilePath: string): SourceImportRow[] {
  const rows: SourceImportRow[] = [];
  const lines = text.split(/\r?\n/);
  let currentAccountId: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    const accountId = movementAccountId(line);
    if (accountId !== null) {
      currentAccountId = accountId;
      continue;
    }

    const dateMatch = movementDatePattern.exec(line);
    if (dateMatch === null) {
      continue;
    }

    const block: string[] = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = (lines[nextIndex] ?? "").trim();
      if (movementDatePattern.test(nextLine)) {
        break;
      }
      if (nextLine.length > 0) {
        block.push(nextLine);
      }
      nextIndex += 1;
    }

    const amountIndex = block.findIndex(isMovementAmount);
    const amountLine = amountIndex >= 0 ? block[amountIndex] : undefined;
    if (amountLine === undefined) {
      index = nextIndex - 1;
      continue;
    }

    const timeIndex = block.findIndex((value) => /^\d{2}:\d{2}$/.test(value));
    const accountMarkerIndex = block.findIndex((value) => movementAccountId(value) !== null);
    const recordAccountId = accountMarkerIndex >= 0 ? movementAccountId(block[accountMarkerIndex] ?? "") : currentAccountId;
    if (recordAccountId === null) {
      index = nextIndex - 1;
      continue;
    }
    const descriptionIndex = accountMarkerIndex >= 0 ? accountMarkerIndex + 1 : timeIndex + 1;
    const description = block[descriptionIndex];
    if (description === undefined) {
      throw new Error(`Could not parse card movement at line ${index + 1}.`);
    }

    const parsed = parseArgentineAmount(amountLine);
    const currency: Currency = /^[-+]?\s*USD\b/i.test(amountLine) ? "USD" : "ARS";
    const isPayment = /^Pago de tu tarjeta$/i.test(description);
    const installment = readInstallment(block.slice(0, amountIndex).join(" "), "2026-08");
    const recordKind = isPayment ? RECORD_KIND.PAYMENT : RECORD_KIND.CARD_CHARGE;
    const date = parseMovementDate(dateMatch);

    rows.push(createSourceRow({
      sourceFilePath,
      sourceKind: SOURCE_KIND.CARD_MOVEMENTS,
      statementPeriod: "2026-08",
      sourceLocator: `line-${index + 1}-${currency.toLowerCase()}`,
      transactionDate: date,
      section: `${recordAccountId}_movements`,
      description,
      accountId: recordAccountId,
      fundingMethod: movementFundingMethod(recordAccountId),
      signedStatus: parsed.signedStatus,
      currency,
      amountMinor: parsed.amountMinor,
      recordKind,
      status: SOURCE_STATUS.NOT_APPLICABLE,
      installmentCurrent: installment?.current ?? null,
      installmentTotal: installment?.total ?? null,
      reconciliationState: recordKind === RECORD_KIND.CARD_CHARGE ? RECONCILIATION_STATE.AUTHORITATIVE : RECONCILIATION_STATE.NOT_APPLICABLE,
    }));

    index = nextIndex - 1;
  }

  return rows;
}

function mercadoPagoFundingMethod(value: string | undefined): FundingMethod | null {
  if (value === "Visa crédito") {
    return FUNDING_METHOD.VISA_CREDIT;
  }

  if (value === "Mastercard crédito") {
    return FUNDING_METHOD.MASTERCARD_CREDIT;
  }

  if (value === "Dinero disponible") {
    return FUNDING_METHOD.AVAILABLE_MONEY;
  }

  if (value === "Con transferencia") {
    return FUNDING_METHOD.BANK_TRANSFER;
  }

  return null;
}

function mercadoPagoAccountId(fundingMethod: FundingMethod | null): string | null {
  if (fundingMethod === FUNDING_METHOD.VISA_CREDIT) {
    return "visa";
  }

  if (fundingMethod === FUNDING_METHOD.MASTERCARD_CREDIT) {
    return "mastercard";
  }

  if (fundingMethod === FUNDING_METHOD.AVAILABLE_MONEY || fundingMethod === FUNDING_METHOD.BANK_TRANSFER) {
    return "bank-account";
  }

  return null;
}

function parseMercadoPago(
  text: string,
  sourceFilePath: string,
  ownerNames: string[],
): SourceImportRow[] {
  const rows: SourceImportRow[] = [];
  const lines = text.split(/\r?\n/);
  const normalizedOwnerNames = ownerNames.map(normalizeName);
  let currentDate: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    const dateMatch = mercadoPagoDatePattern.exec(line);
    if (dateMatch !== null) {
      currentDate = parseMercadoPagoDate(dateMatch);
      continue;
    }

    if (currentDate === null || !/^\d{2}:\d{2}$/.test(line)) {
      continue;
    }

    const block: string[] = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = (lines[nextIndex] ?? "").trim();
      if (mercadoPagoDatePattern.test(nextLine) || /^\d{2}:\d{2}$/.test(nextLine)) {
        break;
      }
      if (nextLine.length > 0) {
        block.push(nextLine);
      }
      nextIndex += 1;
    }

    const amountIndex = block.findIndex((value) => /^[+-]\s*\$/.test(value));
    const amountLine = amountIndex >= 0 ? block[amountIndex] : undefined;
    const name = block[0];
    const combinedDescription = block[1];
    if (amountLine === undefined || name === undefined || combinedDescription === undefined) {
      throw new Error(`Could not parse Mercado Pago record at line ${index + 1}.`);
    }

    const operation = combinedDescription.startsWith(name) ? combinedDescription.slice(name.length).trim() : combinedDescription;
    const description = operation.length > 0 ? `${name} | ${operation}` : name;
    const fundingText = block.find((line) => mercadoPagoFundingMethod(line) !== null);
    const fundingMethod = mercadoPagoFundingMethod(fundingText);
    const statusText = block.find((line) => line === "Aprobado" || line === "Rechazado" || line === "Devuelto");
    const parsed = parseArgentineAmount(amountLine);
    const status = statusText === "Aprobado"
      ? SOURCE_STATUS.APPROVED
      : statusText === "Rechazado"
        ? SOURCE_STATUS.REJECTED
        : statusText === "Devuelto"
          ? SOURCE_STATUS.RETURNED
          : SOURCE_STATUS.NOT_APPLICABLE;
    const normalizedName = normalizeName(name);
    const isOwnerTransfer = fundingMethod === FUNDING_METHOD.AVAILABLE_MONEY
      && parsed.signedStatus === SIGNED_STATUS.NEGATIVE
      && /transferencia enviada/i.test(operation)
      && normalizedOwnerNames.includes(normalizedName);
    const isRefund = parsed.signedStatus === SIGNED_STATUS.POSITIVE && /devolución de dinero/i.test(operation);
    const isIncome = parsed.signedStatus === SIGNED_STATUS.POSITIVE && !isRefund;
    const recordKind = status === SOURCE_STATUS.REJECTED
      ? RECORD_KIND.REJECTED
      : status === SOURCE_STATUS.RETURNED
        ? RECORD_KIND.RETURNED
        : isRefund
          ? RECORD_KIND.REFUND
          : isIncome
            ? RECORD_KIND.INCOME
            : fundingMethod === FUNDING_METHOD.VISA_CREDIT || fundingMethod === FUNDING_METHOD.MASTERCARD_CREDIT
              ? RECORD_KIND.CARD_CHARGE
              : isOwnerTransfer
                ? RECORD_KIND.REVIEW_CANDIDATE
                : fundingMethod === FUNDING_METHOD.AVAILABLE_MONEY
                  ? RECORD_KIND.CASH_OUTFLOW
                  : RECORD_KIND.REVIEW_CANDIDATE;
    const reconciliationState = isOwnerTransfer
      ? RECONCILIATION_STATE.REVIEW
      : recordKind === RECORD_KIND.CASH_OUTFLOW
        ? RECONCILIATION_STATE.AUTHORITATIVE
        : recordKind === RECORD_KIND.REJECTED || recordKind === RECORD_KIND.RETURNED || recordKind === RECORD_KIND.REFUND
          ? RECONCILIATION_STATE.EXCLUDED
          : RECONCILIATION_STATE.NOT_APPLICABLE;

    rows.push(createSourceRow({
      sourceFilePath,
      sourceKind: SOURCE_KIND.MERCADO_PAGO_HISTORY,
      statementPeriod: "2026-07",
      sourceLocator: `line-${index + 1}-${parsed.signedStatus}`,
      transactionDate: currentDate,
      section: "mercado_pago_operations",
      description,
      accountId: mercadoPagoAccountId(fundingMethod),
      fundingMethod,
      signedStatus: parsed.signedStatus,
      currency: "ARS",
      amountMinor: parsed.amountMinor,
      recordKind,
      status,
      installmentCurrent: null,
      installmentTotal: null,
      reconciliationState,
    }));

    index = nextIndex - 1;
  }

  return rows;
}

export function readSourceRecords(paths: SourceFilePaths = DEFAULT_SOURCE_PATHS): SourceImportRow[] {
  const visaText = readPdfText(paths.visaStatement);
  const mastercardText = readPdfText(paths.mastercardStatement);
  const mercadoPagoText = readFileSync(paths.mercadoPagoHistory, "utf8");
  const movementsText = readFileSync(paths.augustCardMovements, "utf8");
  const ownerNames = [...extractOwnerNames(visaText), ...extractOwnerNames(mastercardText)];

  return [
    ...parseStatementPdf(visaText, paths.visaStatement, SOURCE_KIND.VISA_STATEMENT, "visa"),
    ...parseStatementPdf(mastercardText, paths.mastercardStatement, SOURCE_KIND.MASTERCARD_STATEMENT, "mastercard"),
    ...parseCardMovements(movementsText, paths.augustCardMovements),
    ...parseMercadoPago(mercadoPagoText, paths.mercadoPagoHistory, ownerNames),
  ];
}

function insertOrUpdateSourceRecord(database: SqliteDatabase, row: SourceImportRow): { id: number; inserted: boolean } {
  const existing = database
    .prepare<[string], SourceRecordIdRow>("SELECT id FROM source_records WHERE import_key = ?")
    .get(row.importKey);
  const values: SourceRecordInsert = row;

  if (existing !== undefined) {
    database.prepare<SourceRecordInsert & { id: number }, void>(
      `UPDATE source_records SET
        source_id = @sourceId,
        source_file_path = @sourceFilePath,
        source_kind = @sourceKind,
        statement_period = @statementPeriod,
        source_locator = @sourceLocator,
        transaction_date = @transactionDate,
        section = @section,
        description = @description,
        account_id = @accountId,
        funding_method = @fundingMethod,
        signed_status = @signedStatus,
        currency = @currency,
        amount_minor = @amountMinor,
        record_kind = @recordKind,
        status = @status,
        installment_current = @installmentCurrent,
        installment_total = @installmentTotal,
        reconciliation_state = @reconciliationState
       WHERE id = @id`,
    ).run({ ...values, id: existing.id });
    return { id: existing.id, inserted: false };
  }

  const result = database.prepare<SourceRecordInsert, void>(
    `INSERT INTO source_records
      (source_id, import_key, source_file_path, source_kind, statement_period, source_locator, transaction_date, section, description, account_id, funding_method, signed_status, currency, amount_minor, record_kind, status, installment_current, installment_total, reconciliation_state)
     VALUES (@sourceId, @importKey, @sourceFilePath, @sourceKind, @statementPeriod, @sourceLocator, @transactionDate, @section, @description, @accountId, @fundingMethod, @signedStatus, @currency, @amountMinor, @recordKind, @status, @installmentCurrent, @installmentTotal, @reconciliationState)`,
  ).run(values);
  if (typeof result.lastInsertRowid !== "number" || !Number.isSafeInteger(result.lastInsertRowid)) {
    throw new Error("The imported source record identifier is invalid.");
  }

  return { id: result.lastInsertRowid, inserted: true };
}

function ensureImportedTransaction(database: SqliteDatabase, reference: SourceImportReference): { transactionId: number; inserted: boolean } {
  const row = reference.row;
  if (row.transactionDate === null || row.accountId === null) {
    throw new Error(`Imported transaction ${row.importKey} is missing a date or account.`);
  }

  const existing = database
    .prepare<[number], TransactionIdRow>("SELECT id FROM transactions WHERE source_record_id = ?")
    .get(reference.id);
  const values: ImportedTransactionInsert = {
    transactionDate: row.transactionDate,
    description: row.description,
    categoryId: "uncategorized",
    accountId: row.accountId,
    transactionType: TRANSACTION_TYPE.EXPENSE,
    amountMinor: row.amountMinor,
    currency: row.currency,
    source: "imported",
    statementPeriod: row.statementPeriod,
    section: row.section,
    installmentCurrent: row.installmentCurrent,
    installmentTotal: row.installmentTotal,
    sourceRecordId: reference.id,
    reconciliationState: row.reconciliationState,
  };

  if (existing !== undefined) {
    database.prepare<ImportedTransactionInsert & { id: number }, void>(
      `UPDATE transactions SET
        transaction_date = @transactionDate,
        description = @description,
        category_id = @categoryId,
        account_id = @accountId,
        transaction_type = @transactionType,
        amount_minor = @amountMinor,
        currency = @currency,
        source = @source,
        statement_period = @statementPeriod,
        section = @section,
        installment_current = @installmentCurrent,
        installment_total = @installmentTotal,
        reconciliation_state = @reconciliationState
       WHERE id = @id`,
    ).run({ ...values, id: existing.id });
    database.prepare<{ id: number; transactionId: number }, void>(
      "UPDATE source_records SET authoritative_transaction_id = @transactionId WHERE id = @id",
    ).run({ id: reference.id, transactionId: existing.id });
    return { transactionId: existing.id, inserted: false };
  }

  const result = database.prepare<ImportedTransactionInsert, void>(
    `INSERT INTO transactions
      (transaction_date, description, category_id, account_id, transaction_type, amount_minor, currency, source, statement_period, section, installment_current, installment_total, source_record_id, reconciliation_state)
     VALUES (@transactionDate, @description, @categoryId, @accountId, @transactionType, @amountMinor, @currency, @source, @statementPeriod, @section, @installmentCurrent, @installmentTotal, @sourceRecordId, @reconciliationState)`,
  ).run(values);
  if (typeof result.lastInsertRowid !== "number" || !Number.isSafeInteger(result.lastInsertRowid)) {
    throw new Error("The imported transaction identifier is invalid.");
  }

  database.prepare<{ id: number; transactionId: number }, void>(
    "UPDATE source_records SET authoritative_transaction_id = @transactionId WHERE id = @id",
  ).run({ id: reference.id, transactionId: result.lastInsertRowid });
  return { transactionId: result.lastInsertRowid, inserted: true };
}

function mercadoPagoPartyName(description: string): string {
  const partyName = description.split("|")[0]?.trim() ?? "";
  return normalizeName(partyName.split(/\s+/)[0] ?? "");
}

function authoritativeMerchantName(description: string): string {
  const normalized = normalizeName(description);
  return normalized.startsWith("merpago") ? normalized.slice("merpago".length) : normalized;
}

function editDistance(left: string, right: string): number {
  const previous: number[] = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current: number[] = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      const deletion = (current[rightIndex] ?? 0) + 1;
      const insertion = (previous[rightIndex + 1] ?? 0) + 1;
      const substitution = (previous[rightIndex] ?? 0) + substitutionCost;
      current.push(Math.min(deletion, insertion, substitution));
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? Number.MAX_SAFE_INTEGER;
}

function hasMerchantMatch(mercadoPagoDescription: string, authoritativeDescription: string): boolean {
  const partyName = mercadoPagoPartyName(mercadoPagoDescription);
  const merchantName = authoritativeMerchantName(authoritativeDescription);
  if (partyName.length < 4 || merchantName.length < 4) {
    return false;
  }

  if (merchantName.includes(partyName) || partyName.includes(merchantName)) {
    return true;
  }

  const prefixLength = Math.min(partyName.length, merchantName.length);
  const partyPrefix = partyName.slice(0, prefixLength);
  const merchantPrefix = merchantName.slice(0, prefixLength);
  return prefixLength >= 8 && editDistance(partyPrefix, merchantPrefix) <= 2;
}

function daysBetween(firstDate: string, secondDate: string): number {
  const first = Date.parse(`${firstDate}T00:00:00Z`);
  const second = Date.parse(`${secondDate}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(second)
    ? Math.abs(first - second) / 86400000
    : Number.MAX_SAFE_INTEGER;
}

function updateReconciliation(
  database: SqliteDatabase,
  reference: SourceImportReference,
  recordKind: RecordKind,
  reconciliationState: ReconciliationState,
  authoritativeSourceRecordId: number | null,
  authoritativeTransactionId: number | null,
): void {
  database.prepare<{
    id: number;
    recordKind: RecordKind;
    reconciliationState: ReconciliationState;
    authoritativeSourceRecordId: number | null;
    authoritativeTransactionId: number | null;
  }, void>(
    `UPDATE source_records SET
      record_kind = @recordKind,
      reconciliation_state = @reconciliationState,
      authoritative_source_record_id = @authoritativeSourceRecordId,
      authoritative_transaction_id = @authoritativeTransactionId
     WHERE id = @id`,
  ).run({
    id: reference.id,
    recordKind,
    reconciliationState,
    authoritativeSourceRecordId,
    authoritativeTransactionId,
  });
}

function reconcileMercadoPagoCardRecord(
  database: SqliteDatabase,
  reference: SourceImportReference,
  authoritativeRecords: SourceImportReference[],
): ReconciliationState {
  const row = reference.row;
  const candidates = authoritativeRecords.filter((candidate) =>
    candidate.row.accountId === row.accountId
    && candidate.row.transactionDate === row.transactionDate
    && candidate.row.currency === row.currency
    && candidate.row.amountMinor === row.amountMinor,
  );
  const amountCandidates = authoritativeRecords.filter((candidate) =>
    candidate.row.accountId === row.accountId
    && candidate.row.currency === row.currency
    && candidate.row.amountMinor === row.amountMinor,
  );
  const merchantCandidates = amountCandidates.filter((candidate) => hasMerchantMatch(row.description, candidate.row.description));

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate === undefined) {
      throw new Error("The reconciliation candidate disappeared.");
    }
    if (hasMerchantMatch(row.description, candidate.row.description)) {
      updateReconciliation(database, reference, RECORD_KIND.CARD_CHARGE, RECONCILIATION_STATE.DUPLICATE, candidate.id, candidate.transactionId);
      return RECONCILIATION_STATE.DUPLICATE;
    }

    updateReconciliation(database, reference, RECORD_KIND.REVIEW_CANDIDATE, RECONCILIATION_STATE.AMBIGUOUS, null, null);
    return RECONCILIATION_STATE.AMBIGUOUS;
  }

  if (merchantCandidates.length === 1) {
    const candidate = merchantCandidates[0];
    if (candidate === undefined) {
      throw new Error("The merchant reconciliation candidate disappeared.");
    }
    updateReconciliation(database, reference, RECORD_KIND.CARD_CHARGE, RECONCILIATION_STATE.DUPLICATE, candidate.id, candidate.transactionId);
    return RECONCILIATION_STATE.DUPLICATE;
  }

  if (candidates.length > 1 || amountCandidates.length > 0) {
    const closeDateCandidate = amountCandidates.find((candidate) =>
      candidate.row.transactionDate !== null
      && row.transactionDate !== null
      && daysBetween(candidate.row.transactionDate, row.transactionDate) <= 2,
    );
    if (closeDateCandidate !== undefined || candidates.length > 1) {
      updateReconciliation(database, reference, RECORD_KIND.REVIEW_CANDIDATE, RECONCILIATION_STATE.AMBIGUOUS, null, null);
      return RECONCILIATION_STATE.AMBIGUOUS;
    }
  }

  updateReconciliation(database, reference, RECORD_KIND.REVIEW_CANDIDATE, RECONCILIATION_STATE.UNMATCHED, null, null);
  return RECONCILIATION_STATE.UNMATCHED;
}

export function importSourceRecords(database: SqliteDatabase, rows: SourceImportRow[]): ImportResult {
  let insertedSourceRecordCount = 0;
  let insertedTransactionCount = 0;
  let cashOutflowTransactionCount = 0;
  let cardDuplicateCount = 0;
  let cardAmbiguousCount = 0;
  let cardUnmatchedCount = 0;

  const runImport = database.transaction(() => {
    const references: SourceImportReference[] = [];
    for (const row of rows) {
      const result = insertOrUpdateSourceRecord(database, row);
      if (result.inserted) {
        insertedSourceRecordCount += 1;
      }
      references.push({ id: result.id, row, transactionId: null });
    }

    const authoritativeRecords: SourceImportReference[] = [];
    for (const reference of references) {
      if (
        (reference.row.sourceKind === SOURCE_KIND.MERCADO_PAGO_HISTORY && reference.row.recordKind !== RECORD_KIND.CASH_OUTFLOW)
        || (reference.row.recordKind !== RECORD_KIND.CARD_CHARGE && reference.row.recordKind !== RECORD_KIND.CASH_OUTFLOW)
      ) {
        continue;
      }

      const transaction = ensureImportedTransaction(database, reference);
      reference.transactionId = transaction.transactionId;
      if (transaction.inserted) {
        insertedTransactionCount += 1;
      }
      if (reference.row.recordKind === RECORD_KIND.CASH_OUTFLOW) {
        cashOutflowTransactionCount += 1;
      } else if (reference.row.sourceKind !== SOURCE_KIND.MERCADO_PAGO_HISTORY) {
        authoritativeRecords.push(reference);
      }
    }

    for (const reference of references) {
      if (reference.row.sourceKind !== SOURCE_KIND.MERCADO_PAGO_HISTORY || reference.row.recordKind !== RECORD_KIND.CARD_CHARGE) {
        continue;
      }

      const reconciliationState = reconcileMercadoPagoCardRecord(database, reference, authoritativeRecords);
      if (reconciliationState === RECONCILIATION_STATE.DUPLICATE) {
        cardDuplicateCount += 1;
      } else if (reconciliationState === RECONCILIATION_STATE.AMBIGUOUS) {
        cardAmbiguousCount += 1;
      } else {
        cardUnmatchedCount += 1;
      }
    }
  });

  runImport();

  return {
    sourceRecordCount: rows.length,
    insertedSourceRecordCount,
    transactionCount: rows.filter((row) => row.recordKind === RECORD_KIND.CASH_OUTFLOW || (row.sourceKind !== SOURCE_KIND.MERCADO_PAGO_HISTORY && row.recordKind === RECORD_KIND.CARD_CHARGE)).length,
    insertedTransactionCount,
    cardDuplicateCount,
    cardAmbiguousCount,
    cardUnmatchedCount,
    cashOutflowTransactionCount,
  };
}

export function importSourceFiles(database: SqliteDatabase, paths: SourceFilePaths = DEFAULT_SOURCE_PATHS): ImportResult {
  return importSourceRecords(database, readSourceRecords(paths));
}
