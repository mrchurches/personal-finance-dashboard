import { Alert, Skeleton, Statistic, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchScorecard } from "@/api";
import { SectionPanel } from "@/components/SectionPanel";
import { formatMoney } from "@shared/money";
import type { ScorecardResponse, StatementCycleDates } from "@shared/types";
import { daysUntil, formatCycleLong, formatDay } from "../dates";

const { Paragraph, Text } = Typography;

interface VerdictBandProps {
  month: string;
  cycle: StatementCycleDates | null;
  commitmentsVersion: number;
}

/**
 * The answer, before anything else.
 *
 * Everything this shows was already computed and already being fetched; it was just
 * spread across the fifth, sixth and seventh panels in twelve-pixel grey, so a reader
 * had to scroll past two chores to reach the only sentence that answers what is
 * happening to their money.
 *
 * The two endings are stated together and never averaged, because the gap between them
 * IS the finding: the debt clears soon if discretionary spending stops and does not
 * clear at all at the level actually observed. Presenting either one alone would be a
 * different claim - one flattering, one hopeless - and both would be wrong.
 */
export function VerdictBand({ month, cycle, commitmentsVersion }: VerdictBandProps): ReactElement {
  const { t } = useTranslation();
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
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
      });

    return () => {
      isActive = false;
    };
  }, [month, commitmentsVersion]);

  const today = dayjs().format("YYYY-MM-DD");
  const daysToDue = cycle === null ? null : daysUntil(cycle.dueOn, today);
  const neverClears =
    scorecard !== null
    && (scorecard.neverClearsAtTypicalVariable || scorecard.cyclesAtTypicalVariable === null);

  return (
    <SectionPanel label={t("verdict.sectionLabel")} title={t("verdict.title")}>
      {error.length > 0 && <Alert type="error" showIcon message={error} className="mb-4" />}

      {scorecard === null ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Statistic
              title={t("verdict.debtNow")}
              value={formatMoney(scorecard.openingBalanceMinor, "ARS")}
              valueStyle={{ fontSize: "1.9rem", color: "var(--color-error)" }}
            />
            {cycle !== null && (
              <Statistic
                title={t("verdict.nextPayment")}
                value={formatDay(cycle.dueOn)}
                valueStyle={{ fontSize: "1.9rem" }}
                suffix={
                  daysToDue !== null && daysToDue >= 0 ? (
                    <Text type="secondary" className="text-sm">
                      {t("verdict.inDays", { count: daysToDue })}
                    </Text>
                  ) : undefined
                }
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-success/40 p-3">
              <Text type="secondary" className="block text-xs">
                {t("verdict.ifStops")}
              </Text>
              <Text strong className="block text-lg text-success!">
                {scorecard.clearedAtZeroVariable === null
                  ? t("verdict.never")
                  : t("verdict.freeIn", {
                      date: formatCycleLong(scorecard.clearedAtZeroVariable),
                      count: scorecard.cyclesAtZeroVariable ?? 0,
                    })}
              </Text>
            </div>
            <div className="rounded-md border border-error/40 p-3">
              <Text type="secondary" className="block text-xs">
                {t("verdict.ifCarriesOn", {
                  amount: formatMoney(scorecard.typicalVariableMinor, "ARS"),
                })}
              </Text>
              <Text strong className="block text-lg text-error!">
                {neverClears
                  ? t("verdict.never")
                  : t("verdict.cycles", { count: scorecard.cyclesAtTypicalVariable ?? 0 })}
              </Text>
            </div>
          </div>

          {/*
            The caveat is visible text and not a tooltip. It is the one thing that makes
            the good ending readable as a target rather than a promise, and it had been
            living in a note at the bottom of the page.
          */}
          <Paragraph className="mb-0! text-xs">{t("verdict.caveat")}</Paragraph>
        </div>
      )}
    </SectionPanel>
  );
}
