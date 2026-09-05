import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import type { MobileClient } from "../api";
import { Header, IconButton, Loading, Notice } from "../components/Controls";
import { colors, layout, mono } from "../theme";
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
  return (
    <View style={layout.fill}>
      <Header
        title="Changes"
        subtitle="Tracked changes · working tree vs HEAD"
        onBack={props.onBack}
        trailing={<IconButton label="Refresh changes" icon={RefreshCw} onPress={retry} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={layout.muted}>
          Read-only. Includes staged and unstaged tracked files; untracked files and changes already
          committed are not included.
        </Text>
        {error && <Notice onRetry={props.onReconnect}>{error}</Notice>}
        {output === null && !error && <Loading label="Reading changes…" />}
        {note && <Notice>{note}</Notice>}
        {output === "" && <Text style={layout.text}>No tracked changes against HEAD.</Text>}
        {output && (
          <ScrollView horizontal>
            <View>
              {output.split("\n").map((line, index) => (
                <Text
                  selectable
                  key={index}
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    lineHeight: 20,
                    color: line.startsWith("+")
                      ? colors.success
                      : line.startsWith("-")
                        ? colors.danger
                        : line.startsWith("@@")
                          ? colors.plan
                          : colors.text,
                  }}
                >
                  {line || " "}
                </Text>
              ))}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}
