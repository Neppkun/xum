import { useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
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
  ChevronLeft,
  Square,
} from "lucide-react-native";
import type { MobileClient } from "../api";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import type { MuxMessage } from "../../../../src/common/types/message";
import { Button, IconButton, Loading, Notice } from "../components/Controls";
import { Message } from "../components/Message";
import { useConversation } from "../useConversation";
import { linkedAbortController } from "../useConnection";
import { resolveSettings } from "../settings";
import type { ChatSettings } from "../settings";
import { ModelSettings } from "./ModelSettings";
import { colors, layout, radii, spacing, typography } from "../theme";
import { formatModelDisplayName } from "../../../../src/common/utils/ai/modelDisplay";
import { DEFAULT_THINKING_LEVEL } from "../../../../src/common/types/thinking";

// RN Web reports scrollHeight, which cannot shrink a fixed-height textarea and
// can expand hidden stack screens. Let the browser size content; native uses its intrinsic measurement.
const webInputSizing = { fieldSizing: "content", height: "auto" } as const;

export function ConversationScreen(props: {
  client: MobileClient;
  workspace: FrontendWorkspaceMetadata;
  signal: AbortSignal;
  connected: boolean;
  onReconnect: () => Promise<void>;
  onBack: () => void;
  selection: ChatSettings | null;
  onSelectionChange: (value: ChatSettings) => void;
  draft: string;
  onDraftChange: (value: SetStateAction<string>) => void;
  onChanges: () => void;
}) {
  const { transcript, settings, error, loadOlder, loadingOlder, historyError } = useConversation(
    props.client,
    props.workspace.id,
    props.signal
  );
  const draft = props.draft;
  const setDraft = props.onDraftChange;
  const [inputHeight, setInputHeight] = useState(44);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [composerHeight, setComposerHeight] = useState(100);
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
    props.selection ?? (settings ? resolveSettings(props.workspace, settings, agentId) : null);
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
        {
          workspaceId: props.workspace.id,
          message,
          // Persist the effective default alongside the model, like the desktop composer.
          options: { ...options, thinkingLevel: options.thinkingLevel ?? DEFAULT_THINKING_LEVEL },
        },
        { signal }
      );
      if (signal.aborted) return;
      if (!result.success)
        throw new Error(
          typeof result.error === "string" ? result.error : JSON.stringify(result.error)
        );
      setDraft((current) => (current === message ? "" : current));
      setInputHeight(44);
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
        <IconButton
          label="Back to workspaces"
          icon={ChevronLeft}
          color={colors.accent}
          onPress={props.onBack}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {props.workspace.title ?? props.workspace.name}
          </Text>
          <Text style={[layout.muted, typography.footnote]} numberOfLines={1}>
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
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          transcript.hasOlderHistory ? (
            <View style={{ gap: 12 }}>
              {historyError && <Notice>{historyError}</Notice>}
              <Button
                busy={loadingOlder}
                disabled={!ready}
                onPress={() => {
                  setAtBottom(false);
                  return loadOlder();
                }}
              >
                Load older messages
              </Button>
            </View>
          ) : null
        }
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setAtBottom(contentSize.height - layoutMeasurement.height - contentOffset.y < 80);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atBottom) list.current?.scrollToEnd({ animated: false });
        }}
        renderItem={({ item }) => (
          <Message
            message={item}
            streaming={transcript.streamingMessageId === item.id && running}
            canAnswer={ready && running}
            onAnswer={answer}
          />
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
        <View style={[styles.latest, { bottom: composerHeight + 12 }]}>
          <IconButton
            icon={ArrowDown}
            label="Jump to latest message"
            onPress={() => list.current?.scrollToEnd({ animated: true })}
          />
        </View>
      )}
      <View
        style={styles.composerWrap}
        onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
      >
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
              !ready ? "Reconnecting…" : running ? "Write your next message…" : "Message Xum…"
            }
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!busy}
            onContentSizeChange={
              Platform.OS === "web"
                ? undefined
                : (event) =>
                    setInputHeight(
                      Math.max(44, Math.min(132, event.nativeEvent.contentSize.height))
                    )
            }
            style={[styles.input, Platform.OS === "web" ? webInputSizing : { height: inputHeight }]}
            selectionColor={colors.accent}
          />
          <View
            style={[
              styles.send,
              ready &&
                (running || Boolean(draft.trim())) && {
                  backgroundColor: options?.agentId === "plan" ? colors.plan : colors.accent,
                },
            ]}
          >
            <IconButton
              label={running ? "Interrupt agent" : "Send message"}
              icon={running ? Square : ArrowUp}
              color={ready && (running || Boolean(draft.trim())) ? colors.bright : colors.muted}
              disabled={!ready || busy || (!running && (!draft.trim() || !options?.model))}
              onPress={running ? interrupt : send}
            />
          </View>
        </View>
        <View style={styles.composerToolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose model, agent, and thinking"
            accessibilityState={{ disabled: !settings || !options }}
            disabled={!settings || !options}
            onPress={() => setShowSettings(true)}
            style={({ pressed }) => [styles.modelButton, pressed && { opacity: 0.6 }]}
          >
            <View
              style={[
                styles.modeDot,
                { backgroundColor: options?.agentId === "plan" ? colors.plan : colors.accent },
              ]}
            />
            <Text numberOfLines={1} style={styles.modelLabel}>
              {settings?.agents.find((agent) => agent.id === options?.agentId)?.name ?? "Agent"}
              <Text style={{ color: colors.muted, fontWeight: "400" }}>
                {" "}
                ·{" "}
                {options?.model
                  ? formatModelDisplayName(options.model.slice(options.model.indexOf(":") + 1))
                  : "Choose model"}
              </Text>
            </Text>
            <ChevronDown size={14} color={colors.muted} />
          </Pressable>
          {running && (
            <Text accessibilityLiveRegion="polite" style={styles.activity}>
              Working
            </Text>
          )}
        </View>
      </View>
      {showSettings && settings && options && (
        <ModelSettings
          value={options}
          data={settings}
          workspace={props.workspace}
          onClose={() => setShowSettings(false)}
          onSave={(value) => {
            props.onSelectionChange(value);
            setShowSettings(false);
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.bright, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  messages: {
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    paddingBottom: spacing.xl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: { color: colors.bright, fontSize: 22, fontWeight: "600", letterSpacing: -0.4 },
  composerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 8,
    backgroundColor: colors.background,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: radii.sheet,
    padding: 4,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.bright,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 44,
    maxHeight: 132,
    textAlignVertical: "top",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  composerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 2,
  },
  modelButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    paddingHorizontal: 6,
  },
  modeDot: { width: 6, height: 6, borderRadius: 3 },
  modelLabel: { color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1 },
  activity: { color: colors.muted, fontSize: 12, marginLeft: 8 },
  send: { borderRadius: 22, overflow: "hidden", backgroundColor: colors.elevated },
  latest: {
    position: "absolute",
    right: 20,
    backgroundColor: colors.elevated,
    borderRadius: radii.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
