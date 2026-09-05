import { Platform, StyleSheet } from "react-native";

// Keep Xum's mode accents, with quieter surfaces so the conversation—not cards—owns attention.
export const colors = {
  background: "hsl(240, 3%, 11%)",
  panel: "hsl(240, 3%, 15%)",
  elevated: "hsl(240, 3%, 19%)",
  border: "hsl(240, 3%, 23%)",
  text: "hsl(0, 0%, 90%)",
  bright: "hsl(0, 0%, 97%)",
  muted: "hsl(240, 3%, 64%)",
  dim: "hsl(240, 3%, 45%)",
  accent: "hsl(268.56, 90%, 68%)",
  accentSurface: "hsla(268.56, 90%, 68%, 0.12)",
  plan: "hsl(210, 70%, 68%)",
  danger: "hsl(0, 91%, 71%)",
  dangerSurface: "hsla(0, 91%, 71%, 0.10)",
  warning: "hsl(38, 80%, 65%)",
  warningSurface: "hsla(38, 80%, 65%, 0.10)",
  success: "hsl(142, 76%, 46%)",
  user: "hsla(0, 0%, 100%, 0.06)",
  scrim: "hsla(240, 3%, 3%, 0.58)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const radii = { control: 12, card: 16, sheet: 24, pill: 999 };
// TextInput does not inherit Text typography on web; share the native system face explicitly.
export const fontFamily = Platform.OS === "android" ? "sans-serif" : "System";
export const typography = StyleSheet.create({
  title: { fontFamily, fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.5 },
  header: { fontFamily, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontFamily, fontSize: 16, lineHeight: 25 },
  secondary: { fontFamily, fontSize: 15, lineHeight: 22 },
  footnote: { fontFamily, fontSize: 13, lineHeight: 18 },
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
    gap: spacing.xl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  group: { backgroundColor: colors.panel, borderRadius: radii.card, overflow: "hidden" },
});
