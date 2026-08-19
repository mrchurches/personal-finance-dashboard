import { Empty, Progress, Typography } from "antd";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { palette } from "@/theme/palette";
import type { CategoryTotal, Currency, Summary } from "@shared/types";
import { percentageLabel } from "../labels";

const { Text } = Typography;

const DISPLAY_CURRENCIES: Currency[] = ["ARS", "USD"];

interface CategoryBreakdownProps {
  summary: Summary | null;
}

export function CategoryBreakdown({ summary }: CategoryBreakdownProps): ReactElement {
  const { t } = useTranslation();

  return (
    <SectionPanel
      label={t("categories.sectionLabel")}
      title={t("categories.title")}
      meta={t("categories.meta")}
    >
      <div className="flex flex-col gap-8">
        {DISPLAY_CURRENCIES.map((currency) => {
          const totals =
            summary?.categoryTotals.filter((total) => total.currency === currency) ?? [];

          return (
            <div key={currency} className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Text strong>{currency}</Text>
                <Text type="secondary" className="text-xs">
                  {t("categories.count", { count: totals.length })}
                </Text>
              </div>

              {totals.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("categories.empty")}
                  className="my-2!"
                />
              ) : (
                totals.map((total) => <CategoryRow key={`${total.currency}-${total.categoryId}`} total={total} />)
              )}
            </div>
          );
        })}
      </div>
    </SectionPanel>
  );
}

function CategoryRow({ total }: { total: CategoryTotal }): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <Text>{total.categoryName}</Text>
        <MoneyAmount amountMinor={total.amountMinor} currency={total.currency} />
      </div>
      <Progress
        percent={Math.min(total.percentage, 100)}
        showInfo={false}
        size="small"
        strokeColor={palette.primary}
        trailColor={palette.surfaceAlt}
      />
      <div className="flex items-center justify-between">
        <Text type="secondary" className="text-xs tabular-nums">
          {percentageLabel(total.percentage)}
        </Text>
        <Text type="secondary" className="text-xs">
          {t("categories.records", { count: total.transactionCount })}
        </Text>
      </div>
    </div>
  );
}
