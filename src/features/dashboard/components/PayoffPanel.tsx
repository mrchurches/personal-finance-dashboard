import { Alert, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchPayoff } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatMoney } from "@shared/money";
import type { PayoffCycle, PayoffResponse } from "@shared/types";

const { Paragraph, Text } = Typography;

interface PayoffPanelProps {
  month: string;
}

/**
 * How long the debt takes to clear, and what happens if only the minimum is paid.
 *
 * Both answers are shown because the second is the more consequential one: a
 * minimum payment that does not cover the interest never finishes, and a panel
 * that only showed the optimistic path would hide that.
 */
export function PayoffPanel({ month }: PayoffPanelProps): ReactElement {
  const { t } = useTranslation();
  const [payoff, setPayoff] = useState<PayoffResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchPayoff(month)
      .then((response) => {
        if (isActive) {
          setPayoff(response);
          setError("");
        }
      })
      .catch((loadError: Error) => {
        if (isActive) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [month]);

  const maximum = payoff?.maximum ?? null;
  const minimum = payoff?.minimum ?? null;

  const columns: ColumnsType<PayoffCycle> = [
    { title: t("payoff.columns.period"), dataIndex: "period", width: 100 },
    {
      title: t("payoff.columns.opening"),
      dataIndex: "openingMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("payoff.columns.charges"),
      dataIndex: "newChargesMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("payoff.columns.payment"),
      dataIndex: "paymentMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="inflow" />
      ),
    },
    {
      title: t("payoff.columns.interest"),
      dataIndex: "financingCostMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("payoff.columns.closing"),
      dataIndex: "closingMinor",
      align: "right",
      render: (amountMinor: number) => (
        <Text strong>
          <MoneyAmount
            amountMinor={amountMinor}
            currency="ARS"
            direction={amountMinor === 0 ? "inflow" : "outflow"}
          />
        </Text>
      ),
    },
  ];

  const minimumPayment = minimum?.cycles[0]?.paymentMinor ?? 0;
  const minimumLast = minimum?.cycles[minimum.cycles.length - 1];

  return (
    <SectionPanel
      label={t("payoff.sectionLabel")}
      title={t("payoff.title")}
      meta={t("payoff.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      {maximum !== null && (
        <div className="grid grid-cols-1 gap-4 border-b border-surface-alt p-4 sm:grid-cols-3">
          <Statistic
            title={t("payoff.clears", { period: maximum.clearedInPeriod ?? "—" })}
            value={
              maximum.cyclesToClear === null
                ? "—"
                : t("payoff.clearsIn", { count: maximum.cyclesToClear })
            }
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Statistic
            title={t("payoff.interestPaid")}
            value={formatMoney(maximum.totalFinancingCostMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Statistic
            title="ARS"
            value={formatMoney(maximum.openingBalanceMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
        </div>
      )}

      {minimum !== null && minimum.neverClears && minimumLast !== undefined && (
        <Alert
          type="error"
          showIcon
          className="m-4"
          message={t("payoff.neverClears")}
          description={t("payoff.neverClearsBody", {
            minimum: formatMoney(minimumPayment, "ARS"),
            cycles: minimum.cycles.length,
            from: formatMoney(minimum.openingBalanceMinor, "ARS"),
            to: formatMoney(minimumLast.closingMinor, "ARS"),
            interest: formatMoney(minimum.totalFinancingCostMinor, "ARS"),
          })}
        />
      )}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("payoff.hint")}
        {maximum !== null && (
          <>
            {" "}
            {t("payoff.assumption", {
              income: formatMoney(maximum.assumedIncomePerCycleMinor, "ARS"),
              recurring: formatMoney(maximum.assumedRecurringSpendingMinor, "ARS"),
            })}
          </>
        )}
      </Paragraph>

      <Table<PayoffCycle>
        columns={columns}
        dataSource={maximum?.cycles ?? []}
        loading={isLoading}
        rowKey={(cycle) => cycle.period}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
      />
    </SectionPanel>
  );
}
