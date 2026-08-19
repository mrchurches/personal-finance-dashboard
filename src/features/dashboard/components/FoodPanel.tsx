import { Alert, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchFood } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { Term } from "@/components/Term";
import { formatCycle } from "../dates";
import { formatMoney } from "@shared/money";
import type { FoodCycle, FoodResponse } from "@shared/types";

const { Paragraph, Text } = Typography;

interface FoodPanelProps {
  month: string;
}

/**
 * The food question, answered with a distribution rather than a total.
 *
 * "How much should I budget" cannot be answered by an average when the worst cycle
 * is nearly three times the best - the average is a number that describes no month
 * that actually happened. The median says what a normal cycle costs, the spread
 * says how wrong that can go, and the two together are what a cap has to be chosen
 * against.
 */
export function FoodPanel({ month }: FoodPanelProps): ReactElement {
  const { t } = useTranslation();
  const [food, setFood] = useState<FoodResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchFood(month)
      .then((response) => {
        if (isActive) {
          setFood(response);
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

  const outflow = (amountMinor: number): ReactElement => (
    <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
  );

  const columns: ColumnsType<FoodCycle> = [
    {
      title: t("food.columns.cycle"),
      dataIndex: "period",
      width: 130,
      render: (period: string, row) => (
        <div className="flex flex-col">
          <Text className="text-sm">{formatCycle(period)}</Text>
          {!row.isComplete && (
            <Text type="secondary" className="text-xs">
              {t("food.incomplete")}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("food.columns.home"),
      dataIndex: "homeMinor",
      align: "right",
      width: 140,
      render: outflow,
    },
    { title: t("food.columns.out"), dataIndex: "outMinor", align: "right", width: 130, render: outflow },
    {
      title: t("food.columns.delivery"),
      dataIndex: "deliveryMinor",
      align: "right",
      width: 120,
      render: outflow,
    },
    {
      title: <Term id="gatewayFee">{t("food.columns.commission")}</Term>,
      dataIndex: "commissionMinor",
      align: "right",
      width: 120,
      render: (amountMinor: number) =>
        amountMinor === 0 ? <Text type="secondary">{t("common.empty")}</Text> : outflow(amountMinor),
    },
    {
      title: t("food.columns.value"),
      dataIndex: "valueMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number) => <Text strong>{outflow(amountMinor)}</Text>,
    },
  ];

  return (
    <SectionPanel
      label={t("food.sectionLabel")}
      title={t("food.title")}
      meta={t("food.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("food.hint")}
      </Paragraph>

      <Table<FoodCycle>
        columns={columns}
        dataSource={food?.cycles ?? []}
        loading={isLoading}
        rowKey={(cycle) => cycle.period}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
      />

      {food !== null && food.cycles.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-surface-alt p-4">
          <Statistic
            title={t("food.median")}
            value={formatMoney(food.medianValueMinor, "ARS")}
            valueStyle={{ fontSize: "1.35rem" }}
          />
          <Text className="text-xs">
            {t("food.spread", {
              best: formatMoney(food.bestValueMinor, "ARS"),
              worst: formatMoney(food.worstValueMinor, "ARS"),
              percent: food.worstOverBestPercent,
            })}
          </Text>
          <Text type="secondary" className="text-xs">
            {t("food.share", { percent: food.shareOfIncomePercent })}
          </Text>
          <Text type="secondary" className="text-xs">
            {t("food.commission", { amount: formatMoney(food.totalCommissionMinor, "ARS") })}{" "}
            {t("food.floorNote")}
          </Text>
        </div>
      )}
    </SectionPanel>
  );
}
