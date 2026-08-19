import type { SqliteDatabase } from "./database";
import { getSpendingPatterns, type SpendingPattern } from "./spending-patterns";

/**
 * How a declared amount meets what the detector already found.
 *
 * The detector can only see what has already been billed, so it is blind to
 * anything decided but not yet charged, and slow on anything too new to have
 * repeated. Declaring the amount is the only way to state it. But a declaration
 * placed next to a detection without saying how the two relate is worse than
 * nothing, because it silently counts the same money twice.
 *
 * `addition` is for a cost the detector will never see: paid in cash, or off the
 * card entirely. Nothing is removed.
 *
 * `override` names a merchant. It adds the declared amount and removes the
 * detected median for that merchant, which makes it safe for a cost that is real
 * now but still invisible: recurrence needs three cycles, so a commitment signed
 * last month reads as one-off for another two. Until the detector catches up
 * there is nothing to remove and the override behaves as an addition; the moment
 * it does, the removal starts and the figure never doubles.
 *
 * `substitution` names categories instead. It adds the declared amount and
 * removes the detected recurring spending it displaces, which is the only honest
 * way to model paying for something differently rather than additionally.
 *
 * `override` and `termination` may name a category alongside the merchant. They have
 * to be able to: one counterparty can carry two unrelated costs, and a statement
 * about one of them is not a statement about the other.
 *
 * `termination` says a cost stops. It charges nothing and removes the merchant's
 * detected amount from the period it takes effect onward. The detector cannot
 * derive this: a plan with a known number of instalments left, or a subscription
 * about to be cancelled, looks exactly like one that continues forever until the
 * cycle it fails to appear in - by which time the projection has already spent
 * months charging for it.
 */
export type CommitmentEffect = "addition" | "override" | "substitution" | "termination";

export interface Commitment {
  id: number;
  label: string;
  amountMinor: number;
  currency: string;
  effect: CommitmentEffect;
  merchantKey: string | null;
  /** Narrows the merchant to one of its costs. Null means all of them. */
  categoryId: string | null;
  /** Fee grossed into the charge rather than billed as a line, thousandths of a percent. */
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
  replacedCategoryIds: string[];
}

/** What one commitment does to one cycle. */
export interface CommitmentLine {
  id: number;
  label: string;
  effect: CommitmentEffect;
  /** The declared amount plus its fee. What the card is actually charged. Zero for a termination. */
  chargedMinor: number;
  /**
   * What it will charge once it is live, whatever cycle is being looked at.
   *
   * Reported so the panel can say what a commitment is going to do before it starts,
   * without recomputing the fee in the interface - the same arithmetic in two places
   * drifts, and this one has a rate in it.
   */
  wouldChargeMinor: number;
  /** Detected recurring spending this commitment takes the place of. */
  displacedMinor: number;
  /** Charged minus displaced. Negative means the plan is a cut, not a cost. */
  netMinor: number;
  /**
   * The costs this displaced, each named as merchant plus category.
   *
   * Not merchant alone: one merchant can carry two unrelated costs, and only one
   * of them may be the one a substitution replaces.
   */
  displacedKeys: string[];
  applies: boolean;
  /**
   * Why it did not apply to this cycle. Reported rather than hidden: a
   * commitment silently skipped looks identical to one that was never declared.
   */
  skippedReason: "not-yet" | "ended" | "currency-not-projected" | null;
}

export interface ResolvedCommitments {
  period: string;
  chargedMinor: number;
  displacedMinor: number;
  netMinor: number;
  lines: CommitmentLine[];
}

interface CommitmentRow {
  id: number;
  label: string;
  amountMinor: number;
  currency: string;
  effect: CommitmentEffect;
  merchantKey: string | null;
  categoryId: string | null;
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
}

interface ReplacementRow {
  commitmentId: number;
  categoryId: string;
}

interface CategoryEdgeRow {
  id: string;
  parentId: string | null;
}

interface CommitmentInsert {
  label: string;
  amountMinor: number;
  currency: string;
  effect: CommitmentEffect;
  merchantKey: string | null;
  categoryId: string | null;
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
}

const commitmentSelect = `
  SELECT
    id,
    label,
    amount_minor AS amountMinor,
    currency,
    effect,
    merchant_key AS merchantKey,
    category_id AS categoryId,
    fee_milli AS feeMilli,
    effective_from AS effectiveFrom,
    effective_to AS effectiveTo,
    note,
    created_at AS createdAt
  FROM commitments
`;

