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
  plan: "hsl(210, 70%, 68%)",
  danger: "hsl(0, 91%, 71%)",
  success: "hsl(142, 76%, 46%)",
  user: "hsla(0, 0%, 100%, 0.06)",
};

export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
export const layout = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  title: { color: colors.bright, fontSize: 20, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  content: { padding: 20, gap: 20, width: "100%", maxWidth: 760, alignSelf: "center" },
  divider: { height: 1, backgroundColor: colors.border },
});
