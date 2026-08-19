import { DatePicker, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { StatementCycleDates } from "@shared/types";

const { Paragraph, Text, Title } = Typography;

const MONTH_FORMAT = "YYYY-MM";

interface DashboardHeaderProps {
  month: string;
  cycle: StatementCycleDates | null;
  onMonthChange: (month: string) => void;
}

export function DashboardHeader({ month, cycle, onMonthChange }: DashboardHeaderProps): ReactElement {
  const { t } = useTranslation();

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
              <Text className="text-xs text-accent-vintage-blue">
                {t("header.cycleRange", { from: cycle.openedOn, to: cycle.closedOn })}
                {" · "}
                {t("header.cycleDue", { date: cycle.dueOn })}
              </Text>
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
