import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { declareExchangeRate, fetchExchangeRates } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import { usePrivacy } from "@/app/providers/PrivacyProvider";
import { formatCycle, formatDay } from "../dates";
import type { ExchangeRatesResponse, ForeignCycle } from "@shared/types";

const { Paragraph, Text } = Typography;

interface RateFormValues {
  rate: number;
  asOf: Dayjs;
  note?: string;
}

/**
 * Spending the rest of the dashboard cannot see.
 *
 * Every other panel filters to pesos, which is right for arithmetic and wrong for
 * the total: a subscription billed in dollars is spending whether or not it can be
 * added to a peso column, and until it is converted it is simply missing from every
 * figure on screen.
 *
 * Conversion needs a rate that was stated, for a day it was stated for. In an
 * economy with several simultaneous rates a converted figure without one is not an
 * approximation but a fabrication, and on screen it looks exactly like a real
 * number. So a cycle with no rate declared before it says so instead of showing a
 * total.
 */
export function ForeignCurrencyPanel(): ReactElement {
  const { t } = useTranslation();
  const { money } = usePrivacy();
  const { message } = App.useApp();
  const [data, setData] = useState<ExchangeRatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<RateFormValues>();

  const load = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
    try {
      const response = await fetchExchangeRates();
      if (isActive()) {
        setData(response);
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

  async function save(values: RateFormValues): Promise<void> {
    setIsSaving(true);
    try {
      await declareExchangeRate({
        quoteCurrency: "USD",
        /* Pesos per dollar on screen, minor units on the wire, like every amount. */
        rateMinor: Math.round(values.rate * 100),
        asOf: values.asOf.format("YYYY-MM-DD"),
        note: values.note ?? null,
      });
      form.resetFields();
      await load();
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : t("fx.failed"));
    } finally {
      setIsSaving(false);
    }
  }

  const columns: ColumnsType<ForeignCycle> = [
        {
      title: t("fx.columns.cycle"),
      dataIndex: "period",
      width: 120,
      render: (period: string) => formatCycle(period),
    },
    {
      title: t("fx.columns.spent"),
      dataIndex: "amountMinor",
      align: "right",
      width: 130,
      render: (amountMinor: number, row) => (
        <MoneyAmount amountMinor={-amountMinor} currency={row.currency as "USD"} direction="outflow" />
      ),
    },
    {
      title: t("fx.columns.rate"),
      key: "rate",
      align: "right",
      width: 160,
      render: (_value, row) =>
        row.rateMinor === null ? (
          <Text type="warning" className="text-xs">
            {t("fx.noRate")}
          </Text>
        ) : (
          <Text type="secondary" className="text-xs tabular-nums">
            {money(row.rateMinor, "ARS")}
            <br />
            {formatDay(row.rateAsOf ?? "")}
          </Text>
        ),
    },
    {
      title: t("fx.columns.converted"),
      dataIndex: "convertedArsMinor",
      align: "right",
      width: 150,
      render: (amountMinor: number | null) =>
        amountMinor === null ? (
          <Text type="secondary">{t("common.empty")}</Text>
        ) : (
          <Text strong>
            <MoneyAmount amountMinor={-amountMinor} currency="ARS" direction="outflow" />
          </Text>
        ),
    },
  ];

  return (
    <SectionPanel
      label={t("fx.sectionLabel")}
      title={t("fx.title")}
      meta={
        data?.foreign.latest === null || data === null
          ? t("fx.noRateDeclared")
          : t("fx.currentRate", {
              amount: money(data.foreign.latest.rateMinor, "ARS"),
              date: formatDay(data.foreign.latest.asOf),
            })
      }
      bodyClassName="p-0!"
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("fx.hint")}
      </Paragraph>

      <Table<ForeignCycle>
        columns={columns}
        dataSource={data?.foreign.cycles ?? []}
        loading={isLoading}
        rowKey={(cycle) => cycle.period}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{ emptyText: t("fx.empty") }}
      />

      <div className="border-t border-surface-alt p-4">
        {data !== null && data.foreign.cycles.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            <Text className="text-sm">
              {t("fx.total", {
                foreign: money(data.foreign.totalAmountMinor, "USD"),
                converted: money(data.foreign.convertedArsMinor, "ARS"),
              })}
            </Text>
            <Text type="secondary" className="text-xs">
              {t("fx.typical", {
                amount: money(data.foreign.typicalConvertedArsMinor, "ARS"),
              })}
            </Text>
            {data.foreign.unconvertedCycles > 0 && (
              <Text type="warning" className="text-xs">
                {t("fx.unconverted", { count: data.foreign.unconvertedCycles })}
              </Text>
            )}
          </div>
        )}

        <Form
          form={form}
          layout="inline"
          onFinish={(values) => void save(values)}
          className="flex flex-wrap gap-2"
        >
          <Form.Item name="rate" label={t("fx.form.rate")} rules={[{ required: true }]}>
            <InputNumber min={1} step={50} className="w-32" />
          </Form.Item>
          <Form.Item name="asOf" label={t("fx.form.asOf")} rules={[{ required: true }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder={t("fx.form.note")} className="w-44" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              {t("fx.form.save")}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </SectionPanel>
  );
}
