# AI maintainer guide

A local dashboard for understanding and paying off Argentine credit-card debt. Read
[`README.md`](README.md) for what it does; this file is the checklist for changing it.

`docs/AI_CONTEXT.md` and `docs/ROADMAP.md` carry the findings, the decisions and the
figures. They are excluded from version control because they carry real balances, income
and counterparty names. Read them in a working clone before touching data, schema, import
behaviour or reconciliation.

## Privacy: the rule that has no exceptions

**No real value appears in code, comments, or commit messages.** Not a balance, not a
salary, not a counterparty, not a merchant, not a document number, and not an
"illustrative" figure lifted from real data — that last one is exactly how two of them got
into this repository and stayed until an audit found them.

The rule is absolute on purpose. Deciding case by case whether one figure matters is a
judgement that gets made wrong eventually, and the damage is only ever visible in
aggregate.

Run this before every commit, over the staged diff and the message you are about to write:

```bash
git diff --cached | grep -nE '^\+' | grep -inE '[0-9]{1,3}[.,][0-9]{3}([.,][0-9]{2})?|[0-9]{5,}'
```

It matches both notations, dotted and comma-grouped, from three digits before the
separator up, plus any bare run of five digits or more. An earlier version required six
consecutive digits and let through a four-figure charge, which is how one survived until
an audit found it.

It does not fire on dates, cycle keys, version numbers, ports, percentages or colour
values, so a hit is worth reading rather than dismissing. Write the check into prose
instead of quoting a sample figure: this paragraph tripped its own rule on the first
attempt, using the very charge that had just been removed from the history.

Never commit `data/finance.sqlite`, source statements, exports, or anything under `docs/`.

## Rules that protect the numbers

- **Money is integer minor units. Rates are integer thousandths of a percent.** No float
  ever touches an amount.
- **Never convert between currencies without a rate that was stated for a date.** Absence
  of a rate is reported as absence, never filled in.
- **`statement_period` is the filtering key**, not the transaction date. The cycle is the
  unit; a purchase near the close belongs to the statement that bills it.
- **Preserve source provenance and the idempotent `import_key`.** Never deduplicate by
  description.
- **A pattern is keyed by merchant and category together.** One counterparty can carry two
  unrelated costs. Anything that treats a merchant as a single cost will eventually
  displace or credit the wrong one.
- **Rules assign categories; they never withdraw them.** Anything that changes a charge's
  identity has to release a rule-given category explicitly, or the charge keeps one that no
  longer applies.
- **A category set by hand is never overwritten by a rule.** That is what makes a
  per-charge decision durable, and it is why such a decision must remain undoable.
- **Keep payments, prior balances, financial costs, rejected and returned operations,
  refunds and incoming records out of ordinary expense totals.**
- **Gateway records that funded a card charge are lineage, not a second expense.**
- **Do not silently resolve an ambiguous match.** Leave it in review and say so.

## Rules that protect the reader

The dashboard is read by someone who does not know finance and wants to. Two consequences
that are easy to violate without noticing:

- **A figure that is conditional must say what it is conditional on**, in visible text.
  The headline payoff is a freeze scenario; presenting it without that is a promise rather
  than a target.
- **Tooltips carry definitions only.** Anything the reader is meant to do, and any verdict
  about whether a number is good news, has to be visible — a reader on a touch screen never
  hovers.
- **A partial figure says it is partial.** An open cycle is missing charges and has not been
  billed interest; presented as final it reads as a frugal month.

## Before committing

1. Read the existing code before changing it. The doc comments carry the reasoning for
   decisions that look arbitrary and are not.
2. `npx tsc --noEmit` and `npm test`.
3. Verify against the real database, not only against types: import into a disposable copy
   and compare control totals when the change touches money.
4. Run the privacy check above over the staged diff **and** the commit message.
5. Do not run `npm run build` unless asked.