/** The currency the projection runs in. Anything else is stored but not projected. */
const PROJECTED_CURRENCY = "ARS";

const PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

const SUPPORTED_CURRENCIES = ["ARS", "USD"];

const MAXIMUM_LABEL_LENGTH = 200;
const MAXIMUM_NOTE_LENGTH = 2000;

/*
 * Bounds that keep every derived figure a safe integer.
 *
 * Not arbitrary caution: an amount near Number.MAX_SAFE_INTEGER survives the
 * database CHECK, and then the charge, its fee and the per-cycle sums lose
 * precision. The response stops satisfying its own type guard, so the panel
 * renders an error over an empty table - and the row that caused it can no
 * longer be deleted from the UI, because the UI can no longer list it.
 */
const MAXIMUM_AMOUNT_MINOR = 100_000_000_000;
const MAXIMUM_FEE_MILLI = 100_000;

export function listCommitments(database: SqliteDatabase): Commitment[] {
  const rows = database
    .prepare<[], CommitmentRow>(`${commitmentSelect} ORDER BY effective_from, id`)
    .all();

  const replacements = database
    .prepare<[], ReplacementRow>(
      `SELECT commitment_id AS commitmentId, category_id AS categoryId
       FROM commitment_replacements
       ORDER BY commitment_id, category_id`,
    )
    .all();

  const byCommitment = new Map<number, string[]>();
  for (const replacement of replacements) {
    const existing = byCommitment.get(replacement.commitmentId);
    if (existing === undefined) {
      byCommitment.set(replacement.commitmentId, [replacement.categoryId]);
      continue;
    }
    existing.push(replacement.categoryId);
  }

  return rows.map((row) => ({ ...row, replacedCategoryIds: byCommitment.get(row.id) ?? [] }));
}

export interface CommitmentInput {
  label: string;
  amountMinor: number;
  currency: string;
  effect: CommitmentEffect;
  merchantKey: string | null;
  categoryId: string | null;
  feeMilli: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  replacedCategoryIds: string[];
}

