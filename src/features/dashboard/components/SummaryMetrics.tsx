import { Card, Skeleton, Typography } from "antd";
import type { TFunction } from "i18next";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@shared/money";
import type { MoneyTotals, Summary } from "@shared/types";

const { Text } = Typography;

type MetricKey = "income" | "cardCharges" | "otherSpending" | "financialCosts" | "cycleResult" | "statementDebt";

interface SecondaryContext {
  summary: Summary;
  t: TFunction;
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
    secondary: (totals, { t }) =>
      `${formatMoney(totals.USD, "USD")} ${t("common.foreignCurrency")}`,
  },
  {
    key: "otherSpending",
    accentClassName: "bg-accent-vintage-blue",
    secondary: usdWhenPresent,
  },
  { key: "financialCosts", accentClassName: "bg-accent-mustard", secondary: usdWhenPresent },
  {
    key: "cycleResult",
    accentClassName: "bg-primary",
    secondary: (totals, { t }) =>
      totals.ARS < 0 ? t("summary.cycleResult.over") : t("summary.cycleResult.under"),
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
      return t("summary.statementDebt.dueOn", { date: balance.dueOn });
    },
  },
];

interface SummaryMetricsProps {
  summary: Summary | null;
}

export function SummaryMetrics({ summary }: SummaryMetricsProps): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t("summary.regionLabel")}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {METRICS.map((metric) => {
        const totals = summary?.[metric.key] ?? null;

        return (
          <MetricCard
            key={metric.key}
            accentClassName={metric.accentClassName}
            label={t(`summary.${metric.key}.label`)}
            note={t(`summary.${metric.key}.note`)}
            value={totals === null ? null : formatMoney(totals.ARS, "ARS")}
            emphasis={metric.key === "cycleResult" && totals !== null && totals.ARS < 0}
            secondary={
              summary === null || totals === null ? null : metric.secondary(totals, { summary, t })
            }
          />
        );
      })}
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
