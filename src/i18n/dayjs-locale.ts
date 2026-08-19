import dayjs from "dayjs";
import "dayjs/locale/es";
import type { AppLanguage } from "./config";

const dayjsLocales: Record<AppLanguage, string> = {
  es: "es",
  en: "en",
};

/** Keeps DatePicker month names and relative dates aligned with the UI language. */
export function applyDayjsLocale(language: AppLanguage): void {
  dayjs.locale(dayjsLocales[language]);
}
