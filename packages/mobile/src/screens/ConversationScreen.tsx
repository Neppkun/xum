import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GitCompareArrows,
  Menu,
  Square,
} from "lucide-react-native";
import type { MobileClient } from "../api";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import type { MuxMessage } from "../../../../src/common/types/message";
import { IconButton, Loading, Notice } from "../components/Controls";
import { Message } from "../components/Message";
import { useConversation } from "../useConversation";
import { linkedAbortController } from "../useConnection";
import { resolveSettings } from "../settings";
import type { ChatSettings } from "../settings";
import { ModelSettings } from "./ModelSettings";
import { colors, layout } from "../theme";

export function ConversationScreen(props: {
  client: MobileClient;
  workspace: FrontendWorkspaceMetadata;
  signal: AbortSignal;
  connected: boolean;
  onReconnect: () => Promise<void>;
  onMenu?: () => void;
  onChanges: () => void;
}) {
  const { transcript, settings, error } = useConversation(
    props.client,
    props.workspace.id,
    props.signal
  );
  const [overrides, setOverrides] = useState<ChatSettings | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const list = useRef<FlatList<MuxMessage>>(null);
  const controller = useRef(new AbortController());
  const pending = useRef(false);
  // This component is keyed by workspace ID: both subscription and in-flight actions
  // belong to one workspace, and a switch cannot expose the previous draft/history.
  useEffect(() => {
    const abort = linkedAbortController(props.signal);
    controller.current = abort;
    pending.current = false;
    setBusy(false);
    return () => abort.abort();
  }, [props.signal]);
  const agentId = props.workspace.agentId ?? "exec";
  const options =
    overrides ?? (settings ? resolveSettings(props.workspace, settings, agentId) : null);
  const ready =
    props.connected && !props.signal.aborted && transcript.caughtUp && !error && settings !== null;
  const running = ready && transcript.streaming;

  async function send() {
    if (!ready || !options?.model || !draft.trim() || pending.current || running) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    const message = draft;
    const signal = controller.current.signal;
    try {
      const result = await props.client.workspace.sendMessage(
        { workspaceId: props.workspace.id, message, options },
        { signal }
      );
      if (signal.aborted) return;
      if (!result.success)
        throw new Error(
          typeof result.error === "string" ? result.error : JSON.stringify(result.error)
        );
      setDraft((current) => (current === message ? "" : current));
      list.current?.scrollToEnd({ animated: true });
    } catch (cause) {
      if (!signal.aborted)
        setActionError(
          `${cause instanceof Error ? cause.message : "Message could not be sent."} If the connection was lost, reload history before retrying to avoid sending twice.`
        );
    } finally {
      if (controller.current.signal === signal) {
        pending.current = false;
        if (!signal.aborted) setBusy(false);
      }
    }
  }

  async function interrupt() {
    if (!ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    const signal = controller.current.signal;
    try {
      const result = await props.client.workspace.interruptStream(
        { workspaceId: props.workspace.id },
        { signal }
      );
      if (!result.success) throw new Error(result.error);
    } catch (cause) {
      if (!signal.aborted)
        setActionError(cause instanceof Error ? cause.message : "Could not interrupt the agent.");
    } finally {
      if (controller.current.signal === signal) {
        pending.current = false;
        if (!signal.aborted) setBusy(false);
      }
    }
  }

  async function answer(toolCallId: string, answers: Record<string, string>) {
    if (!ready) throw new Error("Reconnect before answering.");
    const result = await props.client.workspace.answerAskUserQuestion(
      { workspaceId: props.workspace.id, toolCallId, answers },
      { signal: controller.current.signal }
    );
    if (!result.success) throw new Error(result.error);
  }

  return (
    <KeyboardAvoidingView
      style={layout.fill}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        {props.onMenu && <IconButton label="Open workspaces" icon={Menu} onPress={props.onMenu} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {props.workspace.title ?? props.workspace.name}
          </Text>
          <Text style={layout.muted} numberOfLines={1}>
            {props.workspace.kind === "scratch" ? "Scratch chat" : props.workspace.name} ·{" "}
            {props.workspace.runtimeConfig.type}
          </Text>
        </View>
        <IconButton
          label="View changes"
          icon={GitCompareArrows}
          onPress={props.onChanges}
          disabled={props.workspace.kind === "scratch"}
        />
      </View>
      <FlatList
        ref={list}
        data={transcript.messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setAtBottom(contentSize.height - layoutMeasurement.height - contentOffset.y < 80);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atBottom) list.current?.scrollToEnd({ animated: false });
        }}
        renderItem={({ item }) => (
          <Message message={item} canAnswer={ready && running} onAnswer={answer} />
        )}
        ListEmptyComponent={
          !ready && !error ? (
            <Loading label="Syncing conversation…" />
          ) : error ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>What’s on your mind?</Text>
              <Text style={[layout.muted, { textAlign: "center" }]}>
                Ask a question, plan a change, or let an agent take it from here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {error && <Notice onRetry={props.onReconnect}>{error}</Notice>}
            {transcript.error && <Notice>{transcript.error}</Notice>}
            {running && (
              <Text style={[layout.muted, { color: colors.accent }]}>Agent is working…</Text>
            )}
          </View>
        }
      />
      {!atBottom && (
        <View style={styles.latest}>
          <IconButton
            icon={ArrowDown}
            label="Jump to latest message"
            onPress={() => list.current?.scrollToEnd({ animated: true })}
          />
        </View>
      )}
      <View style={styles.composerWrap}>
        {actionError && (
          <Notice
            onRetry={() => {
              setActionError(null);
              return props.onReconnect();
            }}
          >
            {actionError}
          </Notice>
        )}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Message"
            placeholder={
              !ready
                ? "Waiting for conversation sync…"
                : running
                  ? "Agent is working…"
                  : "Ask Xum anything…"
            }
            placeholderTextColor={colors.dim}
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={ready && !busy}
            style={styles.input}
            selectionColor={colors.accent}
          />
          <View style={[layout.row, { justifyContent: "space-between" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose model, agent, and thinking"
              disabled={!settings || !options}
              onPress={() => setShowSettings(true)}
              style={styles.modelButton}
            >
              <View style={{ flexShrink: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: options?.agentId === "plan" ? colors.plan : colors.accent,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {options?.agentId ?? "Agent"}
                  <Text style={{ color: colors.muted, fontWeight: "400" }}>
                    {" "}
                    · {options?.model.split(":").slice(1).join(":") || "Choose model"}
                  </Text>
                </Text>
              </View>
              <ChevronDown size={14} color={colors.muted} />
            </Pressable>
            <View style={[styles.send, !ready && { opacity: 0.4 }]}>
              <IconButton
                label={running ? "Interrupt agent" : "Send message"}
                icon={running ? Square : ArrowUp}
                color={colors.bright}
                disabled={!ready || busy || (!running && (!draft.trim() || !options?.model))}
                onPress={running ? interrupt : send}
              />
            </View>
          </View>
        </View>
        <Text style={styles.status}>
          {!ready
            ? "Syncing required before sending"
            : running
              ? "Running on your server"
              : options?.thinkingLevel
                ? `${options.thinkingLevel} thinking · Runs on your server`
                : "Runs on your server"}
        </Text>
      </View>
      {showSettings && settings && options && (
        <ModelSettings
          value={options}
          data={settings}
          workspace={props.workspace}
          onClose={() => setShowSettings(false)}
          onSave={(value) => {
            setOverrides(value);
            setShowSettings(false);
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.bright, fontSize: 15, fontWeight: "600" },
  messages: {
    padding: 18,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    flexGrow: 1,
  },
  empty: { flex: 1, paddingVertical: 60, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: colors.bright, fontSize: 24, fontWeight: "500", letterSpacing: -0.6 },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  composer: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  },
  input: {
    color: colors.bright,
    fontSize: 15,
    lineHeight: 23,
    minHeight: 64,
    maxHeight: 160,
    textAlignVertical: "top",
    padding: 4,
  },
  modelButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  send: { borderRadius: 9, backgroundColor: colors.elevated, marginLeft: 6 },
  status: { color: colors.dim, fontSize: 11, textAlign: "center", paddingBottom: 8 },
  latest: {
    position: "absolute",
    bottom: 190,
    right: 24,
    backgroundColor: colors.elevated,
    borderRadius: 24,
  },
});
