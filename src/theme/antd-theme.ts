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
      headerSplitColor: palette.border,
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
