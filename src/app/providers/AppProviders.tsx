import { App as AntdApp, ConfigProvider } from "antd";
import { useEffect, type PropsWithChildren, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { antdLocaleFor } from "../../i18n/antd-locale";
import { DEFAULT_LANGUAGE, isAppLanguage } from "../../i18n/config";
import { antdTheme } from "../../theme/antd-theme";

/**
 * Single place where the palette and the active language reach antd.
 * Nothing below this provider should read a colour or a locale from anywhere else.
 */
export function AppProviders({ children }: PropsWithChildren): ReactElement {
  const { i18n, t } = useTranslation();
  const language = isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("app.documentTitle");
  }, [language, t]);

  return (
    <ConfigProvider theme={antdTheme} locale={antdLocaleFor(language)}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
