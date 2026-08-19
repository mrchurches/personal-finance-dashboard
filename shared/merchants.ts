/**
 * Payment gateways stamp their own prefix onto the merchant name before it
 * reaches a statement, so the same shop arrives under several spellings
 * depending on who processed the payment. Categorising has to see one merchant,
 * not one per processor.
 *
 * Prefixes are stripped repeatedly because some gateways stack them: a country
 * segment can sit between the processor and the merchant.
 */
const GATEWAY_PREFIX = /^(?:MERPAGO|MPAGO|MODOQRI|MODO|MEP|DLO|PAYU|AR|UY|BR)\*/i;

/** Trailing reference, terminal or invoice numbers the issuer appends. */
const TRAILING_REFERENCE = /[\s*]+(?:N?\d{4,})$/;

/** Card statements pad columns; the padding is not part of the name. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * The key a merchant rule is stored against.
 *
 * Deliberately lossy: it is a grouping key, not a display name. The original
 * description stays on the transaction, so nothing is lost by normalising here,
 * and two spellings of one shop collapsing to one key is the entire point.
 */
export function normalizeMerchant(description: string): string {
  let value = collapseWhitespace(stripAccents(description)).toUpperCase();

  let stripped = value.replace(GATEWAY_PREFIX, "");
  while (stripped !== value) {
    value = stripped;
    stripped = value.replace(GATEWAY_PREFIX, "");
  }

  value = value.replace(TRAILING_REFERENCE, "");

  return collapseWhitespace(value);
}

/**
 * True when a description belongs to the merchant a rule was written for.
 *
 * Exact match on the normalised key rather than a prefix or substring test: a
 * rule that fires on "everything starting with A" is impossible to reason about
 * once there are dozens of them, and a wrong category applied silently across an
 * import is worse than an uncategorised row.
 */
export function matchesMerchant(description: string, merchantKey: string): boolean {
  return normalizeMerchant(description) === merchantKey;
}
