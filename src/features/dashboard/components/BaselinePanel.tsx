import { Alert, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchBaseline } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatCycle } from "../dates";
import type { MonthlyBaseline } from "@shared/types";

const { Paragraph, Text } = Typography;

interface BaselinePanelProps {
  month: string;
  /**
   * Bumped when a declared commitment changes.
   *
   * Part of the effect key rather than a manual refresh call, because these
   * figures are derived from the commitments: leaving a stale projection on
   * screen next to the commitment that contradicts it is worse than a reload.
   */
  commitmentsVersion: number;
}

/**
 * What each of the next cycles has left once the commitments are paid.
 *
 * Built from commitments rather than from an average of past cycles, because an
 * average over cycles that overspent predicts overspending. Every term here is
 * something that happens again unless a decision changes it.
 */
export function BaselinePanel({ month, commitmentsVersion }: BaselinePanelProps): ReactElement {
  const { t } = useTranslation();
  const [baselines, setBaselines] = useState<MonthlyBaseline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchBaseline(month)
      .then((response) => {
        if (isActive) {
          setBaselines(response.baselines);
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
  }, [month, commitmentsVersion]);

  const rateMilli = baselines[0]?.effectiveMonthlyRateMilli ?? null;

  const columns: ColumnsType<MonthlyBaseline> = [
        {
      title: t("baseline.columns.cycle"),
      dataIndex: "period",
      width: 120,
      render: (period: string) => formatCycle(period),
    },
    {
      title: t("baseline.columns.income"),
      dataIndex: "recurringIncomeMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="inflow" />
      ),
    },
    {
      title: t("baseline.columns.recurring"),
      dataIndex: "recurringSpendingMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("baseline.columns.installments"),
      dataIndex: "committedInstallmentsMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("baseline.columns.financing"),
      dataIndex: "financingCostMinor",
      align: "right",
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("baseline.columns.available"),
      dataIndex: "availableMinor",
      align: "right",
      render: (amountMinor: number) => (
        <Text strong>
          {/* Whether a cycle has anything left is good or bad news, not a direction. */}
          <MoneyAmount
            amountMinor={amountMinor}
            currency="ARS"
            verdict={amountMinor < 0 ? "bad" : "good"}
          />
        </Text>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("baseline.sectionLabel")}
      title={t("baseline.title")}
      meta={t("baseline.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("baseline.hint")}
        {" "}
        {t("baseline.financingNote")}
        {rateMilli !== null && (
          <>
            {" "}
            {t("baseline.rateNote", { rate: (rateMilli / 1000).toFixed(3) })}
          </>
        )}
      </Paragraph>

      <Table<MonthlyBaseline>
        columns={columns}
        dataSource={baselines}
        loading={isLoading}
        rowKey={(baseline) => baseline.period}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
      />
    </SectionPanel>
  );
}
