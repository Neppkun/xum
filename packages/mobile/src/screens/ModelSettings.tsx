import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown, ChevronRight, Cpu } from "lucide-react-native";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import { formatModelDisplayName } from "../../../../src/common/utils/ai/modelDisplay";
import { Button, Field, Sheet } from "../components/Controls";
import { modelChoices, resolveSettings, thinkingLevels } from "../settings";
import type { ChatSettings, SettingsData } from "../settings";
import { colors, layout, radii, spacing, typography } from "../theme";

function modelName(id: string) {
  return formatModelDisplayName(
    id
      .slice(id.indexOf(":") + 1)
      .split("/")
      .at(-1) ?? id
  );
}

export function ModelSettings(props: {
  value: ChatSettings;
  data: SettingsData;
  workspace: FrontendWorkspaceMetadata;
  onSave: (value: ChatSettings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.value);
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [custom, setCustom] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const agents = props.data.agents.filter((agent) => agent.uiSelectable);
  const models = modelChoices(props.data, value.model).filter((model) =>
    `${model} ${modelName(model)}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const groups = new Map<string, string[]>();
  for (const model of models) {
    const provider = model.split(":")[0];
    const group = groups.get(provider) ?? [];
    group.push(model);
    groups.set(provider, group);
  }
  const validModel = /^\S+:\S+$/.test(value.model.trim());
  const currentAgent = agents.find((agent) => agent.id === value.agentId);
  return (
    <Sheet
      title={browsing ? "Choose model" : "Conversation settings"}
      onBack={browsing ? () => setBrowsing(false) : undefined}
      onClose={props.onClose}
      footer={
        !browsing && (
          <Button
            disabled={!validModel || !currentAgent}
            onPress={() => props.onSave({ ...value, model: value.model.trim() })}
          >
            Use settings
          </Button>
        )
      }
    >
      {!browsing && (
        <>
          <View style={styles.section}>
            <Text style={layout.label}>Agent</Text>
            <View style={styles.chips}>
              {agents.map((agent) => (
                <Option
                  key={agent.id}
                  label={agent.name}
                  selected={agent.id === value.agentId}
                  onPress={() => setValue(resolveSettings(props.workspace, props.data, agent.id))}
                />
              ))}
            </View>
            <Text style={styles.footnote}>
              {currentAgent?.description ?? "Choose an agent for your next message."}
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={layout.label}>Model</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose model"
              accessibilityState={{ expanded: browsing }}
              onPress={() => setBrowsing(!browsing)}
              style={[layout.group, styles.modelRow]}
            >
              <Cpu size={20} color={colors.accent} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[layout.text, { color: colors.bright }]}>
                  {value.model ? modelName(value.model) : "Choose a model"}
                </Text>
                <Text numberOfLines={1} style={styles.footnote}>
                  {value.model.split(":")[0]}
                </Text>
              </View>
              <ChevronDown size={18} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thinking effort"
              accessibilityState={{ expanded: showThinking }}
              onPress={() => setShowThinking(!showThinking)}
              style={[layout.group, styles.modelRow]}
            >
              <Text style={[layout.text, { flex: 1 }]}>Thinking</Text>
              <Text style={styles.footnote}>
                {value.thinkingLevel
                  ? value.thinkingLevel[0].toUpperCase() + value.thinkingLevel.slice(1)
                  : "Default"}
              </Text>
              {showThinking ? (
                <ChevronDown size={18} color={colors.muted} />
              ) : (
                <ChevronRight size={18} color={colors.muted} />
              )}
            </Pressable>
            {showThinking && (
              <View style={styles.chips}>
                <Option
                  label="Default"
                  selected={value.thinkingLevel == null}
                  onPress={() => setValue({ ...value, thinkingLevel: undefined })}
                />
                {thinkingLevels.map((level) => (
                  <Option
                    key={level}
                    label={level[0].toUpperCase() + level.slice(1)}
                    selected={value.thinkingLevel === level}
                    onPress={() => setValue({ ...value, thinkingLevel: level })}
                  />
                ))}
              </View>
            )}
            {showThinking && (
              <Text style={styles.footnote}>
                Applies to your next message. Model capabilities are checked by your server.
              </Text>
            )}
          </View>
        </>
      )}
      {browsing && (
        <View style={{ gap: spacing.lg }}>
          <Field
            label="Search models"
            placeholder="Model or provider"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {models.length === 0 ? (
            <Text style={layout.muted}>
              No models match your search. Try another name or enter a custom model ID below.
            </Text>
          ) : (
            <Text style={styles.footnote}>
              {models.length} {models.length === 1 ? "model" : "models"}
            </Text>
          )}
          {[...groups].map(([provider, choices]) => (
            <View key={provider} style={styles.section}>
              <Text style={layout.label}>
                {props.data.providers[provider]?.displayName ??
                  provider[0].toUpperCase() + provider.slice(1)}
              </Text>
              <View style={layout.group}>
                {choices.map((model, index) => (
                  <Pressable
                    key={model}
                    accessibilityRole="button"
                    accessibilityLabel={model}
                    accessibilityState={{ selected: model === value.model }}
                    onPress={() => {
                      setValue({ ...value, model });
                      setBrowsing(false);
                      setCustom(false);
                    }}
                    style={[styles.modelRow, index > 0 && styles.separator]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={layout.text}>{modelName(model)}</Text>
                      <Text numberOfLines={1} style={styles.footnote}>
                        {model.slice(model.indexOf(":") + 1)}
                      </Text>
                    </View>
                    {model === value.model && <Check size={20} color={colors.accent} />}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: custom }}
          onPress={() => {
            setBrowsing(false);
            setCustom(!custom);
          }}
          style={styles.disclosure}
        >
          <Text style={[typography.secondary, { color: colors.muted, flex: 1 }]}>
            Use a custom model ID
          </Text>
          {custom ? (
            <ChevronDown size={18} color={colors.muted} />
          ) : (
            <ChevronRight size={18} color={colors.muted} />
          )}
        </Pressable>
        {custom && (
          <>
            <Field
              label="Model ID"
              value={value.model}
              onChangeText={(model) => setValue({ ...value, model })}
              placeholder="provider:model"
              returnKeyType="done"
            />
            <Text style={[styles.footnote, !validModel && { color: colors.warning }]}>
              {validModel
                ? "Use a model supported by a configured server provider."
                : "Enter a model in provider:model format."}
            </Text>
          </>
        )}
      </View>
    </Sheet>
  );
}

function Option(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.option, props.selected && { backgroundColor: colors.accentSurface }]}
    >
      {props.selected && <Check size={14} color={colors.accent} />}
      <Text
        style={[typography.secondary, { color: props.selected ? colors.accent : colors.muted }]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.panel,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  modelRow: {
    minHeight: 56,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footnote: { ...typography.footnote, color: colors.muted },
  disclosure: { minHeight: 44, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
});
