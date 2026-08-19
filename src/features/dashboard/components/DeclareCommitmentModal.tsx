import { Alert, Form, Input, InputNumber, Modal, Select, Typography } from "antd";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { createCommitment, fetchSpendingPatterns } from "@/api";
import {
  COMMITMENT_EFFECT,
  type Category,
  type CommitmentEffect,
  type SpendingPattern,
} from "@shared/types";
import { categoryLabel } from "../labels";

const { Paragraph } = Typography;

interface DeclareCommitmentModalProps {
  open: boolean;
  categories: Category[];
  defaultPeriod: string;
  onClose: () => void;
  onDeclared: () => void;
}

interface CommitmentFormValues {
  label: string;
  amount: number;
  currency: string;
  effect: CommitmentEffect;
  patternKey?: string;
  feePercent: number;
  effectiveFrom: string;
  effectiveTo?: string;
  note?: string;
  replacedCategoryIds?: string[];
}

/**
 * Categories offered flat, with parents selectable.
 *
 * The opposite choice from the transaction pickers, and deliberately so: a
 * transaction has to land on a leaf, but a substitution declared against "food"
 * means the whole tree, and the backend expands it. Forbidding the parent here
 * would force the owner to enumerate children and silently miss any added later.
 */
function replaceableCategoryOptions(
  categories: Category[],
  label: (category: Category) => string,
): { value: string; label: string }[] {
  const expense = categories.filter((category) => category.kind === "expense");
  const parents = new Set(
    expense.map((category) => category.parentId).filter((id): id is string => id !== null),
  );

  const options: { value: string; label: string }[] = [];
  for (const category of expense) {
    if (category.parentId !== null) {
      continue;
    }

    options.push({ value: category.id, label: label(category) });
    if (!parents.has(category.id)) {
      continue;
    }

    for (const child of expense.filter((candidate) => candidate.parentId === category.id)) {
      options.push({ value: child.id, label: `— ${label(child)}` });
    }
  }

  return options;
}

