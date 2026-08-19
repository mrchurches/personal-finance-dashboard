import { Alert, Button, DatePicker, Form, Input, Segmented, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { SectionPanel } from "@/components/SectionPanel";
import { buildCategoryOptions } from "../categoryOptions";
import { createTransaction } from "@/api";
import { normaliseAmountInput, parseAmountToMinor } from "@shared/money";
import {
  CATEGORY_KIND,
  CURRENCY,
  TRANSACTION_TYPE,
  type Account,
  type Category,
  type Currency,
  type TransactionType,
} from "@shared/types";

const DATE_FORMAT = "YYYY-MM-DD";

interface TransactionFormValues {
  transactionDate: Dayjs;
  transactionType: TransactionType;
  description: string;
  amount: string;
  currency: Currency;
  categoryId: string;
  accountId: string;
}

interface NewTransactionFormProps {
  categories: Category[];
  accounts: Account[];
  defaultDate: string;
  isLoading: boolean;
  onCreated: () => void;
}

/** Spanish keyboards type "1234,56": normalise before the shared money parser sees it. */
export function NewTransactionForm({
  categories,
  accounts,
  defaultDate,
  isLoading,
  onCreated,
}: NewTransactionFormProps): ReactElement {
  const { t } = useTranslation();
  const [form] = Form.useForm<TransactionFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const transactionType =
    Form.useWatch("transactionType", form) ?? TRANSACTION_TYPE.EXPENSE;
  const currency = Form.useWatch("currency", form) ?? CURRENCY.ARS;

  const expectedCategoryKind =
    transactionType === TRANSACTION_TYPE.INCOME ? CATEGORY_KIND.INCOME : CATEGORY_KIND.EXPENSE;
  const categoryOptions = buildCategoryOptions(t, categories, expectedCategoryKind);

  async function handleFinish(values: TransactionFormValues): Promise<void> {
    setSubmitError("");
    setIsSubmitting(true);

    try {
      await createTransaction({
        transactionDate: values.transactionDate.format(DATE_FORMAT),
        description: values.description,
        categoryId: values.categoryId,
        accountId: values.accountId,
        transactionType: values.transactionType,
        amount: normaliseAmountInput(values.amount),
        currency: values.currency,
      });

      form.resetFields(["description", "amount"]);
      onCreated();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("form.errors.saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SectionPanel
      label={t("form.sectionLabel")}
      title={t("form.title")}
      meta={t("form.meta")}
    >
      <Form<TransactionFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={isLoading}
        initialValues={{
          transactionDate: dayjs(defaultDate, DATE_FORMAT),
          transactionType: TRANSACTION_TYPE.EXPENSE,
          currency: CURRENCY.ARS,
          description: "",
          amount: "",
        }}
        onFinish={(values) => {
          void handleFinish(values);
        }}
      >
        <Form.Item name="transactionType" label={t("form.type")}>
          <Segmented
            block
            options={[
              { label: t("transactionType.expense"), value: TRANSACTION_TYPE.EXPENSE },
              { label: t("transactionType.income"), value: TRANSACTION_TYPE.INCOME },
            ]}
            onChange={() => {
              form.setFieldValue("categoryId", undefined);
            }}
          />
        </Form.Item>

        <Form.Item
          name="transactionDate"
          label={t("form.date")}
          rules={[{ required: true, message: t("form.errors.required") }]}
        >
          <DatePicker className="w-full" format={DATE_FORMAT} allowClear={false} />
        </Form.Item>

        <Form.Item
          name="description"
          label={t("form.description")}
          rules={[{ required: true, message: t("form.errors.required") }]}
        >
          <Input maxLength={160} placeholder={t("form.descriptionPlaceholder")} />
        </Form.Item>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[2fr_1fr]">
          <Form.Item
            name="amount"
            label={t("form.amount")}
            rules={[
              { required: true, message: t("form.errors.required") },
              {
                validator: (_rule, value: unknown) => {
                  if (typeof value !== "string" || value.trim().length === 0) {
                    return Promise.resolve();
                  }

                  try {
                    parseAmountToMinor(normaliseAmountInput(value), currency);
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(new Error(t("form.errors.invalidAmount")));
                  }
                },
              },
            ]}
          >
            <Input inputMode="decimal" placeholder={t("form.amountPlaceholder")} />
          </Form.Item>

          <Form.Item name="currency" label={t("form.currency")}>
            <Select
              options={[
                { label: CURRENCY.ARS, value: CURRENCY.ARS },
                { label: CURRENCY.USD, value: CURRENCY.USD },
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="categoryId"
          label={t("form.category")}
          rules={[{ required: true, message: t("form.errors.missingCategoryOrAccount") }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
          />
        </Form.Item>

        <Form.Item
          name="accountId"
          label={t("form.account")}
          rules={[{ required: true, message: t("form.errors.missingCategoryOrAccount") }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={accounts.map((account) => ({ label: account.name, value: account.id }))}
          />
        </Form.Item>

        {submitError.length > 0 && (
          <Alert type="error" showIcon message={submitError} className="mb-4" />
        )}

        <Button type="primary" htmlType="submit" block loading={isSubmitting}>
          {isSubmitting ? t("form.submitting") : t("form.submit")}
        </Button>
      </Form>
    </SectionPanel>
  );
}
