# Personal finance dashboard

A local tool for one specific problem: understanding a credit-card debt well enough to
get out of it, when the debt is larger than the income and the statements are Argentine.

It reads card statements and gateway exports, works out what is genuinely committed
versus what is a choice, and projects when the debt clears. It runs on your machine
against a SQLite file that never leaves it.

This is not a general personal-finance app, and it is not trying to become one. See
[What it is not](#what-it-is-not).

## What it works out

- **When the debt clears, and under what assumption.** The projection charges recurring
  commitments plus instalments already owed, and assumes discretionary spending stops.
  That is a freeze scenario rather than a forecast, so the dashboard shows both endings
  side by side — the payoff if that spending really stops, and the payoff if it carries
  on at the level actually observed. The gap between them is what the plan is worth.
- **What is a commitment and what is a choice.** Merchants that come back every cycle
  are separated from ones that appeared once, by measurement rather than by category.
  Only the first kind is charged to future cycles.
- **What one cost is worth if it stops.** Each recurring cost is priced by re-running the
  whole projection without it, because interest compounds and dividing the balance by the
  amount would miss that.
- **Costs the statements cannot show.** A plan signed last month, a cash envelope
  replacing card spending, a fee that ends — these are declared by hand and say how they
  meet what was already detected, so the same money is never counted twice.
- **Charges that do not fit.** A payment skipped and then billed double looks identical
  to a price rise; the two mean opposite things, and only one needs acting on.
- **A fee that never appears as a line.** One payment gateway grosses its percentage into
  the charge itself. It has to be inferred rather than read, and the tool says so wherever
  it reports a figure that depends on the inference.

## Requirements

- Node.js 20.19 or newer, and npm
- `pdftotext` **from Poppler**, on `PATH` or at `PDFTOTEXT_PATH`

The Poppler requirement is not incidental. Another widely installed project ships a
`pdftotext` under the same name whose `-layout` output differs, and reading a statement
with it silently drops rows and mis-pairs amounts rather than failing. The importer probes
the binary before reading anything and refuses to run against the wrong one. On Windows,
Git Bash resolves Git's own build first, so setting `PDFTOTEXT_PATH` explicitly is usually
necessary.

## Running it

```text
npm install
npm run dev       # API on 127.0.0.1:3001, dashboard on 127.0.0.1:5173
npm run import    # reads the source documents and loads the database
npm test
npm run build
```

The database is created at `data/finance.sqlite` on first start and migrated in place
afterwards. Reference data is seeded idempotently.

## Using it with your own statements

The parsers currently expect Argentine Visa and Mastercard statements as PDF, plus two
plain-text exports from a payment gateway. The list of source files is declared in
`server/importer.ts`, and today it is **hard-coded**: pointing the importer at your own
documents means editing that list. Making it configurable is the change that would turn
this from one person's tool into a tool, and it has not been made yet.

If your issuer is not one of those two, the honest answer is that adding it means writing
a parser. There is deliberately no generic CSV mapping: guessing which column is an
instalment counter is exactly the class of mistake that produces confident wrong numbers,
and the value of this tool is that it does not guess.

## Domain decisions worth knowing

These are not obvious, and every figure in the dashboard depends on them.

- **The unit of time is the statement cycle, not the calendar month.** A cycle closes late
  in the month and is paid in the first days of the next, so a purchase on the 28th can
  land on the following statement. Cycles are keyed `YYYY-MM` from the midpoint of the
  period they cover.
- **Money is stored as integer minor units; rates as integer thousandths of a percent.**
  No floating point ever touches an amount.
- **Recurring cost per cycle is a median, not an average.** One strange month must not move
  what is charged every month — which is also why odd months are reported separately
  instead of being absorbed silently.
- **A cost is a merchant within a category, not a merchant.** One counterparty can carry
  two unrelated costs, and a statement about one is not a statement about the other.
- **Interest is charged on the unpaid part of the opening balance, never on the cycle's new
  charges.** A purchase is interest-free until its own statement falls due, and charging it
  immediately would overstate the cost.
- **The effective monthly rate is the published rate grossed up for tax.** The rate printed
  on a statement excludes VAT on the interest, so it is not what is actually paid.
- **Currency is never converted without a rate that was stated for a date.** Where several
  exchange rates exist at once, a converted figure without both is not an approximation but
  an invented number, and on screen it is indistinguishable from a real one.

## What it is not

- Not multi-user, not hosted, and not authenticated. It binds to localhost.
- Not a budgeting app. It does not plan categories forward or set targets for you.
- Not an importer for arbitrary banks. See the section above.
- Not financial advice. It reports what the statements say and what follows arithmetically.

## Privacy

The database, the source documents and the operating notes stay out of version control.
`docs/` is ignored entirely because it carries balances, income and counterparty names.

The repository carries the reasoning and none of the record. No real amount, balance,
salary, counterparty or document number belongs in code, comments, or commit messages —
including as an "illustrative" example, which is precisely how two of them once got in.
[`AGENTS.md`](AGENTS.md) has the check to run before committing.

The dashboard also has a switch that masks every amount on screen, for showing the tool to
someone without showing them the numbers.

## Layout

```text
server/    Express API, SQLite schema and migrations, importer, analysis modules
shared/    Types, guards and money handling used by both sides
src/       React dashboard: panels, i18n catalogues, theme
tests/     Vitest suites for the parts where a wrong answer is silent
```

Spanish is the interface default; English is a complete mirror. Both catalogues are
key-checked at compile time against the Spanish one.
