import type { Locale } from "antd/es/locale";
import enUS from "antd/es/locale/en_US";
import esES from "antd/es/locale/es_ES";
import type { AppLanguage } from "./config";

/*
 * antd locale packs are imported from `antd/es/locale/*` on purpose: the CJS
 * build gains a `.default` wrapper in Vite production builds, which silently
 * leaves component copy in English.
 */
const antdLocales: Record<AppLanguage, Locale> = {
  es: esES,
  en: enUS,
};

export function antdLocaleFor(language: AppLanguage): Locale {
  return antdLocales[language];
}
