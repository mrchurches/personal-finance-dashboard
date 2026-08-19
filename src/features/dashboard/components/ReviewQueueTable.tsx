import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { SIGNED_STATUS, type SourceRecord } from "@shared/types";
import { fundingMethodLabel, recordKindLabel, reconciliationStateLabel, sourceKindLabel } from "../labels";

const { Text } = Typography;

interface ReviewQueueTableProps {
  records: SourceRecord[];
  isLoading: boolean;
}

export function ReviewQueueTable({ records, isLoading }: ReviewQueueTableProps): ReactElement {
  const { t } = useTranslation();

  const columns: ColumnsType<SourceRecord> = [
    {
      title: t("review.columns.date"),
      dataIndex: "transactionDate",
      width: 120,
      render: (date: string | null) => date ?? t("common.empty"),
    },
    {
      title: t("review.columns.kind"),
      key: "recordKind",
      width: 170,
      render: (_value, record) => recordKindLabel(t, record.recordKind),
    },
    {
      title: t("review.columns.description"),
      dataIndex: "description",
      width: 300,
      render: (description: string) => <Text className="text-sm">{description}</Text>,
    },
    {
      title: t("review.columns.amount"),
      dataIndex: "amountMinor",
      align: "right",
      width: 150,
      render: (_value: number, record) => {
        const isNegative = record.signedStatus === SIGNED_STATUS.NEGATIVE;
        return (
          <MoneyAmount
            amountMinor={isNegative ? -record.amountMinor : record.amountMinor}
            currency={record.currency}
            direction={isNegative ? "outflow" : "inflow"}
          />
        );
      },
    },
    {
      title: t("review.columns.funding"),
      key: "fundingMethod",
      width: 170,
      render: (_value, record) => fundingMethodLabel(t, record.fundingMethod),
    },
    {
      title: t("review.columns.state"),
      key: "reconciliationState",
      width: 150,
      render: (_value, record) => (
        <Tag color="warning">{reconciliationStateLabel(t, record.reconciliationState)}</Tag>
      ),
    },
    {
      title: t("review.columns.source"),
      key: "source",
      width: 260,
      render: (_value, record) => `${sourceKindLabel(t, record.sourceKind)} / ${record.sourceLocator}`,
    },
  ];

  return (
    <SectionPanel
      label={t("review.sectionLabel")}
      title={t("review.title")}
      meta={t("review.meta")}
      bodyClassName="p-0!"
    >
      <Table<SourceRecord>
        columns={columns}
        dataSource={records}
        loading={isLoading}
        rowKey={(record) => record.id}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showSizeChanger: true, size: "small" }}
        locale={{ emptyText: t("review.empty") }}
      />
    </SectionPanel>
  );
}
