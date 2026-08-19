import { Alert, App, Empty, Select, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { createMerchantRule, fetchUncategorizedMerchants } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { CATEGORY_KIND, type Category, type UncategorizedMerchant } from "@shared/types";
import { buildCategoryOptions } from "../categoryOptions";
import { categoryLabel } from "../labels";

const { Paragraph, Text } = Typography;

interface CategorizationQueueProps {
  categories: Category[];
  /** Lets the rest of the dashboard reflect the rows the rule just claimed. */
  onCategorized: () => void;
}

/**
 * The work queue for categorising, heaviest merchant first.
 *
 * Ordered by amount rather than by date or count because that is the order in
 * which the effort pays off: settling the largest merchant moves the uncategorised
 * total more than a dozen small ones. Assigning a category writes a rule rather
 * than touching a single row, so the same decision covers every cycle at once and
 * keeps covering future imports.
 */
export function CategorizationQueue({
  categories,
  onCategorized,
}: CategorizationQueueProps): ReactElement {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [merchants, setMerchants] = useState<UncategorizedMerchant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
    try {
      const response = await fetchUncategorizedMerchants();
      if (isActive()) {
        setMerchants(response.merchants);
        setError("");
      }
    } catch (loadError) {
      if (isActive()) {
        setError(loadError instanceof Error ? loadError.message : "");
      }
    } finally {
      if (isActive()) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load(() => active);

    return () => {
      active = false;
    };
  }, [load]);

  const categoryOptions = buildCategoryOptions(t, categories, CATEGORY_KIND.EXPENSE);

  async function assign(merchant: UncategorizedMerchant, categoryId: string): Promise<void> {
    setSavingKey(merchant.merchantKey);
    try {
      const result = await createMerchantRule({ merchant: merchant.merchantKey, categoryId });
      const category = categories.find((candidate) => candidate.id === categoryId);
      message.success(
        t("queue.applied", {
          count: result.applied,
          category: category === undefined ? categoryId : categoryLabel(t, category.id, category.name),
        }),
      );
      await load();
      onCategorized();
    } catch {
      message.error(t("queue.failed"));
    } finally {
      setSavingKey(null);
    }
  }

  const columns: ColumnsType<UncategorizedMerchant> = [
    {
      title: t("queue.columns.merchant"),
      dataIndex: "merchantKey",
      render: (merchantKey: string) => <Text className="text-sm font-medium">{merchantKey}</Text>,
    },
    {
      title: t("queue.columns.movements"),
      dataIndex: "transactionCount",
      align: "right",
      width: 110,
    },
    {
      title: t("queue.columns.amount"),
      dataIndex: "amountMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number, merchant) => (
        <MoneyAmount amountMinor={amountMinor} currency={merchant.currency} direction="outflow" />
      ),
    },
    {
      title: t("queue.columns.seen"),
      key: "seen",
      width: 160,
      render: (_value, merchant) =>
        merchant.firstSeen === merchant.lastSeen
          ? merchant.firstSeen
          : `${merchant.firstSeen} → ${merchant.lastSeen}`,
    },
    {
      title: t("queue.columns.category"),
      key: "category",
      width: 230,
      render: (_value, merchant) => (
        <Select
          className="w-full"
          showSearch
          optionFilterProp="label"
          placeholder={t("queue.assign")}
          loading={savingKey === merchant.merchantKey}
          disabled={savingKey !== null}
          options={categoryOptions}
          value={null}
          onChange={(categoryId: string) => {
            void assign(merchant, categoryId);
          }}
        />
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("queue.sectionLabel")}
      title={t("queue.title")}
      meta={merchants.length === 0 ? t("queue.meta") : t("queue.pending", { count: merchants.length })}
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("queue.hint")}
      </Paragraph>

      <Table<UncategorizedMerchant>
        columns={columns}
        dataSource={merchants}
        loading={isLoading}
        rowKey={(merchant) => `${merchant.merchantKey}-${merchant.currency}`}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 10, size: "small" }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("queue.empty")} />,
        }}
      />
    </SectionPanel>
  );
}
