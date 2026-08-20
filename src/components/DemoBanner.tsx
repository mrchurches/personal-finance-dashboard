import { Alert } from "antd";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { IS_DEMO } from "../demo";

/**
 * Says, before anything else, that these numbers are made up.
 *
 * A finance dashboard full of plausible figures is exactly the kind of thing a reader
 * assumes is real, and every panel below is written to be believed. Saying it once at the
 * top, in the same place every time, costs a line and removes the ambiguity for good.
 */
export function DemoBanner(): ReactElement | null {
  const { t } = useTranslation();

  if (!IS_DEMO) {
    return null;
  }

  return (
    <Alert
      banner
      type="info"
      showIcon
      message={t("demo.title")}
      description={t("demo.body")}
    />
  );
}
