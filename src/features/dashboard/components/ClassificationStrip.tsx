import { Card, Typography } from "antd";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@shared/money";
import type { Summary } from "@shared/types";

const { Text, Title } = Typography;

interface ClassificationStripProps {
  summary: Summary | null;
}

export function ClassificationStrip({ summary }: ClassificationStripProps): ReactElement {
  const { t } = useTranslation();
  const uncategorized = summary?.uncategorized ?? null;

  return (
    <Card aria-label={t("classification.regionLabel")} className="bg-surface-alt">
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Text type="secondary" className="block text-xs font-semibold tracking-widest uppercase">
            {t("classification.sectionLabel")}
          </Text>
          <Title level={2} className="mt-1! mb-0! text-xl!">
            {t("classification.title")}
          </Title>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tabular-nums text-text">
            {uncategorized === null ? t("common.loading") : formatMoney(uncategorized.totals.ARS, "ARS")}
          </span>
          {uncategorized !== null && uncategorized.totals.USD > 0 && (
            <Text className="text-xs tabular-nums text-accent-vintage-blue">
              {formatMoney(uncategorized.totals.USD, "USD")}
            </Text>
          )}
          <Text type="secondary" className="text-xs">
            {t("classification.uncategorizedRecords", { count: uncategorized?.count ?? 0 })}
          </Text>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tabular-nums text-accent-terracotta">
            {summary?.reviewQueueCount ?? 0}
          </span>
          <Text type="secondary" className="text-xs">
            {t("classification.awaitingReview", { count: summary?.reviewQueueCount ?? 0 })}
          </Text>
        </div>
      </div>
    </Card>
  );
}
