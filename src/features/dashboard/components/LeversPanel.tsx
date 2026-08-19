import { Alert, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchPayoffLevers } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatMoney } from "@shared/money";
import type { PayoffLever, PayoffLeversResponse } from "@shared/types";

const { Paragraph, Text } = Typography;

interface LeversPanelProps {
  month: string;
}

/**
 * Which recurring cost is worth the most if it stops.
 *
 * Each row comes from re-running the whole projection without that cost rather
 * than from dividing the balance by it. Interest compounds, so a cost removed
 * early is worth more than its face value, and the division would miss that.
 */
export function LeversPanel({ month }: LeversPanelProps): ReactElement {
  const { t } = useTranslation();
  const [levers, setLevers] = useState<PayoffLeversResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchPayoffLevers(month)
      .then((response) => {
        if (isActive) {
          setLevers(response);
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

  const columns: ColumnsType<PayoffLever> = [
    { title: t("levers.columns.lever"), dataIndex: "label" },
    {
      title: t("levers.columns.perCycle"),
      dataIndex: "perCycleMinor",
      align: "right",
      width: 140,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("levers.columns.cycles"),
      dataIndex: "cyclesToClear",
      align: "right",
      width: 90,
      render: (cycles: number | null) => (cycles === null ? t("levers.never") : cycles),
    },
    {
      title: t("levers.columns.saved"),
      dataIndex: "cyclesSaved",
      align: "right",
      width: 110,
      render: (saved: number | null) =>
        saved === null || saved === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Tag color="success">{t("levers.cycles", { count: saved })}</Tag>
        ),
    },
    {
      title: t("levers.columns.interest"),
      dataIndex: "interestSavedMinor",
      align: "right",
      width: 160,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="inflow" />
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("levers.sectionLabel")}
      title={t("levers.title")}
      meta={t("levers.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("levers.hint")} {t("levers.onlyRecurring")}
      </Paragraph>

      <Table<PayoffLever>
        columns={columns}
        dataSource={levers?.levers ?? []}
        loading={isLoading}
        rowKey={(lever) => lever.leverKey}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 8, size: "small" }}
      />

      {levers !== null && levers.sensitivity.length > 0 && (
        <div className="border-t border-surface-alt p-4">
          <Text strong className="text-sm">
            {t("levers.sensitivityTitle")}
          </Text>
          <div className="mt-2 flex flex-col gap-1">
            {levers.sensitivity.map((step) => (
              <Text key={step.extraPerCycleMinor} type="secondary" className="text-xs tabular-nums">
                {t("levers.sensitivityRow", { amount: formatMoney(step.extraPerCycleMinor, "ARS") })}
                {" → "}
                {step.neverClears
                  ? t("levers.never")
                  : t("levers.cycles", { count: step.cyclesToClear ?? 0 })}
                {", +"}
                {formatMoney(step.extraInterestMinor, "ARS")}
              </Text>
            ))}
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
