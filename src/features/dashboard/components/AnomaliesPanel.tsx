import { Alert, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchAnomalies } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatMoney } from "@shared/money";
import type { CycleAnomaly, CycleAnomalyKind } from "@shared/types";
import { categoryLabel } from "../labels";

const { Paragraph, Text } = Typography;

const KIND_COLOUR: Record<CycleAnomalyKind, string> = {
  "step-up": "error",
  "catch-up": "warning",
  "step-down": "processing",
  spike: "default",
};

/**
 * The odd cycles the median hides.
 *
 * Using a median is the right call: one strange month must not move what the
 * projection charges every month. The cost of that choice is that the strange month
 * becomes invisible, and two of the shapes it can take mean opposite things. A month
 * that was not paid and then settled together with the next arrives as roughly
 * double and needs nothing done. A price that rose and stayed risen arrives looking
 * identical and means the projection is now charging too little, every cycle, until
 * enough cycles pass for the median to catch up.
 *
 * Telling those two apart is what the panel is for. It is not a general outlier
 * report.
 */
export function AnomaliesPanel(): ReactElement {
  const { t } = useTranslation();
  const [anomalies, setAnomalies] = useState<CycleAnomaly[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    void fetchAnomalies()
      .then((response) => {
        if (isActive) {
          setAnomalies(response.anomalies);
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

  const columns: ColumnsType<CycleAnomaly> = [
    {
      title: t("anomalies.columns.cost"),
      dataIndex: "merchantKey",
      width: 210,
      render: (merchantKey: string, row) => (
        <div className="flex flex-col">
          <Text className="text-sm font-medium">{merchantKey}</Text>
          <Text type="secondary" className="text-xs">
            {categoryLabel(t, row.categoryId, row.categoryName)}
          </Text>
        </div>
      ),
    },
    {
      title: t("anomalies.columns.cycle"),
      dataIndex: "period",
      width: 140,
      render: (period: string, row) => (
        <div className="flex flex-col">
          <Text className="text-sm tabular-nums">{period}</Text>
          {row.missingBefore !== null && (
            <Text type="warning" className="text-xs">
              {t("anomalies.gap", { period: row.missingBefore })}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("anomalies.columns.amount"),
      dataIndex: "amountMinor",
      align: "right",
      width: 190,
      render: (amountMinor: number, row) => (
        <div className="flex flex-col items-end">
          <Text strong>
            <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
          </Text>
          <Text type="secondary" className="text-xs">
            {t(row.chargeCount === 1 ? "anomalies.shape_one" : "anomalies.shape_other", {
              count: row.chargeCount,
              largest: formatMoney(row.largestChargeMinor, "ARS"),
            })}
          </Text>
        </div>
      ),
    },
    {
      title: t("anomalies.columns.typical"),
      dataIndex: "typicalMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number, row) => (
        <div className="flex flex-col items-end">
          <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
          <Text type="secondary" className="text-xs tabular-nums">
            {row.ratioPercent}%
          </Text>
        </div>
      ),
    },
    {
      title: t("anomalies.columns.kind"),
      dataIndex: "kind",
      width: 230,
      render: (kind: CycleAnomalyKind, row) => (
        <div className="flex flex-col gap-1">
          <Tooltip title={t(`anomalies.kindHint.${kind}`)}>
            <Tag color={KIND_COLOUR[kind]}>{t(`anomalies.kind.${kind}`)}</Tag>
          </Tooltip>
          {row.understatedByMinor > 0 && (
            <Text type="danger" className="text-xs">
              {t("anomalies.understated", {
                amount: formatMoney(row.understatedByMinor, "ARS"),
              })}
            </Text>
          )}
        </div>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("anomalies.sectionLabel")}
      title={t("anomalies.title")}
      meta={t("anomalies.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("anomalies.hint")}
      </Paragraph>

      <Table<CycleAnomaly>
        columns={columns}
        dataSource={anomalies}
        loading={isLoading}
        rowKey={(anomaly) => `${anomaly.patternKey}:${anomaly.period}`}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
        locale={{ emptyText: t("anomalies.empty") }}
      />
    </SectionPanel>
  );
}