export function createCommitment(
  database: SqliteDatabase,
  input: CommitmentInput,
  createdAt: string,
): Commitment {
  if (input.label.trim().length === 0) {
    throw new Error("A commitment needs a label.");
  }

  if (input.label.length > MAXIMUM_LABEL_LENGTH) {
    throw new Error(`A label cannot be longer than ${MAXIMUM_LABEL_LENGTH} characters.`);
  }

  if (input.note !== null && input.note.length > MAXIMUM_NOTE_LENGTH) {
    throw new Error(`A note cannot be longer than ${MAXIMUM_NOTE_LENGTH} characters.`);
  }

  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    throw new Error(`The currency must be one of ${SUPPORTED_CURRENCIES.join(", ")}.`);
  }

  if (
    !Number.isSafeInteger(input.amountMinor)
    || input.amountMinor <= 0
    || input.amountMinor > MAXIMUM_AMOUNT_MINOR
  ) {
    throw new Error("The amount per cycle must be a positive whole number of minor units, within range.");
  }

  if (!Number.isSafeInteger(input.feeMilli) || input.feeMilli < 0 || input.feeMilli > MAXIMUM_FEE_MILLI) {
    throw new Error("The fee must be between zero and 100 percent, in thousandths of a percent.");
  }

  if (!PERIOD_PATTERN.test(input.effectiveFrom)) {
    throw new Error("effectiveFrom must be a period in YYYY-MM form.");
  }

  if (input.effectiveTo !== null && !PERIOD_PATTERN.test(input.effectiveTo)) {
    throw new Error("effectiveTo must be a period in YYYY-MM form.");
  }

  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    throw new Error("effectiveTo cannot fall before effectiveFrom.");
  }

  if (
    (input.effect === "override" || input.effect === "termination")
    && (input.merchantKey === null || input.merchantKey.length === 0)
  ) {
    throw new Error("An override or a termination must name the merchant it speaks about.");
  }

  if (input.effect === "substitution" && input.replacedCategoryIds.length === 0) {
    throw new Error("A substitution must name at least one category it replaces.");
  }

  if (input.categoryId !== null) {
    const found = database
      .prepare<[string], { id: string }>("SELECT id FROM categories WHERE id = ?")
      .get(input.categoryId);
    if (found === undefined) {
      throw new Error(`The category ${input.categoryId} does not exist.`);
    }
  }

  /*
   * An override on an instalment-driven merchant would charge the same purchase
   * twice. Its cost is already carried forward by the committed-instalment
   * calendar, and displacement deliberately never touches those merchants, so the
   * override would find nothing to remove and simply add its amount on top.
   */
  if (input.effect === "override" && input.merchantKey !== null) {
    const pattern = getSpendingPatterns(database).find(
      (candidate) => candidate.merchantKey === input.merchantKey,
    );
    if (pattern !== undefined && pattern.drivenByInstallments) {
      throw new Error(
        "That merchant is billed in instalments, which the instalment calendar already carries forward; an override would charge it twice.",
      );
    }
  }

  /*
   * Only what the effect actually reads is stored. A merchant kept on an addition
   * or categories kept on an override are never consulted, and a later reader
   * would reasonably assume they mean something.
   */
  const namesMerchant = input.effect === "override" || input.effect === "termination";
  const merchantKey = namesMerchant ? input.merchantKey : null;
  const categoryId = namesMerchant ? input.categoryId : null;
  const replacedCategoryIds = input.effect === "substitution" ? input.replacedCategoryIds : [];

  /*
   * Categories are checked here rather than left to the foreign key so the
   * caller gets one clear message. A failed constraint inside the transaction
   * would report the constraint, not which category was wrong.
   */
  for (const categoryId of replacedCategoryIds) {
    const found = database
      .prepare<[string], { id: string }>("SELECT id FROM categories WHERE id = ?")
      .get(categoryId);
    if (found === undefined) {
      throw new Error(`The category ${categoryId} does not exist.`);
    }
  }

  const run = database.transaction(() => {
    const result = database
      .prepare<CommitmentInsert, void>(
        `INSERT INTO commitments
          (label, amount_minor, currency, effect, merchant_key, category_id, fee_milli, effective_from, effective_to, note, created_at)
         VALUES
          (@label, @amountMinor, @currency, @effect, @merchantKey, @categoryId, @feeMilli, @effectiveFrom, @effectiveTo, @note, @createdAt)`,
      )
      .run({
        label: input.label.trim(),
        amountMinor: input.amountMinor,
        currency: input.currency,
        effect: input.effect,
        merchantKey,
        categoryId,
        feeMilli: input.feeMilli,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        note: input.note,
        createdAt,
      });

    const commitmentId = Number(result.lastInsertRowid);
    for (const categoryId of replacedCategoryIds) {
      database
        .prepare<{ commitmentId: number; categoryId: string }, void>(
          `INSERT OR IGNORE INTO commitment_replacements (commitment_id, category_id)
           VALUES (@commitmentId, @categoryId)`,
        )
        .run({ commitmentId, categoryId });
    }

    return commitmentId;
  });

  const commitmentId = run();
  const created = listCommitments(database).find((commitment) => commitment.id === commitmentId);
  if (created === undefined) {
    throw new Error("The created commitment could not be read back.");
  }

  return created;
}

export function deleteCommitment(database: SqliteDatabase, id: number): { deleted: number } {
  const run = database.transaction(() => {
    database
      .prepare<[number], void>("DELETE FROM commitment_replacements WHERE commitment_id = ?")
      .run(id);

    return database.prepare<[number], void>("DELETE FROM commitments WHERE id = ?").run(id).changes;
  });

  return { deleted: run() };
}

/**
 * Expands categories to include their descendants.
 *
 * Replacing "food" has to mean replacing groceries, eating out and delivery as
 * well, otherwise a substitution declared against a parent would displace
 * nothing at all: transactions attach to leaves, so the parent itself never
 * carries an amount.
 */
function expandCategories(database: SqliteDatabase, categoryIds: string[]): Set<string> {
  const edges = database
    .prepare<[], CategoryEdgeRow>("SELECT id, parent_id AS parentId FROM categories")
    .all();

  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.parentId === null) {
      continue;
    }
    const existing = children.get(edge.parentId);
    if (existing === undefined) {
      children.set(edge.parentId, [edge.id]);
      continue;
    }
    existing.push(edge.id);
  }

  const expanded = new Set<string>();
  const pending = [...categoryIds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || expanded.has(current)) {
      continue;
    }
    expanded.add(current);
    pending.push(...(children.get(current) ?? []));
  }

  return expanded;
}

function chargedWithFee(amountMinor: number, feeMilli: number): number {
  return amountMinor + Math.round((amountMinor * feeMilli) / 100 / 1000);
}

