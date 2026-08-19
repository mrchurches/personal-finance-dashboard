import { CURRENCY, type Currency } from "./types";

const amountPattern = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class MoneyInputError extends Error {}

/**
 * Turns what a person actually types into what the parser accepts.
 *
 * Needed because the page displays Argentine notation, where the separators are the
 * reverse of the ones the parser wants: someone copying a figure off the screen
 * types `1.234.567,89`, and someone using a numeric keypad types `1234.5`. Both are
 * the same number and both have to work.
 *
 * The rule that separates them without guessing: a separator followed by exactly one
 * or two digits, with no separator after it, is the decimal point. Every other
 * separator is thousands grouping, because a grouping group is always exactly three
 * digits. That makes `1.23` a decimal and `1.234` a grouped thousand, which is the
 * reading a person intends in both cases.
 */
export function normaliseAmountInput(rawAmount: string): string {
  const amount = rawAmount.trim().replace(/\s/g, "");
  const lastSeparator = Math.max(amount.lastIndexOf("."), amount.lastIndexOf(","));
  if (lastSeparator === -1) {
    return amount;
  }

  const fractionalPart = amount.slice(lastSeparator + 1);
  const isDecimalPoint = /^\d{1,2}$/.test(fractionalPart);
  if (!isDecimalPoint) {
    return amount.replace(/[.,]/g, "");
  }

  const wholePart = amount.slice(0, lastSeparator).replace(/[.,]/g, "");
  return `${wholePart}.${fractionalPart}`;
}

export function parseAmountToMinor(rawAmount: string, currency: Currency): number {
  if (currency !== CURRENCY.ARS && currency !== CURRENCY.USD) {
    throw new MoneyInputError("Unsupported currency.");
  }

  const amount = rawAmount.trim();
  const match = amountPattern.exec(amount);
  const wholePart = match?.[1];
  const fractionalPart = match?.[2] ?? "";

  if (wholePart === undefined) {
    throw new MoneyInputError("Amount must be a non-negative number with up to two decimals.");
  }

  const minorText = `${wholePart}${fractionalPart.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  const amountMinor = Number(minorText);

  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyInputError("Amount is outside the supported range.");
  }

  return amountMinor;
}

/**
 * Argentine notation: a dot groups thousands and a comma marks the decimal.
 *
 * Not a cosmetic preference. The page is Spanish and the money is Argentine, and in
 * that convention the two separators mean the opposite of what they mean in English.
 * Printing `2,033,413.40` to a reader who groups with dots invites them to read the
 * first three digits as a decimal - so the number is not merely unfamiliar, it is
 * wrong by a factor of a thousand, silently, in the direction that matters least
 * often and most badly.
 */
export function formatMoney(amountMinor: number, currency: Currency): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyInputError("Money must be an integer minor-unit amount.");
  }

  const sign = amountMinor < 0 ? "-" : "";
  const absoluteMinor = Math.abs(amountMinor);
  const majorPart = Math.floor(absoluteMinor / 100).toString();
  const minorPart = (absoluteMinor % 100).toString().padStart(2, "0");
  const groupedMajorPart = majorPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}${currency} ${groupedMajorPart},${minorPart}`;
}
