import { Empty, Progress, Typography } from "antd";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { palette } from "@/theme/palette";
import type { CategoryTotal, Currency, Summary } from "@shared/types";
import { categoryLabel, percentageLabel } from "../labels";

const { Text } = Typography;

const DISPLAY_CURRENCIES: Currency[] = ["ARS", "USD"];

interface TotalGroup {
  key: string;
  /** Null for categories that stand on their own rather than inside a group. */
  name: string | null;
  amountMinor: number;
  rows: CategoryTotal[];
}

/**
 * Puts each total under its parent, keeping standalone categories first so the
 * ungrouped ones do not read as belonging to whatever group precedes them. The
 * group amount is the sum of its children, never a stored figure, so it cannot
 * drift from the rows beneath it.
 */
function groupTotals(totals: CategoryTotal[]): TotalGroup[] {
  const groups: TotalGroup[] = [];
  const byParent = new Map<string, TotalGroup>();

  for (const total of totals) {
    if (total.parentId === null || total.parentName === null) {
      groups.push({ key: total.categoryId, name: null, amountMinor: total.amountMinor, rows: [total] });
      continue;
    }

    const existing = byParent.get(total.parentId);
    if (existing === undefined) {
      const group: TotalGroup = {
        key: total.parentId,
        name: total.parentName,
        amountMinor: total.amountMinor,
        rows: [total],
      };
      byParent.set(total.parentId, group);
      groups.push(group);
      continue;
    }

    existing.amountMinor += total.amountMinor;
    existing.rows.push(total);
  }

  return groups.sort((left, right) => right.amountMinor - left.amountMinor);
}

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
                groupTotals(totals).map((group) => (
                  <div key={`${currency}-${group.key}`} className="flex flex-col gap-4">
                    {group.name !== null && (
                      <div className="flex items-baseline justify-between border-b border-surface-alt pb-1">
                        <Text strong className="text-sm">
                          {group.name}
                        </Text>
                        <MoneyAmount amountMinor={group.amountMinor} currency={currency} />
                      </div>
                    )}
                    <div className={group.name === null ? "flex flex-col gap-4" : "flex flex-col gap-4 pl-3"}>
                      {group.rows.map((total) => (
                        <CategoryRow key={`${total.currency}-${total.categoryId}`} total={total} />
                      ))}
                    </div>
                  </div>
                ))
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
        <Text>{categoryLabel(t, total.categoryId, total.categoryName)}</Text>
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
