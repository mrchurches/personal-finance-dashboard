"""Regenerates the sample files.

    python samples/generate.py

Every figure in samples/ comes from here, and none of it is real. That is not a courtesy:
the privacy check excludes samples/ from the scan that catches real values in the diff, and
this generator is what pays for the exclusion. A figure typed straight into a CSV would
slip through both.

It also keeps the three files consistent with each other. The balances are computed from
the charges and the rate rather than chosen, so the dashboard has something whose right
answers are known - which is how the demo catches arithmetic that type checking cannot see.
"""

import io
import pathlib

# Money in cents throughout, the same reason the application uses minor units.
CARD = "Blue Card"
WALLET = "Wallet"

# The stated monthly rate, and the multiple by which tax turns it into what a balance
# actually costs to carry. Roughly VAT on the interest plus the usual perceptions.
TEM = 8.579
GROSS_UP = 1.45
EFFECTIVE = TEM * GROSS_UP / 100.0

# The balance carried in from the cycle before the first one in the file. It cannot be
# derived from these rows, which is exactly the point: the earliest cycle in any file has a
# past outside it, so its interest is the one figure the data cannot check.
OPENING = 420_000_00

CYCLES = [
    {
        "cycle": "2026-03",
        "opened_on": "2026-02-28",
        "closed_on": "2026-03-27",
        "due_on": "2026-04-04",
        "charges": [
            ("2026-03-04", "SUPERMARKET NORTH", 84_300_00, "charge", ""),
            ("2026-03-06", "GATEWAY*CORNER SHOP", 19_250_00, "charge", ""),
            ("2026-03-09", "ELECTRIC UTILITY", 71_400_00, "charge", ""),
            ("2026-03-11", "STREAMING SUBSCRIPTION", 9_990_00, "charge", ""),
            ("2026-03-14", "FURNITURE STORE", 62_000_00, "charge", "1/6"),
            ("2026-03-18", "BAKERY ON THE SQUARE", 6_800_00, "charge", ""),
            ("2026-03-22", "FUEL STATION WEST", 55_000_00, "charge", ""),
        ],
        "payment": ("2026-03-27", "CARD PAYMENT", 310_000_00),
        "interest_on": "2026-03-27",
        "extra": [],
    },
    {
        "cycle": "2026-04",
        "opened_on": "2026-03-28",
        "closed_on": "2026-04-26",
        "due_on": "2026-05-04",
        "charges": [
            ("2026-04-03", "SUPERMARKET NORTH", 91_100_00, "charge", ""),
            ("2026-04-05", "GATEWAY*CORNER SHOP", 21_400_00, "charge", ""),
            ("2026-04-08", "ELECTRIC UTILITY", 78_900_00, "charge", ""),
            ("2026-04-11", "STREAMING SUBSCRIPTION", 9_990_00, "charge", ""),
            ("2026-04-14", "FURNITURE STORE", 62_000_00, "charge", "2/6"),
            ("2026-04-16", "RESTAURANT BY THE PARK", 38_500_00, "charge", ""),
            ("2026-04-19", "ONLINE MARKETPLACE", 127_000_00, "charge", ""),
            ("2026-04-21", "PHARMACY CENTRAL", 14_200_00, "charge", ""),
        ],
        "payment": ("2026-04-26", "CARD PAYMENT", 295_000_00),
        "interest_on": "2026-04-26",
        "extra": [("2026-04-24", "REFUND FROM MARKETPLACE", 18_000_00, "refund", "")],
    },
    {
        "cycle": "2026-05",
        "opened_on": "2026-04-27",
        "closed_on": "2026-05-27",
        "due_on": "2026-06-04",
        "charges": [
            ("2026-05-02", "SUPERMARKET NORTH", 88_700_00, "charge", ""),
            ("2026-05-05", "GATEWAY*CORNER SHOP", 23_100_00, "charge", ""),
            ("2026-05-07", "ELECTRIC UTILITY", 83_100_00, "charge", ""),
            ("2026-05-11", "STREAMING SUBSCRIPTION", 10_990_00, "charge", ""),
            ("2026-05-14", "FURNITURE STORE", 62_000_00, "charge", "3/6"),
            ("2026-05-20", "WEEKEND MARKET", 31_500_00, "charge", ""),
        ],
        "payment": ("2026-05-27", "CARD PAYMENT", 280_000_00),
        "interest_on": "2026-05-27",
        # The dollar balance is settled separately, which is why the cycle carries one.
        "usd": [("2026-05-17", "CLOUD BACKUP", 4_99)],
        "extra": [("2026-05-23", "CASH WITHDRAWN FOR GROCERIES", 120_000_00, "cash", "")],
    },
]


def pesos(cents):
    return "%d.%02d" % (cents // 100, cents % 100)


charge_lines = ["date,description,amount,currency,account,cycle,kind,installment"]
cycle_lines = [
    "account,cycle,opened_on,closed_on,due_on,closing_balance,closing_balance_usd,"
    "minimum_payment,monthly_rate"
]

balance = OPENING
usd_balance = 0
report = []

for spec in CYCLES:
    rows = []
    charged = 0
    for date, description, amount, kind, installment in spec["charges"]:
        rows.append((date, description, amount, "ARS", CARD, kind, installment))
        charged += amount

    charged_usd = 0
    for date, description, amount in spec.get("usd", []):
        rows.append((date, description, amount, "USD", CARD, "charge", ""))
        charged_usd += amount

    credited = 0
    for date, description, amount, kind, installment in spec["extra"]:
        account = WALLET if kind == "cash" else CARD
        rows.append((date, description, amount, "ARS", account, kind, installment))
        # Cash left the wallet, not the card, so it does not touch the card balance.
        if kind == "refund":
            credited += amount

    pay_date, pay_description, paid = spec["payment"]
    rows.append((pay_date, pay_description, paid, "ARS", CARD, "payment", ""))

    financed = balance - paid
    interest = round(financed * EFFECTIVE)
    rows.append((spec["interest_on"], "INTEREST ON UNPAID BALANCE", interest, "ARS", CARD,
                 "financing_cost", ""))

    closing = balance + charged + interest - paid - credited
    usd_balance += charged_usd

    for date, description, amount, currency, account, kind, installment in sorted(rows):
        charge_lines.append(",".join([
            date, description, pesos(amount), currency, account, spec["cycle"], kind,
            installment,
        ]))

    cycle_lines.append(",".join([
        CARD, spec["cycle"], spec["opened_on"], spec["closed_on"], spec["due_on"],
        pesos(closing), pesos(usd_balance), pesos(round(closing * 0.15)), "%.3f" % TEM,
    ]))

    report.append((spec["cycle"], balance, charged, interest, paid, credited, closing,
                   financed))
    balance = closing

pathlib.Path("samples").mkdir(exist_ok=True)
io.open("samples/charges.csv", "w", encoding="utf-8", newline="\n").write(
    "\n".join(charge_lines) + "\n")
io.open("samples/cycles.csv", "w", encoding="utf-8", newline="\n").write(
    "\n".join(cycle_lines) + "\n")

print("cycle    opening    charges   interest    payment     refund    closing   implied")
for cycle, opening, charged, interest, paid, credited, closing, financed in report:
    implied = 0.0 if financed <= 0 else interest / financed * 100.0
    print("%s %10s %10s %10s %10s %10s %10s %8.2f%%" % (
        cycle, pesos(opening), pesos(charged), pesos(interest), pesos(paid),
        pesos(credited), pesos(closing), implied))
print("\nstated %.3f%%, implied over stated: %.2f" % (TEM, GROSS_UP))
