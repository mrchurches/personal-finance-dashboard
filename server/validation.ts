import { parseAmountToMinor, MoneyInputError } from "../shared/money";
import {
  isCurrency,
  isIncomeFrequency,
  isTransactionType,
  type Currency,
  type IncomeFrequency,
  type TransactionType,
} from "../shared/types";
import { getJsonValue, isJsonObject, isString, type JsonValue } from "../shared/json";

export interface ParsedTransactionInput {
  transactionDate: string;
  description: string;
  categoryId: string;
  accountId: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: Currency;
}

export interface ValidTransactionValidation {
  valid: true;
  value: ParsedTransactionInput;
}

export interface InvalidTransactionValidation {
  valid: false;
  errors: string[];
}

export type TransactionValidation = ValidTransactionValidation | InvalidTransactionValidation;

export interface ValidMonthQuery {
  valid: true;
  month: string;
}

export interface InvalidMonthQuery {
  valid: false;
  errors: string[];
}

export type MonthQueryValidation = ValidMonthQuery | InvalidMonthQuery;

export interface TransactionFilters {
  month: string | undefined;
  categoryId: string | undefined;
  accountId: string | undefined;
}

export interface ValidTransactionFilters {
  valid: true;
  filters: TransactionFilters;
}

export interface InvalidTransactionFilters {
  valid: false;
  errors: string[];
}

export type TransactionFiltersValidation = ValidTransactionFilters | InvalidTransactionFilters;

