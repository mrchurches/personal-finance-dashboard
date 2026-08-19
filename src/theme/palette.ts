/**
 * Single source of truth for the project palette.
 *
 * Every colour consumed by the UI must come from here:
 *  - antd reads it through `antdTheme` (src/theme/antd-theme.ts).
 *  - Tailwind reads it through the `@theme` block in src/index.css.
 *
 * The `@theme` block is a mirror, not a second source. Key `primaryDark`
 * maps to the Tailwind variable `--color-primary-dark`, and
 * tests/theme-palette-parity.test.ts fails if the two ever drift apart.
 */
export const palette = {
  primary: "#4F6548",
  primaryDark: "#344536",
  primaryLight: "#A7B09A",
  background: "#F3EBDD",
  surface: "#FAF8F1",
  surfaceAlt: "#E7DDC8",
  text: "#292B27",
  textMuted: "#6F7068",
  border: "#D8CDB8",
  accentTerracotta: "#B86F4A",
  accentMustard: "#C5A653",
  accentVintageBlue: "#607887",
  success: "#5F7954",
  warning: "#C5A653",
  error: "#9B5142",
} as const;

export type PaletteKey = keyof typeof palette;

/** Chart and data-visualisation ramp, ordered for categorical series. */
export const dataSeriesColors = [
  palette.primary,
  palette.accentTerracotta,
  palette.accentVintageBlue,
  palette.accentMustard,
  palette.primaryLight,
  palette.primaryDark,
] as const;

/** camelCase palette key -> Tailwind `--color-*` variable name. */
export function toTailwindVariableName(key: PaletteKey): string {
  return `--color-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
