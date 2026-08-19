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

/**
 * Trailing reference, terminal, branch or invoice numbers the issuer appends.
 *
 * Two digits is enough: branch numbers are short, and a merchant whose name
 * genuinely ends in a bare number is rare enough that the grouping win is worth
 * it. A number attached to a word rather than standing alone is left alone.
 */
const TRAILING_REFERENCE = /[\s*]+N?\d{2,}$/;

/**
 * Online merchants arrive as a domain followed by whatever the processor felt
 * like appending: an authorisation code, the foreign amount, the original
 * currency, sometimes a path. All of it varies per transaction, and the path is
 * a billing endpoint rather than a different merchant, so the domain alone is
 * the identity.
 */
const DOMAIN_MERCHANT = /^([A-Z0-9][A-Z0-9.-]*\.(?:COM|COM\.AR|NET|IO|APP|TV))\b/;

/** Legal form, which the same merchant carries in some sources and not others. */
const LEGAL_SUFFIX = /\s+(?:S\.?R\.?L|S\.?A\.?S|S\.?A|SACIF|SACI|SRL|SAS)\.?$/;

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

  const domain = DOMAIN_MERCHANT.exec(value);
  if (domain !== null) {
    return domain[1] ?? value;
  }

  /*
   * Reference before legal form, not the other way round: a source that appends
   * a reference hides the legal form behind it, so stripping the form first
   * would leave one spelling with the form and the other without, splitting one
   * merchant in two.
   */
  value = value.replace(TRAILING_REFERENCE, "");
  value = value.replace(LEGAL_SUFFIX, "");

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