/**
 * Works out what the declared commitments do to one cycle.
 *
 * Every detected merchant can be displaced at most once, across all commitments,
 * resolved in declaration order. Two overlapping substitutions would otherwise
 * remove the same groceries twice and manufacture a surplus that does not exist,
 * and because the second removal would look identical to the first in the
 * totals, the plan would read best exactly when it was wrong.
 *
 * Patterns are passed in rather than queried so a projection can resolve every
 * cycle of its horizon against one detection pass.
 */
export function resolveCommitments(
  database: SqliteDatabase,
  period: string,
  patterns: SpendingPattern[],
  commitments: Commitment[] = listCommitments(database),
): ResolvedCommitments {
  /*
   * Only the costs the baseline actually charges can be displaced, and a cost is
   * a merchant within a category rather than a merchant. Instalment-driven ones
   * are carried by the committed-instalment calendar instead, and removing them
   * here would credit the plan for a saving the projection never made.
   */
  const displaceable = new Map<string, SpendingPattern>();
  for (const pattern of patterns) {
    if (pattern.recurrence === "recurring" && pattern.isActive && !pattern.drivenByInstallments) {
      displaceable.set(pattern.patternKey, pattern);
    }
  }

  const consumed = new Set<string>();
  const lines: CommitmentLine[] = [];

  for (const commitment of commitments) {
    const skippedReason: CommitmentLine["skippedReason"] =
      commitment.currency !== PROJECTED_CURRENCY
        ? "currency-not-projected"
        : period < commitment.effectiveFrom
          ? "not-yet"
          : commitment.effectiveTo !== null && period > commitment.effectiveTo
            ? "ended"
            : null;

    if (skippedReason !== null) {
      lines.push({
        id: commitment.id,
        label: commitment.label,
        effect: commitment.effect,
        chargedMinor: 0,
        wouldChargeMinor:
          commitment.effect === "termination"
            ? 0
            : chargedWithFee(commitment.amountMinor, commitment.feeMilli),
        displacedMinor: 0,
        netMinor: 0,
        displacedKeys: [],
        applies: false,
        skippedReason,
      });
      continue;
    }

    const displacedKeys: string[] = [];
    if (
      (commitment.effect === "override" || commitment.effect === "termination")
      && commitment.merchantKey !== null
    ) {
      /*
       * Both name a merchant, and may narrow it to one of that merchant's costs.
       * Narrowing matters: one counterparty here is a debt instalment plus the
       * household money paid to the same person, and ending the instalment plan is
       * not a statement about the household money. An override then charges its own
       * figure in place of what it removed; a termination charges nothing, which is
       * the whole difference between them.
       */
      for (const [key, pattern] of displaceable) {
        const namesThisCost =
          pattern.merchantKey === commitment.merchantKey
          && (commitment.categoryId === null || pattern.categoryId === commitment.categoryId);
        if (namesThisCost && !consumed.has(key)) {
          displacedKeys.push(key);
        }
      }
    } else if (commitment.effect === "substitution") {
      const replaced = expandCategories(database, commitment.replacedCategoryIds);
      for (const [key, pattern] of displaceable) {
        if (replaced.has(pattern.categoryId) && !consumed.has(key)) {
          displacedKeys.push(key);
        }
      }
    }

    for (const key of displacedKeys) {
      consumed.add(key);
    }

    /*
     * A termination charges nothing. Its declared amount records what the owner
     * expected to stop, which is worth keeping beside what actually stopped.
     */
    const chargedMinor =
      commitment.effect === "termination"
        ? 0
        : chargedWithFee(commitment.amountMinor, commitment.feeMilli);
    const displacedMinor = displacedKeys.reduce(
      (total, key) => total + (displaceable.get(key)?.typicalPerCycleMinor ?? 0),
      0,
    );

    lines.push({
      id: commitment.id,
      label: commitment.label,
      effect: commitment.effect,
      chargedMinor,
      wouldChargeMinor: chargedMinor,
      displacedMinor,
      netMinor: chargedMinor - displacedMinor,
      displacedKeys,
      applies: true,
      skippedReason: null,
    });
  }

  const chargedMinor = lines.reduce((total, line) => total + line.chargedMinor, 0);
  const displacedMinor = lines.reduce((total, line) => total + line.displacedMinor, 0);

  return {
    period,
    chargedMinor,
    displacedMinor,
    netMinor: chargedMinor - displacedMinor,
    lines,
  };
}
