# The import format

Three CSV files. Only the first is required, and the tool tells you what the other two
would have added rather than guessing at them.

```bash
npm run import:csv -- charges.csv cycles.csv income.csv
```

Working examples of all three are in [`samples/`](samples/). They are made up, they
reconcile with each other, and they are also the demo dataset:

```bash
npm run demo   # imports samples/ into a throwaway data/demo.sqlite
```

## Why three files and not one

They answer three different questions, and only the first can be exported from anywhere.

| File | Answers | Where it comes from |
| --- | --- | --- |
| `charges.csv` | Where the money went | Your statement or your bank's export |
| `cycles.csv` | What you owe and what carrying it costs | The top of the statement |
| `income.csv` | What you can pay with | You. Nothing exports this |

A spending report needs only the first. A payoff plan needs all three, because it has to
answer a question about a month that has not happened yet: how long until this is over. It
cannot get that from a list of past charges.

If you skip `income.csv`, every projection will report that the debt never clears. That is
not a bug and not a verdict on your finances — it is what the arithmetic says about an
income of zero.

## charges.csv

One row per line on the statement. Not one per purchase: an instalment plan puts one line
on each statement, and each of those is a row.

```csv
date,description,amount,currency,account,cycle,kind,installment
2026-03-04,SUPERMARKET NORTH,84300.00,ARS,Blue Card,2026-03,charge,
2026-03-14,FURNITURE STORE,62000.00,ARS,Blue Card,2026-03,charge,1/6
2026-03-27,CARD PAYMENT,310000.00,ARS,Blue Card,2026-03,payment,
```

| Column | Required | Notes |
| --- | --- | --- |
| `date` | yes | `YYYY-MM-DD`. When it happened. |
| `description` | yes | Copy the statement's wording, however ugly. |
| `amount` | yes | Always positive. See below. |
| `currency` | yes | `ARS` or `USD`. |
| `account` | yes | Free text: `Blue Card`, `Wallet`. Same spelling every time. |
| `cycle` | no | `YYYY-MM`. Defaults to the month in `date`, which is often wrong. |
| `kind` | yes | One of the seven below. |
| `installment` | no | `3/6` — third of six. |

### Every amount is positive

There is no minus sign anywhere in the format. Whether a row adds to what you owe or
subtracts from it is decided by its `kind`, never by its sign.

This is deliberate. Exports disagree about which direction is negative — some flip the sign
on a credit, some on a debit, some only in one section — and a file that means the opposite
of what you think is a file that produces a confident wrong answer. Saying it in a word
instead makes the mistake visible while you are writing it.

Write amounts as `84300.00` or `84.300,00`. Both are read; the rule is that a separator
followed by exactly one or two digits at the end of the number is the decimal point.

### The seven kinds

| `kind` | What it is | Effect |
| --- | --- | --- |
| `charge` | A purchase | Counts as spending, adds to the balance |
| `payment` | Money you paid the card | Not spending. Reduces the balance |
| `financing_cost` | Interest, VAT and perceptions on it | Not spending. Adds to the balance |
| `refund` | A charge given back | Not spending. Reduces the balance |
| `rejected` | Declined, never went through | Recorded, counts as nothing |
| `returned` | Reversed after the fact | Recorded, counts as nothing |
| `cash` | Cash you took out and spent | Counts as spending, on its own account |

The distinction that matters most is `charge` against `payment` and `financing_cost`.

Paying the card is not an expense. It is moving money you already spent from one place to
another, and a report that counts it twice will tell you that you spend far more than you
do — and will tell you that you spend more in the months you got out of debt fastest.

Interest is not an expense either, in the sense that no decision of yours produced it this
month. It is the price of a decision already made. Keeping it separate is what lets the
dashboard tell you what carrying the balance costs, which is the number that decides
whether paying more this month is worth it.

`rejected` and `returned` are kept rather than deleted, because a run of declines is worth
seeing. They count as nothing.

`cash` is for money withdrawn and then spent, and it should name a different account from
the card — `Wallet`, say. That account is created as cash rather than as a card, inferred
from the fact that nothing but cash movements ever appear on it. Cash taken as an advance
against a card is not this: it is billed like any other charge, so leave it on the card.

### The cycle, and why the date is not enough

A credit-card statement does not close on the last day of the month. A purchase made after
the close is billed on the following statement, and it is that statement it belongs to,
because that is when it becomes money you owe.

The `cycle` column is that statement, written `YYYY-MM`. Everything in the dashboard groups
by it. Left blank it falls back to the month in `date`, which is right most of the time and
wrong for exactly the purchases near the close — the ones that move between months and make
two statements look like something happened.

