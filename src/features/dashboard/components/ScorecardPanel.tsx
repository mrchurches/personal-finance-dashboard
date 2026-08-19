import { Alert, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchScorecard } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { formatCycle } from "../dates";
import { formatMoney } from "@shared/money";
import type { CycleScore, ScorecardResponse } from "@shared/types";

const { Paragraph, Text } = Typography;

interface ScorecardPanelProps {
  month: string;
  commitmentsVersion: number;
}

/**
 * Whether the plan is actually being followed.
 *
 * The payoff figure elsewhere is a freeze scenario: it charges commitments and
 * assumes every discretionary purchase stops. That is a legitimate thing to model,
 * but it makes the headline a target rather than a forecast, and until now nothing
 * on screen said which one it was. This panel puts the two side by side - the
 * payoff if the variable spending really stops, and the payoff if it carries on at
 * the level actually observed - so the distance between the plan and the behaviour
 * is a number instead of an impression.
 */
export function ScorecardPanel({ month, commitmentsVersion }: ScorecardPanelProps): ReactElement {
  const { t } = useTranslation();
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    void fetchScorecard(month)
      .then((response) => {
        if (isActive) {
          setScorecard(response);
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

  const columns: ColumnsType<CycleScore> = [
    {
      title: t("scorecard.columns.cycle"),
      dataIndex: "period",
      width: 130,
      render: (period: string, row) => (
        <div className="flex flex-col">
          <Text className="text-sm">{formatCycle(period)}</Text>
          {!row.isComplete && (
            <Text type="secondary" className="text-xs">
              {t("scorecard.incomplete")}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("scorecard.columns.committed"),
      dataIndex: "committedMinor",
      align: "right",
      width: 140,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("scorecard.columns.installments"),
      dataIndex: "installmentsMinor",
      align: "right",
      width: 140,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
    {
      title: t("scorecard.columns.variable"),
      dataIndex: "variableMinor",
      align: "right",
      width: 160,
      render: (amountMinor: number, row) => (
        <div className="flex items-center justify-end gap-2">
          <Text strong>
            <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
          </Text>
          {row.isComplete && (
            <Tag color={row.variableSharePercent >= 50 ? "error" : "warning"}>
              {row.variableSharePercent}%
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: t("scorecard.columns.total"),
      dataIndex: "totalMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number) => (
        <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("scorecard.sectionLabel")}
      title={t("scorecard.title")}
      meta={t("scorecard.meta")}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("scorecard.hint")}
      </Paragraph>

      <Table<CycleScore>
        columns={columns}
        dataSource={scorecard?.cycles ?? []}
        loading={isLoading}
        rowKey={(cycle) => cycle.period}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
      />

      {scorecard !== null && (
        <div className="border-t border-surface-alt p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Statistic
                title={t("scorecard.ifItStops")}
                value={
                  scorecard.cyclesAtZeroVariable === null
                    ? t("scorecard.never")
                    : t("scorecard.cycles", { count: scorecard.cyclesAtZeroVariable })
                }
                valueStyle={{ fontSize: "1.35rem" }}
              />
              <Text type="secondary" className="text-xs">
                {t("scorecard.interest", {
                  amount: formatMoney(scorecard.interestAtZeroVariableMinor, "ARS"),
                })}
              </Text>
            </div>
            <div>
              <Statistic
                title={t("scorecard.ifItCarriesOn", {
                  amount: formatMoney(scorecard.typicalVariableMinor, "ARS"),
                })}
                value={
                  scorecard.neverClearsAtTypicalVariable || scorecard.cyclesAtTypicalVariable === null
                    ? t("scorecard.never")
                    : t("scorecard.cycles", { count: scorecard.cyclesAtTypicalVariable })
                }
                valueStyle={{ fontSize: "1.35rem" }}
              />
              <Text type="secondary" className="text-xs">
                {t("scorecard.interest", {
                  amount: formatMoney(scorecard.interestAtTypicalVariableMinor, "ARS"),
                })}
              </Text>
            </div>
          </div>

          <Paragraph className="mt-3 mb-0! text-xs">
            {t("scorecard.drift", {
              amount: formatMoney(scorecard.costOfDriftMinor, "ARS"),
            })}
          </Paragraph>
          <Text type="secondary" className="text-xs">
            {t("scorecard.spread", {
              best: formatMoney(scorecard.bestVariableMinor, "ARS"),
              worst: formatMoney(scorecard.worstVariableMinor, "ARS"),
              average: formatMoney(scorecard.averageVariableMinor, "ARS"),
            })}
          </Text>
        </div>
      )}
    </SectionPanel>
  );
}
