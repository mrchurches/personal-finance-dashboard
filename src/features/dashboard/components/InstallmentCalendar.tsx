import { Alert, Empty, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchCommittedInstallments } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatCycle } from "../dates";
import { formatMoney } from "@shared/money";
import type { CommittedInstallment } from "@shared/types";

const { Paragraph, Text } = Typography;

interface CalendarRow {
  key: string;
  period: string;
  openEnded: boolean;
  totalMinor: number;
  byAccount: Record<string, number>;
}

interface InstallmentCalendarProps {
  month: string;
}

/**
 * Instalments already incurred, month by month.
 *
 * Read from the forward-instalment table each statement publishes rather than
 * projected from the rows: the issuer knows the plans it has not billed yet, and
 * its own figure is the authority. Nothing here is avoidable — it is already
 * bought, and only time reduces it.
 */
export function InstallmentCalendar({ month }: InstallmentCalendarProps): ReactElement {
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<CommittedInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchCommittedInstallments(month)
      .then((response) => {
        if (isActive) {
          setInstallments(response.installments);
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

  const accountNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const installment of installments) {
      names.set(installment.accountId, installment.accountName);
    }
    return [...names.entries()].sort(([, left], [, right]) => left.localeCompare(right));
  }, [installments]);

  const rows = useMemo(() => {
    const byPeriod = new Map<string, CalendarRow>();
    for (const installment of installments) {
      const key = `${installment.duePeriod}-${installment.openEnded ? "open" : "fixed"}`;
      const row = byPeriod.get(key) ?? {
        key,
        period: installment.duePeriod,
        openEnded: installment.openEnded,
        totalMinor: 0,
        byAccount: {},
      };
      row.totalMinor += installment.amountMinor;
      row.byAccount[installment.accountId] = (row.byAccount[installment.accountId] ?? 0) + installment.amountMinor;
      byPeriod.set(key, row);
    }

    return [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period));
  }, [installments]);

  /*
   * The open-ended row is a per-month rate, not a month, so adding it to the
   * total would mix a stock with a flow and inflate what is actually committed.
   */
  const committedTotalMinor = rows
    .filter((row) => !row.openEnded)
    .reduce((total, row) => total + row.totalMinor, 0);
  const openEndedRow = rows.find((row) => row.openEnded);

  const columns: ColumnsType<CalendarRow> = [
    {
      title: t("installments.columns.period"),
      dataIndex: "period",
      width: 150,
      render: (period: string, row) =>
        row.openEnded ? (
          <div className="flex flex-col">
            <Text className="text-sm">{formatCycle(period)}</Text>
            <Tag color="warning" className="mt-1! w-fit">
              {t("installments.openEnded", { period: formatCycle(period) })}
            </Tag>
          </div>
        ) : (
          formatCycle(period)
        ),
    },
    ...accountNames.map(([accountId, accountName]) => ({
      title: accountName,
      key: accountId,
      align: "right" as const,
      render: (_value: unknown, row: CalendarRow) => {
        const amount = row.byAccount[accountId];
        return amount === undefined ? (
          <Text type="secondary">—</Text>
        ) : (
          <MoneyAmount amountMinor={amount} currency="ARS" direction="outflow" />
        );
      },
    })),
    {
      title: t("installments.columns.total"),
      dataIndex: "totalMinor",
      align: "right",
      width: 150,
      render: (totalMinor: number) => (
        <Text strong>
          <MoneyAmount amountMinor={totalMinor} currency="ARS" direction="outflow" />
        </Text>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("installments.sectionLabel")}
      title={t("installments.title")}
      meta={t("installments.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      {rows.length > 0 && (
        <div className="border-b border-surface-alt p-4">
          <Statistic
            title={t("installments.total")}
            value={formatMoney(committedTotalMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          {openEndedRow !== undefined && (
            <Text type="secondary" className="text-xs">
              {t("installments.openEndedNote")}
            </Text>
          )}
        </div>
      )}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("installments.hint")}
      </Paragraph>

      <Table<CalendarRow>
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        rowKey={(row) => row.key}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("installments.empty")} />,
        }}
      />
    </SectionPanel>
  );
}