### Instalments

`installment` is written `3/6`: the third of six. The `amount` on that row is what this
statement bills, not the total price.

Instalments are the reason a payoff plan can look further ahead than the last statement.
Six instalments of a known amount are six months of already-decided spending, and the
projection counts them as such — that is why `3/6` is worth writing down even though the
dashboard would otherwise be none the wiser.

## cycles.csv

One row per statement, per card. This is the part people skip, and it is what turns a
spending report into a plan.

```csv
account,cycle,opened_on,closed_on,due_on,closing_balance,closing_balance_usd,minimum_payment,monthly_rate
Blue Card,2026-03,2026-02-28,2026-03-27,2026-04-04,432423.50,0.00,64863.52,8.579
```

| Column | Required | Notes |
| --- | --- | --- |
| `account` | yes | Spelled as in `charges.csv`. |
| `cycle` | yes | `YYYY-MM`. |
| `opened_on` `closed_on` `due_on` | yes | `YYYY-MM-DD`. |
| `closing_balance` | yes | What the statement says you owe. |
| `closing_balance_usd` | no | The dollar balance, settled separately. Defaults to zero. |
| `minimum_payment` | no | The smallest payment the card accepts. |
| `monthly_rate` | no | Percent per month, `8.579`. Not per year. |

### What a closing balance means beyond the number

It is also the signal that the cycle is over. A card prints next month's dates in advance,
so a row can exist for a cycle still running, but it cannot state a balance for one whose
charges have not stopped arriving.

The dashboard uses that to keep open cycles out of every average and comparison. An open
cycle is missing charges and has not been billed its interest, so shown beside finished
ones it looks like a frugal month. That is the most flattering way to be wrong about your
own spending, and it is worth going out of the way to avoid.

### The rate, and the number that is not printed anywhere

State the rate the card publishes. The dashboard then works out what a balance actually
costs, which is a larger number, because tax rides on the interest.

It does that by comparing what you were charged against what the published rate alone
would produce, over the balance you actually carried. The ratio is reported next to the
rate. If the two disagree by more than a wide margin, that is flagged rather than averaged
away — a rate misread by a factor of ten looks perfectly reasonable on its own, and only
stops looking reasonable next to what was really charged.

The earliest cycle in your file is the exception. Interest on it was charged against a
balance from a statement that is not in the file, so there is nothing to check it against,
and the dashboard says so instead of inventing a comparison.

## income.csv

Rules, not deposits. One row per source of money.

```csv
name,amount,currency,frequency,statutory_bonus,effective_from,effective_to
Main salary,640000.00,ARS,monthly,yes,2026-01,
```

| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Free text. |
| `amount` | yes | Per month. |
| `currency` | yes | `ARS` or `USD`. |
| `frequency` | no | `monthly`, the only value so far. |
| `statutory_bonus` | no | `yes` if it pays the Argentine half-salary in June and December. |
| `effective_from` | yes | `YYYY-MM`, the first month it pays. |
| `effective_to` | no | Last month it pays. Empty means it still does. |

A rule rather than a list, because the question is about the future. "I earn this much a
month, starting then" answers what next March will bring; a list of past deposits does not.

A raise is a second row, not an edit of the first. End the old one with `effective_to` and
start a new one the month after — the old months were really paid at the old amount, and
overwriting them would quietly rewrite what you could have afforded at the time.

Re-importing an income file corrects rather than duplicates. A row is identified by its
`name` and its `effective_from` together, so fixing an amount and importing again replaces
that row; adding a new `effective_from` adds one.

## Importing more than once

Safe, and expected. Re-import whenever a statement closes.

A charge is identified by the file it came from and the line it was on. Two identical
charges on the same day are a real thing, so nothing is ever merged for looking alike.

The consequence is worth knowing: if you re-export the same period into a differently
named file, or reorder the rows, those rows are new. Keep one file per period, or one
growing file you always append to.

## What the importer refuses

It stops on the first thing it cannot read, names the line, and imports nothing:

- a missing column, listing which
- a date that is not `YYYY-MM-DD`, or a cycle that is not `YYYY-MM`
- a `kind` outside the seven
- an amount that is not a positive number with at most two decimals
- an `installment` that is not `n/m`
- a row with more or fewer cells than the header

There is no partial import and no row skipped with a warning. A half-imported file is worse
than none: the totals look plausible and are wrong, and nothing on screen says which half
is missing.

## Where the data goes

Into a SQLite file at `data/finance.sqlite` on your machine. Nothing is uploaded anywhere,
and `data/` is excluded from version control. Your CSVs are yours — the dashboard never
writes them back and never needs them again once imported.
