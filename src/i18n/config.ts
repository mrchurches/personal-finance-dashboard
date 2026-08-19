export const SUPPORTED_LANGUAGES = ["es", "en"] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Spanish is the product default: the browser language is never sniffed. */
export const DEFAULT_LANGUAGE: AppLanguage = "es";

export const LANGUAGE_STORAGE_KEY = "personal-finance-dashboard.language";

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
