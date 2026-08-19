import { Alert, App, Button, Popconfirm, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { deleteCommitment, fetchCommitments } from "@/api";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SectionPanel } from "@/components/SectionPanel";
import type { Category, Commitment, CommitmentLine, ResolvedCommitments } from "@shared/types";
import { DeclareCommitmentModal } from "./DeclareCommitmentModal";

const { Paragraph, Text } = Typography;

interface CommitmentsPanelProps {
  month: string;
  categories: Category[];
  /** Lets the projection panels pick up a commitment the moment it is declared. */
  onChanged: () => void;
}

/** A commitment plus what it did to the cycle on screen. */
interface CommitmentRow extends Commitment {
  line: CommitmentLine | undefined;
}

/**
 * What the owner has stated, and what each statement is worth per cycle.
 *
 * Charged and replaced are shown as separate columns rather than as one net
 * figure. The net alone is the number that decides the payoff, but it hides which
 * half is doing the work: an envelope that replaces card spending and one that
 * merely adds to it can produce the same net by coincidence, and only the columns
 * show that the first is a plan and the second is a leak.
 */
export function CommitmentsPanel({ month, categories, onChanged }: CommitmentsPanelProps): ReactElement {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [resolved, setResolved] = useState<ResolvedCommitments | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDeclaring, setIsDeclaring] = useState(false);

  const load = useCallback(
    async (isActive: () => boolean = () => true): Promise<void> => {
      try {
        const response = await fetchCommitments(month);
        if (isActive()) {
          setCommitments(response.commitments);
          setResolved(response.resolved);
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
    },
    [month],
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void load(() => active);

    return () => {
      active = false;
    };
  }, [load]);

  async function remove(commitment: Commitment): Promise<void> {
    try {
      await deleteCommitment(commitment.id);
      await load();
      onChanged();
    } catch (deleteError) {
      message.error(deleteError instanceof Error ? deleteError.message : t("commitments.failed"));
    }
  }

  const rows: CommitmentRow[] = commitments.map((commitment) => ({
    ...commitment,
    line: resolved?.lines.find((line) => line.id === commitment.id),
  }));

  const columns: ColumnsType<CommitmentRow> = [
    {
      title: t("commitments.columns.label"),
      dataIndex: "label",
      width: 240,
      render: (label: string, row) => (
        <div className="flex flex-col">
          <Text className="text-sm">{label}</Text>
          {row.note !== null && (
            <Text type="secondary" className="text-xs whitespace-normal">
              {row.note}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("commitments.columns.effect"),
      dataIndex: "effect",
      width: 190,
      render: (_effect, row) => (
        <div className="flex flex-col gap-1">
          <Tag>{t(`commitments.effect.${row.effect}`)}</Tag>
          {row.line !== undefined && row.line.skippedReason !== null && (
            <Text type="secondary" className="text-xs">
              {t(`commitments.skipped.${row.line.skippedReason}`)}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("commitments.columns.charged"),
      key: "charged",
      align: "right",
      width: 140,
      render: (_value, row) =>
        row.line === undefined || !row.line.applies ? (
          <Text type="secondary">{t("common.empty")}</Text>
        ) : (
          <MoneyAmount amountMinor={-row.line.chargedMinor} currency="ARS" direction="outflow" />
        ),
    },
    {
      title: t("commitments.columns.displaced"),
      key: "displaced",
      align: "right",
      width: 140,
      render: (_value, row) =>
        row.line === undefined || row.line.displacedMinor === 0 ? (
          <Text type="secondary">{t("common.empty")}</Text>
        ) : (
          <MoneyAmount amountMinor={row.line.displacedMinor} currency="ARS" direction="inflow" />
        ),
    },
    {
      title: t("commitments.columns.net"),
      key: "net",
      align: "right",
      width: 150,
      render: (_value, row) =>
        row.line === undefined || !row.line.applies ? (
          <Text type="secondary">{t("common.empty")}</Text>
        ) : (
          <Text strong>
            <MoneyAmount
              amountMinor={-row.line.netMinor}
              currency="ARS"
              direction={row.line.netMinor > 0 ? "outflow" : "inflow"}
            />
          </Text>
        ),
    },
    {
      title: t("commitments.columns.window"),
      key: "window",
      width: 150,
      render: (_value, row) => (
        <Text type="secondary" className="text-xs tabular-nums">
          {row.effectiveFrom} {"→"} {row.effectiveTo ?? "…"}
        </Text>
      ),
    },
    {
      title: t("commitments.columns.actions"),
      key: "actions",
      width: 100,
      render: (_value, row) => (
        <Popconfirm
          title={t("commitments.confirmDelete")}
          onConfirm={() => {
            void remove(row);
          }}
        >
          <Button size="small" type="link" danger>
            {t("commitments.delete")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <SectionPanel
      label={t("commitments.sectionLabel")}
      title={t("commitments.title")}
      bodyClassName="p-0!"
      meta={
        <Button size="small" type="primary" onClick={() => setIsDeclaring(true)}>
          {t("commitments.add")}
        </Button>
      }
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="m-4" />}

      <Paragraph type="secondary" className="mb-0! px-4 pt-4 text-xs">
        {t("commitments.hint")}
      </Paragraph>

      <Table<CommitmentRow>
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{ emptyText: t("commitments.empty") }}
      />

      {resolved !== null && rows.length > 0 && (
        <div className="border-t border-surface-alt p-4">
          <Text strong className="text-sm">
            {t("commitments.resolved.title", { period: resolved.period })}
          </Text>
          <div className="mt-2 flex flex-col gap-1">
            <Text type="secondary" className="text-xs">
              {t("commitments.resolved.charged")}
              {": "}
              <MoneyAmount amountMinor={-resolved.chargedMinor} currency="ARS" direction="outflow" />
            </Text>
            <Text type="secondary" className="text-xs">
              {t("commitments.resolved.displaced")}
              {": "}
              <MoneyAmount amountMinor={resolved.displacedMinor} currency="ARS" direction="inflow" />
            </Text>
            <Text className="text-xs">
              {t("commitments.resolved.net")}
              {": "}
              <MoneyAmount
                amountMinor={-resolved.netMinor}
                currency="ARS"
                direction={resolved.netMinor > 0 ? "outflow" : "inflow"}
              />
            </Text>
            <Text type="secondary" className="text-xs">
              {t("commitments.resolved.note")}
            </Text>
          </div>
        </div>
      )}

      <DeclareCommitmentModal
        open={isDeclaring}
        categories={categories}
        defaultPeriod={month}
        onClose={() => setIsDeclaring(false)}
        onDeclared={() => {
          void load();
          onChanged();
        }}
      />
    </SectionPanel>
  );
}
