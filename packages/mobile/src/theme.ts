import { Platform, StyleSheet } from "react-native";

// Native equivalents of the shared dark surface/content tokens in globals.css.
export const colors = {
  background: "hsl(240, 10%, 4%)",
  panel: "hsl(240, 6%, 10%)",
  elevated: "hsl(240, 4%, 16%)",
  border: "#262626",
  text: "hsl(0, 0%, 83%)",
  bright: "hsl(0, 0%, 100%)",
  muted: "hsl(240, 5%, 65%)",
  dim: "hsl(240, 5%, 34%)",
  accent: "hsl(268.56, 90%, 68%)",
  accentSurface: "hsla(268.56, 90%, 68%, 0.12)",
  plan: "hsl(210, 70%, 68%)",
  danger: "hsl(0, 91%, 71%)",
  dangerSurface: "hsla(0, 91%, 71%, 0.10)",
  warning: "hsl(38, 80%, 65%)",
  warningSurface: "hsla(38, 80%, 65%, 0.10)",
  success: "hsl(142, 76%, 46%)",
  user: "hsla(0, 0%, 100%, 0.06)",
  scrim: "hsla(240, 10%, 4%, 0.72)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const radii = { control: 14, card: 18, sheet: 24, pill: 999 };
export const typography = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.5 },
  header: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24 },
  secondary: { fontSize: 15, lineHeight: 22 },
  footnote: { fontSize: 13, lineHeight: 18 },
});
export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
export const layout = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  text: { ...typography.body, color: colors.text },
  muted: { ...typography.secondary, color: colors.muted },
  title: { ...typography.title, color: colors.bright },
  label: { ...typography.footnote, color: colors.muted, fontWeight: "600" },
  content: {
    padding: spacing.xl,
    gap: spacing.xxl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  group: { backgroundColor: colors.panel, borderRadius: radii.card, overflow: "hidden" },
});
