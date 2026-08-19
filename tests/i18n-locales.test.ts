import { describe, expect, it } from "vitest";
import {
  CATEGORY_KIND,
  FUNDING_METHOD,
  RECONCILIATION_STATE,
  RECORD_KIND,
  SOURCE_KIND,
  SOURCE_STATUS,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from "../shared/types";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../src/i18n/config";
import en from "../src/i18n/locales/en.json";
import es from "../src/i18n/locales/es.json";

type TranslationTree = { [key: string]: string | TranslationTree };

function flatten(tree: TranslationTree, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      flat.set(path, value);
      continue;
    }
    for (const [nestedKey, nestedValue] of flatten(value, path)) {
      flat.set(nestedKey, nestedValue);
    }
  }

  return flat;
}

function placeholders(value: string): string[] {
  return (value.match(/\{\{[^}]+\}\}/g) ?? []).sort();
}

const spanish = flatten(es as TranslationTree);
const english = flatten(en as TranslationTree);

const locales: Record<string, Map<string, string>> = { es: spanish, en: english };

describe("locale catalogue", () => {
  it("defaults to Spanish", () => {
    expect(DEFAULT_LANGUAGE).toBe("es");
  });

  it("ships a catalogue for every supported language", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(locales)).toContain(language);
    }
  });

  it("has the same keys in Spanish and English", () => {
    const missingInEnglish = [...spanish.keys()].filter((key) => !english.has(key));
    const missingInSpanish = [...english.keys()].filter((key) => !spanish.has(key));

    expect({ missingInEnglish, missingInSpanish }).toEqual({
      missingInEnglish: [],
      missingInSpanish: [],
    });
  });

  it("has no blank translation", () => {
    for (const [language, catalogue] of Object.entries(locales)) {
      const blank = [...catalogue.entries()]
        .filter(([, value]) => value.trim().length === 0)
        .map(([key]) => `${language}:${key}`);
      expect(blank).toEqual([]);
    }
  });

  it("uses the same interpolation placeholders across languages", () => {
    const mismatched = [...spanish.entries()]
      .filter(([key, value]) => {
        const counterpart = english.get(key);
        return counterpart !== undefined && placeholders(value).join() !== placeholders(counterpart).join();
      })
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });
});

describe("domain enums are translatable", () => {
  const enumGroups: Record<string, readonly string[]> = {
    transactionType: Object.values(TRANSACTION_TYPE),
    categoryKind: Object.values(CATEGORY_KIND),
    transactionSource: Object.values(TRANSACTION_SOURCE),
    sourceKind: Object.values(SOURCE_KIND),
    fundingMethod: Object.values(FUNDING_METHOD),
    recordKind: Object.values(RECORD_KIND),
    reconciliationState: Object.values(RECONCILIATION_STATE),
    sourceStatus: Object.values(SOURCE_STATUS),
  };

  it.each(Object.entries(enumGroups))("%s has a label for every value", (namespace, values) => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalogue = locales[language];
      const missing = values.filter((value) => catalogue?.has(`${namespace}.${value}`) !== true);
      expect({ language, namespace, missing }).toEqual({ language, namespace, missing: [] });
    }
  });
});
