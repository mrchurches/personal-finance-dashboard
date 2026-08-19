import type { ReactElement } from "react";
import { formatMoney } from "@shared/money";
import type { Currency } from "@shared/types";

type Direction = "inflow" | "outflow" | "neutral";

interface MoneyAmountProps {
  amountMinor: number;
  currency: Currency;
  direction?: Direction;
  className?: string;
}

const directionClasses: Record<Direction, string> = {
  inflow: "text-success",
  outflow: "text-accent-terracotta",
  neutral: "text-text",
};

export function MoneyAmount({
  amountMinor,
  currency,
  direction = "neutral",
  className = "",
}: MoneyAmountProps): ReactElement {
  return (
    <span className={`font-medium tabular-nums ${directionClasses[direction]} ${className}`.trim()}>
      {formatMoney(amountMinor, currency)}
    </span>
  );
}
