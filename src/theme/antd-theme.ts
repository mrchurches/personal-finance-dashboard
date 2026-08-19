import type { ThemeConfig } from "antd";
import { palette } from "./palette";

/**
 * antd v6 theme built from `palette`.
 *
 * Seed tokens (`colorPrimary`, `colorBgBase`, `colorTextBase`) let antd derive
 * its own ramps; the alias tokens below pin the values the palette states
 * explicitly so nothing falls back to an antd default.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: palette.primary,
    colorInfo: palette.accentVintageBlue,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.error,

    colorTextBase: palette.text,
    colorBgBase: palette.surface,

    colorText: palette.text,
    colorTextHeading: palette.text,
    colorTextLabel: palette.text,
    colorTextSecondary: palette.textMuted,
    colorTextTertiary: palette.textMuted,
    colorTextQuaternary: palette.primaryLight,
    colorTextDescription: palette.textMuted,
    colorTextPlaceholder: palette.textMuted,

    colorBgLayout: palette.background,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surface,
    colorBgSpotlight: palette.primaryDark,

    colorBorder: palette.border,
    colorBorderSecondary: palette.surfaceAlt,
    colorSplit: palette.surfaceAlt,

    colorFill: palette.surfaceAlt,
    colorFillSecondary: palette.surfaceAlt,
    colorFillTertiary: palette.surfaceAlt,
    colorFillQuaternary: palette.background,
    colorFillAlter: palette.surfaceAlt,

    colorLink: palette.primary,
    colorLinkHover: palette.primaryDark,
    colorLinkActive: palette.primaryDark,

    borderRadius: 10,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: palette.background,
      headerBg: palette.surface,
      footerBg: palette.background,
      siderBg: palette.surface,
    },
    Table: {
      headerBg: palette.surfaceAlt,
      headerColor: palette.text,
      /*
       * No vertical rule between header cells. antd draws one as a short
       * pseudo-element that does not reach either edge of the cell, so against a
       * filled header it reads as a stray mark rather than as structure - and the
       * columns are already separated by their own alignment.
       */
      headerSplitColor: "transparent",
      /*
       * A sorted or hovered header keeps the same fill. antd tints those states,
       * which on a filled header shows up as one column being a different colour
       * from its neighbours for no reason the reader can see.
       */
      headerSortActiveBg: palette.surfaceAlt,
      headerSortHoverBg: palette.surfaceAlt,
      headerFilterHoverBg: palette.surfaceAlt,
      fixedHeaderSortActiveBg: palette.surfaceAlt,
      bodySortBg: "transparent",
      rowHoverBg: palette.background,
      borderColor: palette.surfaceAlt,
      footerBg: palette.surfaceAlt,
    },
    Card: {
      colorBgContainer: palette.surface,
      colorBorderSecondary: palette.border,
    },
    Statistic: {
      colorTextDescription: palette.textMuted,
      colorTextHeading: palette.text,
    },
    Tag: {
      defaultBg: palette.surfaceAlt,
      defaultColor: palette.text,
    },
    Segmented: {
      itemSelectedBg: palette.surface,
      trackBg: palette.surfaceAlt,
      itemColor: palette.textMuted,
      itemSelectedColor: palette.primary,
    },
    Progress: {
      defaultColor: palette.primary,
      remainingColor: palette.surfaceAlt,
    },
    Input: {
      colorBgContainer: palette.surface,
      activeBorderColor: palette.primary,
      hoverBorderColor: palette.primaryLight,
    },
    Select: {
      colorBgContainer: palette.surface,
      optionSelectedBg: palette.surfaceAlt,
    },
    DatePicker: {
      colorBgContainer: palette.surface,
      activeBorderColor: palette.primary,
      hoverBorderColor: palette.primaryLight,
    },
    Alert: {
      colorErrorBg: palette.surfaceAlt,
      colorErrorBorder: palette.error,
      colorWarningBg: palette.surfaceAlt,
      colorWarningBorder: palette.warning,
    },
  },
};
