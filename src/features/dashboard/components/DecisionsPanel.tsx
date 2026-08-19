import { Alert, App, Button, Popconfirm, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  clearTransactionCategory,
  deleteMerchantRule,
  fetchManualCategories,
  fetchMerchantAliases,
  fetchMerchantRules,
  revokeMerchantAlias,
} from "@/api";
import { SectionPanel } from "@/components/SectionPanel";
import type { MerchantAlias, MerchantRule, Transaction } from "@shared/types";
import { formatDay } from "../dates";
import { categoryLabel } from "../labels";

const { Paragraph, Text, Title } = Typography;

interface DecisionsPanelProps {
  /** Lets the rest of the page reflect the rows an undo just released. */
  onChanged: () => void;
}

/**
 * Every decision made about the data, in one place, all reversible.
 *
 * The reason this has to exist: most of these were inferred rather than observed. A
 * merchant rule comes from reading a truncated name and deciding what the shop sells; an
 * alias comes from deciding that two clipped strings are one person. Both are judgements,
 * both are invisible once made, and both change what every total on the page says.
 *
 * Without a way back, a wrong guess is indistinguishable from a fact. That is worse than
 * having no guess at all, because the reader has no reason to doubt it.
 *
 * The three kinds behave differently on undo, and the differences matter. Deleting a rule
 * releases its charges. Revoking an alias splits the charges apart AND releases the ones
 * that change identity, because the category they carried was earned by the merge.
 * Undoing a by-hand category hands the charge back to whatever rule covers it, which is
 * not the same as making it uncategorised.
 */
export function DecisionsPanel({ onChanged }: DecisionsPanelProps): ReactElement {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [aliases, setAliases] = useState<MerchantAlias[]>([]);
  const [manual, setManual] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
    try {
      const [ruleList, aliasList, manualList] = await Promise.all([
        fetchMerchantRules(),
        fetchMerchantAliases(),
        fetchManualCategories(),
      ]);
      if (isActive()) {
        setRules(ruleList.merchantRules);
        setAliases(aliasList.merchantAliases);
        setManual(manualList.transactions);
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

  async function undo(action: () => Promise<string>): Promise<void> {
    try {
      const outcome = await action();
      message.success(outcome);
      await load();
      onChanged();
    } catch (undoError) {
      message.error(undoError instanceof Error ? undoError.message : t("decisions.failed"));
    }
  }

  const undoButton = (title: string, action: () => Promise<string>): ReactElement => (
    <Popconfirm
      title={title}
      onConfirm={() => {
        void undo(action);
      }}
    >
      <Button size="small" type="link" danger>
        {t("decisions.undo")}
      </Button>
    </Popconfirm>
  );

  const ruleColumns: ColumnsType<MerchantRule> = [
    { title: t("decisions.columns.merchant"), dataIndex: "merchantKey", width: 220 },
    {
      title: t("decisions.columns.category"),
      dataIndex: "categoryId",
      width: 180,
      render: (categoryId: string) => <Tag>{categoryLabel(t, categoryId, categoryId)}</Tag>,
    },
    {
      title: t("decisions.columns.actions"),
      key: "actions",
      width: 110,
      render: (_value, rule) =>
        undoButton(t("decisions.confirmRule"), async () => {
          const result = await deleteMerchantRule(rule.merchantKey);
          return t("decisions.undoneRule", { count: result.cleared });
        }),
    },
  ];

  const aliasColumns: ColumnsType<MerchantAlias> = [
    { title: t("decisions.columns.alias"), dataIndex: "aliasKey", width: 200 },
    { title: t("decisions.columns.canonical"), dataIndex: "canonicalKey", width: 200 },
    {
      title: t("decisions.columns.movements"),
      dataIndex: "transactionCount",
      align: "right",
      width: 110,
    },
    {
      title: t("decisions.columns.reason"),
      dataIndex: "reason",
      width: 320,
      render: (reason: string) => (
        <Text type="secondary" className="text-xs whitespace-normal">
          {reason}
        </Text>
      ),
    },
    {
      title: t("decisions.columns.actions"),
      key: "actions",
      width: 110,
      render: (_value, alias) =>
        undoButton(t("decisions.confirmAlias"), async () => {
          const result = await revokeMerchantAlias(alias.aliasKey);
          return t("decisions.undoneAlias", { count: result.repointed });
        }),
    },
  ];

  const manualColumns: ColumnsType<Transaction> = [
    {
      title: t("decisions.columns.date"),
      dataIndex: "transactionDate",
      width: 130,
      render: (date: string) => formatDay(date),
    },
    { title: t("decisions.columns.description"), dataIndex: "description", width: 240 },
    {
      title: t("decisions.columns.category"),
      dataIndex: "categoryName",
      width: 170,
      render: (categoryName: string, row) => (
        <Tag>{categoryLabel(t, row.categoryId, categoryName)}</Tag>
      ),
    },
    {
      title: t("decisions.columns.actions"),
      key: "actions",
      width: 110,
      render: (_value, transaction) =>
        undoButton(t("decisions.confirmManual"), async () => {
          await clearTransactionCategory(transaction.id);
          return t("decisions.undoneManual");
        }),
    },
  ];

  const group = (
    title: string,
    note: string,
    count: number,
    table: ReactElement,
  ): ReactElement => (
    <div className="flex flex-col gap-1">
      <Title level={3} className="mb-0! text-base!">
        {title} <Text type="secondary">({count})</Text>
      </Title>
      <Text type="secondary" className="text-xs">
        {note}
      </Text>
      {table}
    </div>
  );

  return (
    <SectionPanel
      label={t("decisions.sectionLabel")}
      title={t("decisions.title")}
      meta={t("decisions.meta")}
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="mb-4" />}

      <Paragraph type="secondary" className="text-xs">
        {t("decisions.hint")}
      </Paragraph>

      <div className="flex flex-col gap-6">
        {group(
          t("decisions.rules"),
          t("decisions.rulesNote"),
          rules.length,
          <Table<MerchantRule>
            columns={ruleColumns}
            dataSource={rules}
            loading={isLoading}
            rowKey={(rule) => rule.merchantKey}
            size="small"
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 8, size: "small", hideOnSinglePage: true }}
            locale={{ emptyText: t("decisions.empty") }}
          />,
        )}

        {group(
          t("decisions.aliases"),
          t("decisions.aliasesNote"),
          aliases.length,
          <Table<MerchantAlias>
            columns={aliasColumns}
            dataSource={aliases}
            loading={isLoading}
            rowKey={(alias) => alias.aliasKey}
            size="small"
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
            locale={{ emptyText: t("decisions.empty") }}
          />,
        )}

        {group(
          t("decisions.manual"),
          t("decisions.manualNote"),
          manual.length,
          <Table<Transaction>
            columns={manualColumns}
            dataSource={manual}
            loading={isLoading}
            rowKey={(transaction) => transaction.id}
            size="small"
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
            locale={{ emptyText: t("decisions.empty") }}
          />,
        )}
      </div>
    </SectionPanel>
  );
}
