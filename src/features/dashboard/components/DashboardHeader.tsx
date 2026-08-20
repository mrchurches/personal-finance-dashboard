import { Button, DatePicker, Progress, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { usePrivacy } from "@/app/providers/PrivacyProvider";
import type { StatementCycleDates } from "@shared/types";
import { cycleProgressPercent, daysUntil, formatDay } from "../dates";

const { Paragraph, Text, Title } = Typography;

const MONTH_FORMAT = "YYYY-MM";

interface DashboardHeaderProps {
  month: string;
  cycle: StatementCycleDates | null;
  onMonthChange: (month: string) => void;
}

export function DashboardHeader({ month, cycle, onMonthChange }: DashboardHeaderProps): ReactElement {
  const { t } = useTranslation();
  const { areAmountsHidden, toggleAmounts } = usePrivacy();

  /*
   * The cycle is the unit everything else is counted in, so how much of it is left is
   * the one deadline that is always relevant. It was computed nowhere and the string
   * for it existed unused in both locales.
   */
  const today = dayjs().format("YYYY-MM-DD");
  const daysToClose = cycle === null ? null : daysUntil(cycle.closedOn, today);
  const daysToDue = cycle === null ? null : daysUntil(cycle.dueOn, today);
  const elapsed = cycle === null ? null : cycleProgressPercent(cycle.openedOn, cycle.closedOn, today);

  return (
    <header className="border-b border-border bg-surface px-6 py-8 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text type="secondary" className="text-xs font-semibold tracking-widest uppercase">
            {t("header.eyebrow")}
          </Text>
          <div className="flex items-center gap-3">
            <Tag color="default" className="m-0!">
              {t("header.privacyBadge")}
            </Tag>
            <Button size="small" onClick={toggleAmounts}>
              {areAmountsHidden ? t("header.showAmounts") : t("header.hideAmounts")}
            </Button>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Text type="secondary" className="block text-xs font-semibold tracking-widest uppercase">
              {t("header.kicker")}
            </Text>
            <Title level={1} className="mt-2! mb-2! text-3xl! sm:text-4xl!">
              {t("header.title")}
            </Title>
            <Paragraph type="secondary" className="mb-0!">
              {t("header.subtitle")}
            </Paragraph>
          </div>

          <label className="flex flex-col gap-2">
            <Text type="secondary" className="text-xs font-semibold tracking-widest uppercase">
              {t("header.monthLabel")}
            </Text>
            {cycle !== null && (
              <div className="flex max-w-xs flex-col gap-1">
                <Text className="text-xs text-accent-vintage-blue">
                  {t("header.cycleRange", {
                    from: formatDay(cycle.openedOn),
                    to: formatDay(cycle.closedOn),
                  })}
                </Text>
                {elapsed !== null && daysToClose !== null && daysToClose >= 0 && (
                  <>
                    <Progress
                      percent={elapsed}
                      size="small"
                      showInfo={false}
                      strokeColor="var(--color-accent-vintage-blue)"
                      trailColor="var(--color-surface-alt)"
                    />
                    <Text type="secondary" className="text-xs">
                      {t("header.cycleOpen", { count: daysToClose })}
                    </Text>
                  </>
                )}
                <Text className="text-xs">
                  {t("header.cycleDue", { date: formatDay(cycle.dueOn) })}
                  {daysToDue !== null && daysToDue >= 0 && (
                    <>
                      {" · "}
                      {t("header.dueIn", { count: daysToDue })}
                    </>
                  )}
                </Text>
              </div>
            )}
            <DatePicker
              picker="month"
              allowClear={false}
              value={dayjs(month, MONTH_FORMAT)}
              format={MONTH_FORMAT}
              onChange={(next) => {
                if (next !== null) {
                  onMonthChange(next.format(MONTH_FORMAT));
                }
              }}
            />
          </label>
        </div>
      </div>
    </header>
  );
}
