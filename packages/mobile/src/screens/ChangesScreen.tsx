import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, FileCode, RefreshCw } from "lucide-react-native";
import type { MobileClient } from "../api";
import { Header, IconButton, Loading, Notice } from "../components/Controls";
import { colors, layout, mono, radii, spacing, typography } from "../theme";
import { linkedAbortController } from "../useConnection";

export function ChangesScreen(props: {
  client: MobileClient;
  workspaceId: string;
  signal: AbortSignal;
  onReconnect: () => Promise<void>;
  onBack: () => void;
}) {
  const [output, setOutput] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  function retry() {
    setGeneration((value) => value + 1);
  }
  useEffect(() => {
    const controller = linkedAbortController(props.signal);
    setOutput(null);
    setError(null);
    setNote(null);
    if (controller.signal.aborted) {
      setError("Reconnect to load changes.");
      return;
    }
    // Fixed argv prevents branch/file names from becoming shell code. Disable external
    // diff/textconv hooks: this view only reads tracked worktree changes against HEAD.
    props.client.workspace
      .executeBash(
        {
          workspaceId: props.workspaceId,
          script: "",
          command: "git",
          args: [
            "--no-pager",
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "HEAD",
            "--",
          ],
          options: { timeout_secs: 20, cwdMode: "repo-root" },
        },
        { signal: controller.signal }
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.success) throw new Error(result.error);
        if (!result.data.success) throw new Error(result.data.error);
        setOutput(result.data.output);
        setNote(
          result.data.truncated
            ? "The server truncated this diff. Review the full changes on desktop before making decisions."
            : (result.data.note ?? null)
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load changes.");
      });
    return () => controller.abort();
  }, [props.client, props.workspaceId, props.signal, generation]);
  const files = output?.split(/(?=^diff --git )/m).filter(Boolean) ?? [];
  return (
    <View style={layout.fill}>
      <Header
        title="Changes"
        subtitle="Working tree"
        onBack={props.onBack}
        trailing={<IconButton label="Refresh changes" icon={RefreshCw} onPress={retry} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {error && <Notice onRetry={props.onReconnect}>{error}</Notice>}
        {output === null && !error && <Loading label="Reading changes…" />}
        {note && <Notice>{note}</Notice>}
        {output === "" && (
          <View style={styles.empty}>
            <CheckCircle2 size={32} color={colors.success} />
            <Text style={layout.title}>No uncommitted changes</Text>
            <Text style={[layout.muted, { textAlign: "center" }]}>
              Tracked files match the latest commit.
            </Text>
          </View>
        )}
        {files.length > 0 && (
          <Text style={layout.muted}>
            {files.length} changed {files.length === 1 ? "file" : "files"}
          </Text>
        )}
        {files.map((file, index) => {
          const lines = file.trimEnd().split("\n");
          const filename =
            lines
              .find((line) => line.startsWith("+++ "))
              ?.slice(4)
              .replace(/^b\//, "") ?? lines[0].replace(/^diff --git /, "");
          const content = lines.filter((line) => !/^(diff --git |index |--- |\+\+\+ )/.test(line));
          const additions = content.filter((line) => line.startsWith("+")).length;
          const deletions = content.filter((line) => line.startsWith("-")).length;
          return (
            <View key={index} style={styles.file}>
              <View style={styles.fileHeader}>
                <FileCode size={17} color={colors.muted} />
                <Text numberOfLines={1} ellipsizeMode="middle" style={styles.filename}>
                  {filename}
                </Text>
                <Text style={[styles.count, { color: colors.success }]}>+{additions}</Text>
                <Text style={[styles.count, { color: colors.danger }]}>−{deletions}</Text>
              </View>
              <ScrollView horizontal contentContainerStyle={{ padding: 14 }}>
                <View>
                  {content.map((line, lineIndex) => (
                    <Text
                      selectable
                      key={lineIndex}
                      style={[
                        styles.code,
                        {
                          color: line.startsWith("+")
                            ? colors.success
                            : line.startsWith("-")
                              ? colors.danger
                              : line.startsWith("@@")
                                ? colors.plan
                                : colors.text,
                        },
                      ]}
                    >
                      {line || " "}
                    </Text>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        })}
        {output !== null && (
          <Text style={styles.footnote}>
            Staged and unstaged tracked files, compared with HEAD. Untracked files and committed
            changes aren’t shown.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: 16,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    flexGrow: 1,
  },
  empty: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 56 },
  file: {
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fileHeader: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filename: { flex: 1, minWidth: 0, color: colors.bright, fontSize: 15, fontWeight: "500" },
  count: { fontSize: 12, fontVariant: ["tabular-nums"] },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 21 },
  footnote: { ...typography.footnote, color: colors.muted },
});
