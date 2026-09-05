import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, layout, mono } from "../theme";

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <Text key={index} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <Text key={index} style={{ fontWeight: "700" }}>
          {part.slice(2, -2)}
        </Text>
      );
    return part;
  });
}

// Render untrusted model/repository text only through native Text, never HTML.
export function Markdown(props: { text: string }) {
  const blocks = props.text.split(/```([^\n]*)\n([\s\S]*?)(?:```|$)/g);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, index) => {
        if (index % 3 === 1) return null;
        if (index % 3 === 2)
          return (
            <View key={index} style={styles.code}>
              <Text style={layout.label}>{blocks[index - 1] || "CODE"}</Text>
              <ScrollView horizontal>
                <Text selectable style={styles.codeText}>
                  {block.trimEnd()}
                </Text>
              </ScrollView>
            </View>
          );
        return block
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph, line) => {
            const heading = /^(#{1,6})\s+(.+)$/.exec(paragraph);
            return (
              <Text
                selectable
                key={`${index}-${line}`}
                style={[layout.text, heading && styles.heading]}
              >
                {inline(heading ? heading[2] : paragraph.replace(/^[-*] /gm, "• "))}
              </Text>
            );
          });
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineCode: { fontFamily: mono, backgroundColor: colors.elevated, color: colors.bright },
  code: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeText: { fontFamily: mono, fontSize: 12, lineHeight: 20, color: colors.text },
  heading: { fontSize: 19, lineHeight: 27, fontWeight: "600", color: colors.bright },
});
