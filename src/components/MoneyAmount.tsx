import type { ReactElement } from "react";
import { usePrivacy } from "@/app/providers/PrivacyProvider";
import type { Currency } from "@shared/types";

/** Which way the money moved. A fact about the transaction, not a judgement. */
type Direction = "inflow" | "outflow" | "neutral";

/**
 * Whether this figure is good or bad news for the reader.
 *
 * Deliberately separate from direction, because the two answer different questions and
 * were being conflated. Direction alone painted spending that a plan had removed in the
 * green of income arriving, and rendered "clears in five cycles" and "never clears" in
 * the same neutral black - so the single most important contrast on the page was a
 * font-size tie. Colour is the channel read before any text, so it has to encode the
 * verdict where there is one.
 */
type Verdict = "good" | "bad" | "none";

interface MoneyAmountProps {
  amountMinor: number;
  currency: Currency;
  direction?: Direction;
  verdict?: Verdict;
  className?: string;
}

const directionClasses: Record<Direction, string> = {
  inflow: "text-success",
  outflow: "text-accent-terracotta",
  neutral: "text-text",
};

const verdictClasses: Record<Verdict, string> = {
  good: "text-success",
  bad: "text-error",
  none: "",
};

export function MoneyAmount({
  amountMinor,
  currency,
  direction = "neutral",
  verdict = "none",
  className = "",
}: MoneyAmountProps): ReactElement {
  const { money } = usePrivacy();

  /* A stated verdict wins: it answers the question the reader is actually asking. */
  const colour = verdict === "none" ? directionClasses[direction] : verdictClasses[verdict];

  return (
    <span className={`font-medium tabular-nums ${colour} ${className}`.trim()}>
      {money(amountMinor, currency)}
    </span>
  );
}
