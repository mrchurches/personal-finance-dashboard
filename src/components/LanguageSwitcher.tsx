import { Segmented } from "antd";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, isAppLanguage } from "../i18n/config";

export function LanguageSwitcher(): ReactElement {
  const { i18n, t } = useTranslation();
  const language = isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;

  return (
    <Segmented
      aria-label={t("language.label")}
      value={language}
      size="small"
      options={SUPPORTED_LANGUAGES.map((supported) => ({
        label: t(`language.${supported}`),
        value: supported,
      }))}
      onChange={(next) => {
        if (isAppLanguage(next)) {
          void i18n.changeLanguage(next);
        }
      }}
    />
  );
}
