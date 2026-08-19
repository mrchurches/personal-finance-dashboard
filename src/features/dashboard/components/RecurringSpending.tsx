import { Alert, Empty, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchSpendingPatterns } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatMoney } from "@shared/money";
import type { CommittedCostSummary, SpendingPattern } from "@shared/types";
import { categoryLabel } from "../labels";

const { Paragraph, Text } = Typography;

const STABILITY_COLOR: Record<SpendingPattern["amountStability"], string> = {
  stable: "success",
  variable: "warning",
  erratic: "error",
};

/**
 * Separates what the next cycle will cost anyway from what was a choice.
 *
 * Only merchants that keep coming back count toward the floor. Instalment-driven
 * merchants are shown apart because the instalment calendar already carries them
 * forward, and adding both would overstate the floor by the same money twice.
 */
export function RecurringSpending(): ReactElement {
  const { t } = useTranslation();
  const [patterns, setPatterns] = useState<SpendingPattern[]>([]);
  const [committedCost, setCommittedCost] = useState<CommittedCostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    void fetchSpendingPatterns()
      .then((response) => {
        if (isActive) {
          setPatterns(response.patterns);
          setCommittedCost(response.committedCost);
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
  }, []);

  const recurring = patterns.filter(
    (pattern) => pattern.recurrence === "recurring" && pattern.isActive && !pattern.drivenByInstallments,
  );

  const columns: ColumnsType<SpendingPattern> = [
    {
      title: t("patterns.columns.merchant"),
      dataIndex: "merchantKey",
      width: 220,
      render: (merchantKey: string, pattern) => (
        <div className="flex flex-col">
          <Text className="text-sm font-medium">{merchantKey}</Text>
          <Text type="secondary" className="text-xs">
            {categoryLabel(t, pattern.categoryId, pattern.categoryName)}
          </Text>
        </div>
      ),
    },
    {
      title: t("patterns.columns.perCycle"),
      dataIndex: "typicalPerCycleMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("patterns.columns.cycles"),
      key: "cycles",
      align: "right",
      width: 100,
      render: (_value, pattern) => `${pattern.cyclesPresent}/${pattern.cyclesSpanned}`,
    },
    {
      title: t("patterns.columns.stability"),
      dataIndex: "amountStability",
      width: 130,
      render: (stability: SpendingPattern["amountStability"], pattern) => (
        <Tag color={STABILITY_COLOR[stability]}>
          {t(`patterns.stability.${stability}`)} {pattern.spreadPercent > 0 ? `${pattern.spreadPercent}%` : ""}
        </Tag>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("patterns.sectionLabel")}
      title={t("patterns.title")}
      meta={t("patterns.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      {committedCost !== null && (
        <div className="grid grid-cols-1 gap-4 border-b border-surface-alt p-4 sm:grid-cols-3">
          <Statistic
            title={t("patterns.floor")}
            value={formatMoney(committedCost.recurringPerCycleMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Statistic
            title={t("patterns.installments")}
            value={formatMoney(committedCost.installmentDrivenPerCycleMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Statistic
            title={t("patterns.occasional")}
            value={formatMoney(committedCost.oneOffPerCycleMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Text type="secondary" className="text-xs sm:col-span-3">
            {t("patterns.floorNote", { count: committedCost.recurringMerchantCount })}
            {" · "}
            {t("patterns.installmentsNote")}
          </Text>
        </div>
      )}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("patterns.hint")}
      </Paragraph>

      <Table<SpendingPattern>
        columns={columns}
        dataSource={recurring}
        loading={isLoading}
        rowKey={(pattern) => pattern.patternKey}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 10, size: "small" }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("patterns.empty")} />,
        }}
      />
    </SectionPanel>
  );
}
