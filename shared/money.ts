import { CURRENCY, type Currency } from "./types";

const amountPattern = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class MoneyInputError extends Error {}

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

export function formatMoney(amountMinor: number, currency: Currency): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyInputError("Money must be an integer minor-unit amount.");
  }

  const sign = amountMinor < 0 ? "-" : "";
  const absoluteMinor = Math.abs(amountMinor);
  const majorPart = Math.floor(absoluteMinor / 100).toString();
  const minorPart = (absoluteMinor % 100).toString().padStart(2, "0");
  const groupedMajorPart = majorPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}${currency} ${groupedMajorPart}.${minorPart}`;
}
