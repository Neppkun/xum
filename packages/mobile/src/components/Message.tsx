import { useState } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Brain, ChevronDown, ChevronRight, File, Wrench } from "lucide-react-native";
import type { MuxMessage, MuxToolPart } from "../../../../src/common/types/message";
import { Button, Field, Notice } from "./Controls";
import { Markdown } from "./Markdown";
import { colors, layout, mono } from "../theme";

export function Message(props: {
  message: MuxMessage;
  canAnswer: boolean;
  onAnswer: (toolCallId: string, answers: Record<string, string>) => Promise<void>;
}) {
  const user = props.message.role === "user";
  return (
    <View style={[styles.message, user && styles.user]}>
      <Text style={[layout.label, { color: user ? colors.muted : colors.accent }]}>
        {user ? "YOU" : props.message.role === "assistant" ? "XUM" : "SYSTEM"}
      </Text>
      {props.message.parts.map((part, index) => {
        switch (part.type) {
          case "text":
            return <Markdown key={index} text={part.text} />;
          case "reasoning":
            return (
              <Disclosure key={index} label="Reasoning" reasoning>
                <Markdown text={part.text || "Thinking…"} />
              </Disclosure>
            );
          case "dynamic-tool":
            return (
              <Tool
                key={part.toolCallId}
                part={part}
                canAnswer={props.canAnswer}
                onAnswer={props.onAnswer}
              />
            );
          case "file":
            return (
              <View key={index} style={layout.row}>
                <File size={16} color={colors.muted} />
                <Text style={layout.muted}>{part.filename ?? part.mediaType} · attachment</Text>
              </View>
            );
        }
      })}
    </View>
  );
}

function Disclosure(props: { label: string; reasoning?: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = props.reasoning ? Brain : Wrench;
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={styles.disclosureHeader}
      >
        <Icon size={16} color={props.reasoning ? colors.plan : colors.muted} />
        <Text numberOfLines={1} style={[layout.muted, { flex: 1 }]}>
          {props.label}
        </Text>
        {expanded ? (
          <ChevronDown size={16} color={colors.muted} />
        ) : (
          <ChevronRight size={16} color={colors.muted} />
        )}
      </Pressable>
      {expanded && <View style={{ padding: 12, gap: 12 }}>{props.children}</View>}
    </View>
  );
}

function printable(value: unknown): string {
  return (
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "No output")
  ).slice(0, 24000);
}

function Tool(props: {
  part: MuxToolPart;
  canAnswer: boolean;
  onAnswer: (toolCallId: string, answers: Record<string, string>) => Promise<void>;
}) {
  const questions =
    props.part.toolName === "ask_user_question" && props.part.state === "input-available"
      ? questionTexts(props.part.input)
      : [];
  return (
    <View style={{ gap: 8 }}>
      <Disclosure
        label={`${props.part.toolName} · ${props.part.state === "input-available" ? "pending" : props.part.state === "output-redacted" ? "output redacted" : "completed"}`}
      >
        <Text style={layout.label}>INPUT</Text>
        <Text selectable style={styles.output}>
          {printable(props.part.input)}
        </Text>
        {props.part.state === "output-available" && (
          <>
            <Text style={layout.label}>OUTPUT</Text>
            <Text selectable style={styles.output}>
              {printable(props.part.output)}
            </Text>
          </>
        )}
        <Text style={layout.muted}>
          Large tool details are limited to 24,000 characters on mobile.
        </Text>
      </Disclosure>
      {questions.length > 0 && (
        <QuestionForm
          questions={questions}
          disabled={!props.canAnswer}
          onSubmit={(answers) => props.onAnswer(props.part.toolCallId, answers)}
        />
      )}
    </View>
  );
}

function questionTexts(input: unknown): string[] {
  if (
    !input ||
    typeof input !== "object" ||
    !("questions" in input) ||
    !Array.isArray(input.questions)
  )
    return [];
  return input.questions.flatMap((question: unknown) =>
    question &&
    typeof question === "object" &&
    "question" in question &&
    typeof question.question === "string"
      ? [question.question]
      : []
  );
}

function QuestionForm(props: {
  questions: string[];
  disabled: boolean;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (busy || submitted) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(answers);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send answers.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.question}>
      <Text style={layout.label}>YOUR INPUT IS NEEDED</Text>
      {props.questions.map((question) => (
        <Field
          key={question}
          label={question}
          value={answers[question] ?? ""}
          onChangeText={(answer) => setAnswers({ ...answers, [question]: answer })}
          placeholder="Your answer…"
          multiline
          editable={!props.disabled && !busy && !submitted}
        />
      ))}
      {error && <Notice>{error}</Notice>}
      <Button
        busy={busy}
        disabled={
          props.disabled ||
          submitted ||
          props.questions.some((question) => !answers[question]?.trim())
        }
        onPress={submit}
      >
        {submitted ? "Answers sent" : "Send answers"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: 12, paddingVertical: 20, paddingHorizontal: 4 },
  user: { backgroundColor: colors.user, borderRadius: 12, padding: 16, marginVertical: 8 },
  disclosure: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, overflow: "hidden" },
  disclosureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  output: { color: colors.text, fontFamily: mono, fontSize: 12, lineHeight: 19 },
  question: { gap: 14, borderRadius: 10, backgroundColor: colors.panel, padding: 16 },
});
