import { Button, Select, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { TRANSACTION_TYPE, type Account, type Category, type Transaction } from "@shared/types";
import { categoryLabel, installmentLabel, sourceKindLabel } from "../labels";
import { CategorizeTransactionModal } from "./CategorizeTransactionModal";

const { Text } = Typography;

const UNCATEGORIZED_ID = "uncategorized";

interface TransactionsTableProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  categoryFilter: string;
  accountFilter: string;
  isLoading: boolean;
  onCategoryFilterChange: (categoryId: string) => void;
  onAccountFilterChange: (accountId: string) => void;
  onCategorized: () => void;
}

export function TransactionsTable({
  transactions,
  categories,
  accounts,
  categoryFilter,
  accountFilter,
  isLoading,
  onCategoryFilterChange,
  onAccountFilterChange,
  onCategorized,
}: TransactionsTableProps): ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Transaction | null>(null);

  const columns: ColumnsType<Transaction> = [
    {
      title: t("transactions.columns.date"),
      dataIndex: "transactionDate",
      width: 120,
      sorter: (left, right) => left.transactionDate.localeCompare(right.transactionDate),
    },
    {
      title: t("transactions.columns.statementPeriod"),
      dataIndex: "statementPeriod",
      width: 130,
      render: (period: string | null) => period ?? t("common.empty"),
    },
    { title: t("transactions.columns.account"), dataIndex: "accountName", width: 160 },
    {
      title: t("transactions.columns.description"),
      dataIndex: "description",
      width: 280,
      render: (description: string) => <Text className="text-sm">{description}</Text>,
    },
    {
      title: t("transactions.columns.category"),
      dataIndex: "categoryName",
      width: 170,
      render: (categoryName: string, transaction) => (
        <Tag color={transaction.categoryId === UNCATEGORIZED_ID ? "warning" : undefined}>
          {categoryLabel(t, transaction.categoryId, categoryName)}
        </Tag>
      ),
    },
    {
      title: t("transactions.columns.amount"),
      dataIndex: "amountMinor",
      align: "right",
      width: 150,
      sorter: (left, right) => left.amountMinor - right.amountMinor,
      render: (_amountMinor: number, transaction) => {
        const isExpense = transaction.transactionType === TRANSACTION_TYPE.EXPENSE;
        return (
          <MoneyAmount
            amountMinor={isExpense ? -transaction.amountMinor : transaction.amountMinor}
            currency={transaction.currency}
            direction={isExpense ? "outflow" : "inflow"}
          />
        );
      },
    },
    { title: t("transactions.columns.currency"), dataIndex: "currency", width: 90 },
    {
      title: t("transactions.columns.installment"),
      key: "installment",
      width: 100,
      render: (_value, transaction) =>
        installmentLabel(t, transaction.installmentCurrent, transaction.installmentTotal),
    },
    {
      title: t("transactions.columns.source"),
      key: "source",
      width: 200,
      render: (_value, transaction) => sourceKindLabel(t, transaction.sourceKind),
    },
    {
      title: t("transactions.columns.locator"),
      dataIndex: "sourceLocator",
      width: 140,
      render: (locator: string | null) => locator ?? t("common.empty"),
    },
    {
      title: t("transactions.columns.actions"),
      key: "actions",
      width: 130,
      fixed: "right",
      render: (_value, transaction) => (
        <Button size="small" type="link" onClick={() => setEditing(transaction)}>
          {t("transactions.categorize.action")}
        </Button>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("transactions.sectionLabel")}
      title={t("transactions.title")}
      bodyClassName="p-0!"
      meta={
        <div className="flex flex-wrap gap-2" aria-label={t("transactions.filtersLabel")}>
          <Select
            aria-label={t("transactions.filterByCategory")}
            className="w-52"
            value={categoryFilter}
            onChange={onCategoryFilterChange}
            options={[
              { label: t("transactions.allCategories"), value: "" },
              ...categories.map((category) => ({
                label: categoryLabel(t, category.id, category.name),
                value: category.id,
              })),
            ]}
          />
          <Select
            aria-label={t("transactions.filterByAccount")}
            className="w-52"
            value={accountFilter}
            onChange={onAccountFilterChange}
            options={[
              { label: t("transactions.allAccounts"), value: "" },
              ...accounts.map((account) => ({ label: account.name, value: account.id })),
            ]}
          />
        </div>
      }
    >
      <Table<Transaction>
        columns={columns}
        dataSource={transactions}
        loading={isLoading}
        rowKey={(transaction) => transaction.id}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showSizeChanger: true, size: "small" }}
        locale={{ emptyText: t("transactions.empty") }}
      />

      <CategorizeTransactionModal
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onCategorized={onCategorized}
      />
    </SectionPanel>
  );
}
