import { Alert, Modal, Select, Typography } from "antd";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { setTransactionCategory } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { TRANSACTION_TYPE, type Category, type Transaction } from "@shared/types";
import { buildCategoryOptions } from "../categoryOptions";

const { Paragraph, Text } = Typography;

interface CategorizeTransactionModalProps {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onCategorized: () => void;
}

/**
 * Categorises one charge, not a merchant.
 *
 * The queue answers "everything from this shop is X", which is wrong for a shop
 * that sells more than one kind of thing: the corner kiosk is food one day and
 * cigarettes the next. This writes the category straight onto the row and marks
 * it manual, so the merchant rule never overwrites the call made here.
 */
export function CategorizeTransactionModal({
  transaction,
  categories,
  onClose,
  onCategorized,
}: CategorizeTransactionModalProps): ReactElement {
  const { t } = useTranslation();
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCategoryId(undefined);
    setError("");
  }, [transaction?.id]);

  const isExpense = transaction?.transactionType === TRANSACTION_TYPE.EXPENSE;
  const options = buildCategoryOptions(t, categories, isExpense ? "expense" : "income");

  const save = (): void => {
    if (transaction === null || categoryId === undefined) {
      return;
    }

    setIsSaving(true);
    void setTransactionCategory(transaction.id, categoryId)
      .then(() => {
        onCategorized();
        onClose();
      })
      .catch((saveError: Error) => {
        setError(saveError.message);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  return (
    <Modal
      open={transaction !== null}
      title={t("transactions.categorize.title")}
      okText={t("transactions.categorize.save")}
      cancelText={t("common.cancel")}
      okButtonProps={{ disabled: categoryId === undefined, loading: isSaving }}
      onOk={save}
      onCancel={onClose}
      destroyOnHidden
    >
      {transaction !== null && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-surface-alt px-3 py-2">
            <Text className="text-sm">{transaction.description}</Text>
            <div className="mt-1 flex items-center justify-between text-xs">
              <Text type="secondary">
                {transaction.statementPeriod ?? transaction.transactionDate}
              </Text>
              <MoneyAmount
                amountMinor={isExpense ? -transaction.amountMinor : transaction.amountMinor}
                currency={transaction.currency}
                direction={isExpense ? "outflow" : "inflow"}
              />
            </div>
          </div>

          <Select
            aria-label={t("transactions.categorize.select")}
            className="w-full"
            placeholder={t("transactions.categorize.select")}
            value={categoryId}
            onChange={setCategoryId}
            options={options}
            showSearch
            optionFilterProp="label"
          />

          <Paragraph type="secondary" className="mb-0! text-xs">
            {t("transactions.categorize.hint")}
          </Paragraph>

          {error.length > 0 && <Alert type="error" showIcon message={error} />}
        </div>
      )}
    </Modal>
  );
}
