/**
 * The fee a payment gateway grosses into a charge instead of billing separately.
 *
 * It cannot be read from a statement, because it never appears as a line: the
 * charge that arrives is already the transfer plus the fee. So it has to be
 * inferred, and the only usable signature is arithmetic - a transfer is made for a
 * round amount, so a charge that divides exactly by the rate back onto a round
 * figure almost certainly carried it.
 *
 * The inference is deliberately strict. Requiring the recovered base to land on a
 * whole hundred is what makes it evidence rather than a guess: tested against the
 * whole ledger, the real rate matches hundreds of charges while neighbouring rates
 * match nearly none, and chance alone would predict about one.
 *
 * The strictness cuts the other way too, and the figures this produces are floors
 * rather than totals: a transfer for a non-round amount carries the same fee and is
 * invisible to this test. Anything reported from it should be read as "at least".
 */
export const GATEWAY_COMMISSION_MILLI = 6_990;

const MILLI_PER_UNIT = 100 * 1000;

/** Rounding step the recovered base must land on for the match to count. */
const ROUND_TRANSFER_STEP_MINOR = 100_00;

/**
 * The fee inside a charge, or null when the charge shows no sign of carrying one.
 *
 * Null is not "no fee was paid" - it is "this charge does not prove one was".
 */
export function commissionInside(amountMinor: number): number | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return null;
  }

  const baseMinor = Math.round((amountMinor * MILLI_PER_UNIT) / (MILLI_PER_UNIT + GATEWAY_COMMISSION_MILLI));
  if (baseMinor <= 0 || baseMinor % ROUND_TRANSFER_STEP_MINOR !== 0) {
    return null;
  }

  const rebuilt = baseMinor + Math.round((baseMinor * GATEWAY_COMMISSION_MILLI) / MILLI_PER_UNIT);
  return rebuilt === amountMinor ? amountMinor - baseMinor : null;
}

/** What the charge would have been without the gateway: the money actually spent. */
export function valueInside(amountMinor: number): number {
  return amountMinor - (commissionInside(amountMinor) ?? 0);
}