export interface ParsedIncomeSourceInput {
  name: string;
  amountMinor: number;
  currency: Currency;
  frequency: IncomeFrequency;
  statutoryBonus: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ValidIncomeSourceValidation {
  valid: true;
  value: ParsedIncomeSourceInput;
}

export interface InvalidIncomeSourceValidation {
  valid: false;
  errors: string[];
}

export type IncomeSourceValidation = ValidIncomeSourceValidation | InvalidIncomeSourceValidation;

export function isMonth(value: string): boolean {
  return /^(\d{4})-(0[1-9]|1[0-2])$/.test(value);
}

function readRequiredString(body: Record<string, JsonValue>, key: string, errors: string[]): string {
  const value = getJsonValue(body, key);
  if (!isString(value) || value.trim().length === 0) {
    errors.push(`${key} is required.`);
    return "";
  }

  return value.trim();
}

function readOptionalFilter(query: Record<string, JsonValue>, key: string, errors: string[]): string | undefined {
  const value = getJsonValue(query, key);
  if (value === undefined) {
    return undefined;
  }

  if (!isString(value) || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string.`);
    return undefined;
  }

  return value.trim();
}

export function validateCreateTransactionRequest(body: JsonValue): TransactionValidation {
  if (!isJsonObject(body)) {
    return { valid: false, errors: ["Request body must be a JSON object."] };
  }

  const errors: string[] = [];
  const transactionDate = readRequiredString(body, "transactionDate", errors);
  const description = readRequiredString(body, "description", errors);
  const categoryId = readRequiredString(body, "categoryId", errors);
  const accountId = readRequiredString(body, "accountId", errors);
  const amount = readRequiredString(body, "amount", errors);
  const transactionTypeValue = getJsonValue(body, "transactionType");
  const currencyValue = getJsonValue(body, "currency");
  const transactionType = isTransactionType(transactionTypeValue) ? transactionTypeValue : undefined;
  const currency = isCurrency(currencyValue) ? currencyValue : undefined;

  if (transactionType === undefined) {
    errors.push("transactionType must be income or expense.");
  }

  if (currency === undefined) {
    errors.push("currency must be ARS or USD.");
  }

  if (transactionDate.length > 0 && !isValidDate(transactionDate)) {
    errors.push("transactionDate must be a valid YYYY-MM-DD date.");
  }

  if (description.length > 160) {
    errors.push("description must be 160 characters or fewer.");
  }

  let amountMinor: number | undefined;
  if (amount.length > 0 && currency !== undefined) {
    try {
      amountMinor = parseAmountToMinor(amount, currency);
    } catch (error) {
      const message = error instanceof MoneyInputError ? error.message : "amount is invalid.";
      errors.push(message);
    }
  }

  if (errors.length > 0 || transactionType === undefined || currency === undefined || amountMinor === undefined) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      transactionDate,
      description,
      categoryId,
      accountId,
      transactionType,
      amountMinor,
      currency,
    },
  };
}

export function validateCreateIncomeSourceRequest(body: JsonValue): IncomeSourceValidation {
  if (!isJsonObject(body)) {
    return { valid: false, errors: ["Request body must be a JSON object."] };
  }

  const errors: string[] = [];
  const name = readRequiredString(body, "name", errors);
  const amount = readRequiredString(body, "amount", errors);
  const effectiveFrom = readRequiredString(body, "effectiveFrom", errors);
  const currencyValue = getJsonValue(body, "currency");
  const frequencyValue = getJsonValue(body, "frequency");
  const statutoryBonusValue = getJsonValue(body, "statutoryBonus");
  const effectiveToValue = getJsonValue(body, "effectiveTo");

  const currency = isCurrency(currencyValue) ? currencyValue : undefined;
  const frequency = isIncomeFrequency(frequencyValue) ? frequencyValue : undefined;

  if (currency === undefined) {
    errors.push("currency must be ARS or USD.");
  }

  if (frequency === undefined) {
    errors.push("frequency must be monthly.");
  }

  if (typeof statutoryBonusValue !== "boolean") {
    errors.push("statutoryBonus must be a boolean.");
  }

  if (name.length > 80) {
    errors.push("name must be 80 characters or fewer.");
  }

  if (effectiveFrom.length > 0 && !isMonth(effectiveFrom)) {
    errors.push("effectiveFrom must be a valid YYYY-MM month.");
  }

  let effectiveTo: string | null = null;
  if (effectiveToValue !== undefined && effectiveToValue !== null) {
    if (!isString(effectiveToValue) || !isMonth(effectiveToValue.trim())) {
      errors.push("effectiveTo must be a valid YYYY-MM month or null.");
    } else {
      effectiveTo = effectiveToValue.trim();
    }
  }

  if (effectiveTo !== null && effectiveFrom.length > 0 && effectiveTo < effectiveFrom) {
    errors.push("effectiveTo must not be earlier than effectiveFrom.");
  }

  let amountMinor: number | undefined;
  if (amount.length > 0 && currency !== undefined) {
    try {
      amountMinor = parseAmountToMinor(amount, currency);
    } catch (error) {
      const message = error instanceof MoneyInputError ? error.message : "amount is invalid.";
      errors.push(message);
    }
  }

  if (amountMinor !== undefined && amountMinor === 0) {
    errors.push("amount must be greater than zero.");
  }

  if (
    errors.length > 0
    || currency === undefined
    || frequency === undefined
    || amountMinor === undefined
    || amountMinor === 0
    || typeof statutoryBonusValue !== "boolean"
  ) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      name,
      amountMinor,
      currency,
      frequency,
      statutoryBonus: statutoryBonusValue,
      effectiveFrom,
      effectiveTo,
    },
  };
}

export function validateMonthQuery(query: object, defaultMonth: string): MonthQueryValidation {
  if (!isJsonObject(query)) {
    return { valid: false, errors: ["Query parameters must be an object."] };
  }

  const value = getJsonValue(query, "month");
  if (value === undefined) {
    return { valid: true, month: defaultMonth };
  }

  if (!isString(value) || !isMonth(value)) {
    return { valid: false, errors: ["month must use YYYY-MM format."] };
  }

  return { valid: true, month: value };
}

export function validateTransactionFilters(query: object): TransactionFiltersValidation {
  if (!isJsonObject(query)) {
    return { valid: false, errors: ["Query parameters must be an object."] };
  }

  const errors: string[] = [];
  const monthValue = getJsonValue(query, "month");
  const month = readOptionalFilter(query, "month", errors);
  const categoryId = readOptionalFilter(query, "categoryId", errors);
  const accountId = readOptionalFilter(query, "accountId", errors);

  if (monthValue !== undefined && month !== undefined && !isMonth(month)) {
    errors.push("month must use YYYY-MM format.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, filters: { month, categoryId, accountId } };
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const yearPart = match?.[1];
  const monthPart = match?.[2];
  const dayPart = match?.[3];

  if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
    return false;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= 1900 &&
    year <= 2200 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
