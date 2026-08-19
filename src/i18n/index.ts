import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  isAppLanguage,
  type AppLanguage,
} from "./config";
import { applyDayjsLocale } from "./dayjs-locale";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const resources = {
  es: { translation: es },
  en: { translation: en },
} as const;

/*
 * Detection reads localStorage only. With nothing stored the app falls back to
 * DEFAULT_LANGUAGE, so Spanish is the default regardless of browser settings,
 * and only an explicit choice by the user persists.
 */
void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18next.resolvedLanguage) ? i18next.resolvedLanguage : DEFAULT_LANGUAGE;
}

applyDayjsLocale(currentLanguage());
i18next.on("languageChanged", () => {
  applyDayjsLocale(currentLanguage());
});

export default i18next;
