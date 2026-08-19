import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Switch, Typography } from "antd";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { createPlanNote, deletePlanNote, fetchPlanNotes, updatePlanNote } from "@/api";
import { SectionPanel } from "@/components/SectionPanel";
import type { PlanNote } from "@shared/types";

const { Paragraph, Text, Title } = Typography;

interface NoteFormValues {
  title: string;
  body: string;
  pinned: boolean;
}

/**
 * The written half of the plan, kept next to the numeric half.
 *
 * Nothing here changes a projection, which is the point: the repository is public
 * and the personal record therefore cannot be versioned, so without somewhere
 * local to write it down the reasoning survives only in whoever remembers it.
 * Every figure elsewhere in this dashboard was derived from something, and this is
 * where the something goes.
 */
export function PlanNotesPanel(): ReactElement {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlanNote | "new" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form] = Form.useForm<NoteFormValues>();

  const load = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
    try {
      const response = await fetchPlanNotes();
      if (isActive()) {
        setNotes(response.notes);
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

  function open(note: PlanNote | "new"): void {
    setEditing(note);
    form.setFieldsValue(
      note === "new"
        ? { title: "", body: "", pinned: false }
        : { title: note.title, body: note.body, pinned: note.pinned },
    );
  }

  async function save(values: NoteFormValues): Promise<void> {
    if (editing === null) {
      return;
    }

    setIsSaving(true);
    try {
      if (editing === "new") {
        await createPlanNote(values);
      } else {
        await updatePlanNote(editing.id, values);
      }
      setEditing(null);
      await load();
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : t("notes.failed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(note: PlanNote): Promise<void> {
    try {
      await deletePlanNote(note.id);
      await load();
    } catch (deleteError) {
      message.error(deleteError instanceof Error ? deleteError.message : t("notes.failed"));
    }
  }

  return (
    <SectionPanel
      label={t("notes.sectionLabel")}
      title={t("notes.title")}
      meta={
        <Button size="small" type="primary" onClick={() => open("new")}>
          {t("notes.add")}
        </Button>
      }
    >
      {error.length > 0 && <Alert type="error" showIcon message={error} className="mb-4" />}

      <Paragraph type="secondary" className="text-xs">
        {t("notes.hint")}
      </Paragraph>

      {!isLoading && notes.length === 0 && (
        <Empty description={t("notes.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <div key={note.id} className="rounded-md border border-surface-alt px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Title level={3} className="mb-0! text-base!">
                {note.pinned && <Text className="mr-1">*</Text>}
                {note.title}
              </Title>
              <div className="flex gap-1">
                <Button size="small" type="link" onClick={() => open(note)}>
                  {t("notes.edit")}
                </Button>
                <Popconfirm
                  title={t("notes.confirmDelete")}
                  onConfirm={() => {
                    void remove(note);
                  }}
                >
                  <Button size="small" type="link" danger>
                    {t("notes.delete")}
                  </Button>
                </Popconfirm>
              </div>
            </div>

            <Paragraph className="mt-2 mb-1! text-sm whitespace-pre-wrap">{note.body}</Paragraph>

            <Text type="secondary" className="text-xs">
              {t("notes.updated", {
                date: new Date(note.updatedAt).toLocaleDateString(i18n.language),
              })}
            </Text>
          </div>
        ))}
      </div>

      <Modal
        open={editing !== null}
        title={t("notes.title")}
        okText={t("notes.save")}
        cancelText={t("common.cancel")}
        confirmLoading={isSaving}
        onOk={() => {
          void form.submit();
        }}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <Form.Item name="title" label={t("notes.titleField")} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label={t("notes.bodyField")}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Form.Item name="pinned" label={t("notes.pinned")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </SectionPanel>
  );
}
