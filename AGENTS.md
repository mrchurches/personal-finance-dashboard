# AI Maintainer Guide

This repository is a local personal-finance dashboard. Read `docs/AI_CONTEXT.md` before changing data, schema, import behavior, or reconciliation rules. It is excluded from version control because it carries real balances and totals.

## Non-negotiable rules

- Treat July Visa/Mastercard statements and the August card movement file as the authoritative card-charge ledger.
- Treat Mercado Pago card-funded records as lineage/reconciliation data only. Never create an additional expense for a card-funded duplicate.
- Keep statement payments, prior balances, liabilities, financial costs, rejected operations, returned operations, refunds, and incoming records outside ordinary expense totals.
- Create ordinary imported expenses only for authoritative card charges and approved available-money outflows that are real outflows. Keep the owner-self transfer in review.
- Keep every ordinary imported expense in `Uncategorized`; do not infer categories from descriptions.
- Use `statement_period` for imported-month filtering. Do not replace it with the original transaction date.
- Store money as integer minor units and never convert ARS and USD without an explicit exchange rate.
- Preserve source provenance and use the idempotent `import_key`. Do not deduplicate by description.
- Do not silently resolve ambiguous matches or alter the overdue Mastercard liability.
- Do not commit `data/finance.sqlite`, source documents, exports, or other private import data.
- Excel and CSV import is not implemented.

## Safe work sequence

1. Inspect the current schema, importer, repository queries, API guards, UI, and tests.
2. Read the current source files and compare control totals before changing code.
3. Extend explicit source fields and invariants before changing summary calculations.
4. Import into a disposable local database first, then verify control totals and reconciliation counts.
5. Run `npm test`, `npm run build`, and the API smoke check.
6. Update `docs/AI_CONTEXT.md` with new sources, decisions, totals, and unresolved review items.