export function DeclareCommitmentModal({
  open,
  categories,
  defaultPeriod,
  onClose,
  onDeclared,
}: DeclareCommitmentModalProps): ReactElement {
  const { t } = useTranslation();
  const [form] = Form.useForm<CommitmentFormValues>();
  const [patterns, setPatterns] = useState<SpendingPattern[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const effect = Form.useWatch("effect", form) ?? COMMITMENT_EFFECT.OVERRIDE;

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");

    /*
     * Reset first, then set. antd keeps a field's value after its input unmounts,
     * and this form instance outlives the dialog, so setting only some of the
     * fields left the rest holding the previous declaration: a substitution could
     * be submitted carrying the merchant, end period and note of an override
     * declared minutes earlier, none of which were on screen.
     */
    form.resetFields();
    form.setFieldsValue({
      label: "",
      amount: 0,
      currency: "ARS",
      effect: COMMITMENT_EFFECT.OVERRIDE,
      patternKey: undefined,
      feePercent: 0,
      effectiveFrom: defaultPeriod,
      effectiveTo: undefined,
      note: undefined,
      replacedCategoryIds: undefined,
    });

    let isActive = true;
    void fetchSpendingPatterns()
      .then((response) => {
        if (isActive) {
          setPatterns(response.patterns);
        }
      })
      .catch(() => {
        /* The merchant list is a convenience; the key can still be typed. */
      });

    return () => {
      isActive = false;
    };
  }, [open, defaultPeriod, form]);

  async function save(values: CommitmentFormValues): Promise<void> {
    setIsSaving(true);
    try {
      await createCommitment({
        label: values.label,
        /* Pesos on screen, minor units on the wire, like every other amount. */
        amountMinor: Math.round(values.amount * 100),
        currency: values.currency,
        effect: values.effect,
        /*
         * The picker offers costs, not merchants, so the choice cannot be ambiguous.
         * One counterparty can carry two unrelated costs, and an override or a
         * termination that named only the merchant reached both of them.
         */
        merchantKey: values.patternKey?.split("::")[0] ?? null,
        categoryId: values.patternKey?.split("::")[1] ?? null,
        /* Thousandths of a percent: 6.99% travels as 6990, with no float left in it. */
        feeMilli: Math.round(values.feePercent * 1000),
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo ?? null,
        note: values.note ?? null,
        replacedCategoryIds: values.replacedCategoryIds ?? [],
      });

      onDeclared();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("commitments.failed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t("commitments.form.title")}
      okText={t("commitments.form.save")}
      cancelText={t("common.cancel")}
      confirmLoading={isSaving}
      width={620}
      onOk={() => {
        void form.submit();
      }}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
        <Form.Item name="label" label={t("commitments.form.label")} rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
          <Form.Item
            name="amount"
            label={
              effect === COMMITMENT_EFFECT.TERMINATION
                ? t("commitments.form.amountTermination")
                : t("commitments.form.amount")
            }
            rules={[{ required: true }]}
          >
            <InputNumber className="w-full" min={0} max={1_000_000_000} step={1000} decimalSeparator="," />
          </Form.Item>
          <Form.Item name="currency" label={t("commitments.form.currency")}>
            <Select
              options={[
                { value: "ARS", label: "ARS" },
                { value: "USD", label: "USD" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="feePercent"
            label={t("commitments.form.fee")}
            extra={t("commitments.form.feeHint")}
          >
            <InputNumber className="w-full" min={0} max={100} step={0.01} decimalSeparator="," />
          </Form.Item>
        </div>

        <Form.Item name="effect" label={t("commitments.form.effect")} rules={[{ required: true }]}>
          <Select
            options={[
              {
                value: COMMITMENT_EFFECT.OVERRIDE,
                label: t("commitments.effect.override"),
              },
              {
                value: COMMITMENT_EFFECT.SUBSTITUTION,
                label: t("commitments.effect.substitution"),
              },
              {
                value: COMMITMENT_EFFECT.ADDITION,
                label: t("commitments.effect.addition"),
              },
              {
                value: COMMITMENT_EFFECT.TERMINATION,
                label: t("commitments.effect.termination"),
              },
            ]}
          />
        </Form.Item>

        <Paragraph type="secondary" className="text-xs">
          {t(`commitments.effectHint.${effect}`)}
        </Paragraph>

        {(effect === COMMITMENT_EFFECT.OVERRIDE || effect === COMMITMENT_EFFECT.TERMINATION) && (
          <Form.Item
            name="patternKey"
            label={t("commitments.form.merchant")}
            extra={t("commitments.form.merchantHint")}
            rules={[{ required: true, message: t("commitments.form.merchantRequired") }]}
          >
            <Select
              showSearch
              placeholder={t("commitments.form.merchantPlaceholder")}
              optionFilterProp="label"
              options={patterns.map((pattern) => ({
                value: pattern.patternKey,
                label: `${pattern.merchantKey} · ${categoryLabel(t, pattern.categoryId, pattern.categoryName)}`,
              }))}
            />
          </Form.Item>
        )}

        {effect === COMMITMENT_EFFECT.SUBSTITUTION && (
          <Form.Item
            name="replacedCategoryIds"
            label={t("commitments.form.categories")}
            extra={t("commitments.form.categoriesHint")}
            rules={[{ required: true }]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              options={replaceableCategoryOptions(categories, (category) =>
                categoryLabel(t, category.id, category.name),
              )}
            />
          </Form.Item>
        )}

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item
            name="effectiveFrom"
            label={
              effect === COMMITMENT_EFFECT.TERMINATION
                ? t("commitments.form.fromTermination")
                : t("commitments.form.from")
            }
            rules={[
              { required: true, message: t("commitments.form.periodRequired") },
              { pattern: /^\d{4}-(?:0[1-9]|1[0-2])$/, message: t("commitments.form.periodInvalid") },
            ]}
          >
            <Input placeholder={t("commitments.form.periodPlaceholder")} />
          </Form.Item>
          <Form.Item
            name="effectiveTo"
            label={t("commitments.form.to")}
            extra={t("commitments.form.toHint")}
            rules={[{ pattern: /^\d{4}-(?:0[1-9]|1[0-2])$/, message: t("commitments.form.periodInvalid") }]}
          >
            <Input placeholder={t("commitments.form.periodPlaceholder")} />
          </Form.Item>
        </div>

        <Form.Item name="note" label={t("commitments.form.note")}>
          <Input.TextArea rows={2} />
        </Form.Item>

        {error.length > 0 && <Alert type="error" showIcon message={error} />}
      </Form>
    </Modal>
  );
}
