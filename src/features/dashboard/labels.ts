import type { TFunction } from "i18next";
import type {
  FundingMethod,
  ReconciliationState,
  RecordKind,
  SourceKind,
} from "@shared/types";

/**
 * Domain enum values never reach the screen raw: every one of them has a key in
 * src/i18n/locales/*.json, so a new value fails to compile until it is translated.
 */
export function sourceKindLabel(t: TFunction, sourceKind: SourceKind | null): string {
  return sourceKind === null ? t("sourceKind.manual") : t(`sourceKind.${sourceKind}`);
}

export function recordKindLabel(t: TFunction, recordKind: RecordKind): string {
  return t(`recordKind.${recordKind}`);
}

export function reconciliationStateLabel(t: TFunction, state: ReconciliationState): string {
  return t(`reconciliationState.${state}`);
}

export function fundingMethodLabel(t: TFunction, method: FundingMethod | null): string {
  return method === null ? t("common.empty") : t(`fundingMethod.${method}`);
}

export function installmentLabel(
  t: TFunction,
  current: number | null,
  total: number | null,
): string {
  if (current === null || total === null) {
    return t("common.empty");
  }

  return `${current}/${total}`;
}

export function percentageLabel(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Seeded categories are translated by id; anything the owner creates keeps the
 * name they gave it.
 *
 * The key type is widened on purpose. Every other label here draws on a closed
 * union the compiler can check, but categories are an open set: a category added
 * at runtime has no key, and `defaultValue` is what i18next provides for exactly
 * that. The cast is confined to this call.
 */
export function categoryLabel(t: TFunction, categoryId: string, storedName: string): string {
  const translate = t as unknown as (key: string, options: { defaultValue: string }) => string;
  return translate(`category.${categoryId}`, { defaultValue: storedName });
}
