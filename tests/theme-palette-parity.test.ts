import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { palette, toTailwindVariableName, type PaletteKey } from "../src/theme/palette";

const globalStylesheet = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

function declaredColorVariables(stylesheet: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const pattern = /(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match = pattern.exec(stylesheet);

  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value.trim().toLowerCase());
    }
    match = pattern.exec(stylesheet);
  }

  return declarations;
}

/** Colours Tailwind needs that are not part of the brand palette. */
const NON_PALETTE_VARIABLES = new Set([
  "--color-transparent",
  "--color-current",
  "--color-inherit",
  "--color-white",
  "--color-black",
]);

describe("Tailwind @theme mirrors the palette", () => {
  const declared = declaredColorVariables(globalStylesheet);

  it("disables the default Tailwind colours so only palette colours are reachable", () => {
    expect(globalStylesheet).toContain("--color-*: initial;");
  });

  it.each(Object.keys(palette) as PaletteKey[])("exposes %s with the palette value", (key) => {
    const variableName = toTailwindVariableName(key);
    expect(declared.get(variableName)).toBe(palette[key].toLowerCase());
  });

  it("declares no colour outside the palette beyond the documented base colours", () => {
    const paletteVariables = new Set(
      (Object.keys(palette) as PaletteKey[]).map((key) => toTailwindVariableName(key)),
    );

    const unexpected = [...declared.keys()].filter(
      (name) => !paletteVariables.has(name) && !NON_PALETTE_VARIABLES.has(name),
    );

    expect(unexpected).toEqual([]);
  });
});
