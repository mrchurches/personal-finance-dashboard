import { Card, Skeleton, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@shared/money";
import { Term } from "@/components/Term";
import { daysUntil, formatDay } from "../dates";
import type { MoneyTotals, Summary } from "@shared/types";

const { Text } = Typography;

type MetricKey = "income" | "cardCharges" | "otherSpending" | "financialCosts" | "cycleResult" | "statementDebt";

interface SecondaryContext {
  summary: Summary;
  t: TFunction;
  /** True while the cycle is still accumulating charges, so its totals are floors. */
  isOpen: boolean;
}

interface MetricDefinition {
  key: MetricKey;
  accentClassName: string;
  secondary: (totals: MoneyTotals, context: SecondaryContext) => string | null;
}

const usdWhenPresent = (totals: MoneyTotals): string | null =>
  totals.USD > 0 ? formatMoney(totals.USD, "USD") : null;

const METRICS: MetricDefinition[] = [
  {
    key: "income",
    accentClassName: "bg-success",
    /*
     * Income is derived: recurring rules plus one-off income transactions.
     * Saying which part is which keeps the number auditable, and a total of zero
     * has to read as "nothing declared" rather than as a fact.
     */
    secondary: (totals, { summary, t }) => {
      if (totals.ARS === 0 && totals.USD === 0) {
        return t("summary.income.noIncomeDeclared");
      }
      if (summary.oneOffIncome.ARS > 0 && summary.recurringIncome.ARS > 0) {
        return t("summary.income.oneOffPortion", {
          amount: formatMoney(summary.oneOffIncome.ARS, "ARS"),
        });
      }
      return usdWhenPresent(totals);
    },
  },
  {
    key: "cardCharges",
    accentClassName: "bg-accent-terracotta",
    /*
     * Routed through the same guard as its neighbours. Built unconditionally it
     * printed "US$ 0,00 en moneda extranjera" on any cycle with no foreign charges,
     * which reads as a measured zero rather than as nothing to report.
     */
    secondary: (totals, { t }) =>
      totals.USD > 0 ? `${formatMoney(totals.USD, "USD")} ${t("common.foreignCurrency")}` : null,
  },
  {
    key: "otherSpending",
    accentClassName: "bg-accent-vintage-blue",
    secondary: usdWhenPresent,
  },
  {
    key: "financialCosts",
    accentClassName: "bg-accent-mustard",
    /*
     * A cycle with no statement yet has not been charged interest, which is not the
     * same as having been charged none. Zero read as a measured fact on the one card
     * that carries a balance at nearly nine percent a cycle.
     */
    secondary: (totals, { t, isOpen }) =>
      isOpen && totals.ARS === 0 ? t("summary.financialCosts.notBilledYet") : usdWhenPresent(totals),
  },
  {
    key: "cycleResult",
    accentClassName: "bg-primary",
    /*
     * An open cycle has no result. Saying "you had some left" about a cycle that is
     * still collecting charges, and whose interest has not been billed, is the reader's
     * opening impression of a month in which they are millions in debt.
     */
    secondary: (totals, { t, isOpen }) =>
      isOpen
        ? t("summary.cycleResult.stillOpen")
        : totals.ARS < 0
          ? t("summary.cycleResult.over")
          : t("summary.cycleResult.under"),
  },
  {
    key: "statementDebt",
    accentClassName: "bg-error",
    /*
     * Stock, not flow. Shown next to the cycle result rather than folded into it:
     * the statement balance already contains the cycle charges.
     */
    secondary: (_totals, { summary, t }) => {
      const balance = summary.statementBalances[0];
      if (balance === undefined) {
        return t("summary.statementDebt.noStatement");
      }
      return t("summary.statementDebt.dueOn", { date: formatDay(balance.dueOn) });
    },
  },
];

interface SummaryMetricsProps {
  summary: Summary | null;
}

export function SummaryMetrics({ summary }: SummaryMetricsProps): ReactElement {
  const { t } = useTranslation();

  const cycle = summary?.cycle ?? null;
  const daysToClose = cycle === null ? null : daysUntil(cycle.closedOn, dayjs().format("YYYY-MM-DD"));
  const isOpen = daysToClose !== null && daysToClose >= 0;

  return (
    <section aria-label={t("summary.regionLabel")} className="flex flex-col gap-3">
      {/*
        Stated once, above the cards, rather than repeated on each. Three of the six are
        partial figures while the cycle is open, and a reader who does not know that reads
        a two-thirds-complete month as a frugal one.
      */}
      {isOpen && cycle !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="processing" className="m-0!">
            <Term id="openCycle">{t("summary.openCycle.badge")}</Term>
          </Tag>
          <Text type="secondary" className="text-xs">
            {t("summary.openCycle.note", {
              date: formatDay(cycle.closedOn),
              count: daysToClose ?? 0,
            })}
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((metric) => {
          const totals = summary?.[metric.key] ?? null;
          /* A cycle still collecting charges has no result to be over or under. */
          const isProvisional = isOpen && metric.key === "cycleResult";

          return (
            <MetricCard
              key={metric.key}
              accentClassName={metric.accentClassName}
              label={t(`summary.${metric.key}.label`)}
              note={t(`summary.${metric.key}.note`)}
              value={totals === null ? null : formatMoney(totals.ARS, "ARS")}
              emphasis={!isProvisional && metric.key === "cycleResult" && totals !== null && totals.ARS < 0}
              secondary={
                summary === null || totals === null
                  ? null
                  : metric.secondary(totals, { summary, t, isOpen })
              }
            />
          );
        })}
      </div>
    </section>
  );
}

interface MetricCardProps {
  accentClassName: string;
  label: string;
  note: string;
  value: string | null;
  emphasis: boolean;
  secondary: ReactNode;
}

function MetricCard({
  accentClassName,
  label,
  note,
  value,
  emphasis,
  secondary,
}: MetricCardProps): ReactElement {
  return (
    <Card classNames={{ body: "p-0!" }} className="overflow-hidden">
      <div className={`h-1 w-full ${accentClassName}`} />
      <div className="flex flex-col gap-1 p-5">
        <Text type="secondary" className="text-xs font-semibold tracking-wide uppercase">
          {label}
        </Text>
        {value === null ? (
          <Skeleton.Input active size="small" className="my-1! h-7! w-32! min-w-0!" />
        ) : (
          <span
            className={`text-2xl font-semibold tabular-nums ${emphasis ? "text-error" : "text-text"}`}
          >
            {value}
          </span>
        )}
        <Text type="secondary" className="text-xs">
          {note}
        </Text>
        {secondary !== null && (
          <Text className="text-xs tabular-nums text-accent-vintage-blue">{secondary}</Text>
        )}
      </div>
    </Card>
  );
}
