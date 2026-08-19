# Local Money Ledger

A local personal-finance dashboard backed by SQLite. Detailed July 2026 card statements and August 2026 card movements are imported line by line, while Mercado Pago history is retained as a reconciliation ledger.

Read `docs/AI_CONTEXT.md` before changing the schema, importing data, or interpreting totals. [`AGENTS.md`](AGENTS.md) contains the short maintainer checklist.

The operating notes (`docs/AI_CONTEXT.md`, `docs/ROADMAP.md`) are kept out of
version control on purpose: they carry real balances, income and control totals.
They live in `docs/` in a working clone.

## Prerequisites

- Node.js 20.19 or newer
- npm

## Commands

```text
npm install
npm run dev
npm run import
npm test
npm run build
npm run preview
```

`npm run dev` starts the Express API on `http://127.0.0.1:3001` and the Vite dashboard on `http://127.0.0.1:5173`. Vite proxies `/api` requests to the API.

`npm run import` reads the four authoritative local source files from the sibling `resumenes` directory, migrates the local database if necessary, and performs an idempotent detailed import. 

The PDF importer requires `pdftotext` **from Poppler**. Another project ships a
`pdftotext` under the same name with different `-layout` behaviour, and reading a
statement with it silently drops rows and mis-pairs amounts rather than failing.
The importer checks the binary before reading anything and refuses to run
otherwise. Set `PDFTOTEXT_PATH` to an explicit binary when `PATH` order is not
dependable; on Windows, Git Bash resolves Git's own build first.

## Local database

The database is created at `data/finance.sqlite` when the API starts. The schema is initialized automatically. SQLite files, WAL files, and shared-memory files are ignored by Git.

The database is initialized with reference categories/accounts and the overdue Mastercard liability. The old aggregate transaction seed is removed during migration; manual rows are preserved. The liability remains separate from current card-charge transactions so the same amount is not counted twice. USD values remain separate because no exchange rate is provided.

Reference data is versioned and idempotent. New manual records can be added from the dashboard form. The API accepts `POST /api/transactions` with a date, description, category ID, account ID, `income` or `expense` type, a decimal amount string, and `ARS` or `USD` currency. The server validates the request and stores the amount as integer minor units.

## API

- `GET /api/summary?month=YYYY-MM`
- `GET /api/transactions?month=YYYY-MM&categoryId=...&accountId=...`
- `GET /api/source-records?month=YYYY-MM`
- `GET /api/reconciliation?month=YYYY-MM`
- `POST /api/transactions`
- `GET /api/categories`
- `GET /api/accounts`

The summary gap is an ARS signed balance: monthly income minus current ARS card charges minus open ARS liabilities. Financial costs are reported separately. USD is displayed separately and is not converted into ARS.

## Privacy boundary

This application is local software for sensitive financial data. Do not commit or publish `data/finance.sqlite`, source statements, exports, or other identifying financial information. Excel and CSV import are not implemented and remain a later slice.
