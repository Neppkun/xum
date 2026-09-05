import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import { Button, Field, Sheet } from "../components/Controls";
import { modelChoices, resolveSettings, thinkingLevels } from "../settings";
import type { ChatSettings, SettingsData } from "../settings";
import { colors, layout } from "../theme";

export function ModelSettings(props: {
  value: ChatSettings;
  data: SettingsData;
  workspace: FrontendWorkspaceMetadata;
  onSave: (value: ChatSettings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.value);
  const [query, setQuery] = useState("");
  const models = modelChoices(props.data, value.model).filter((model) =>
    model.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <Sheet title="Conversation settings" onClose={props.onClose}>
      <Text style={layout.muted}>
        Used for your next message. Providers and runtime configuration are managed on your Xum
        server.
      </Text>
      <Text style={layout.label}>AGENT</Text>
      <View style={{ gap: 6 }}>
        {props.data.agents
          .filter((agent) => agent.uiSelectable)
          .map((agent) => (
            <Choice
              key={agent.id}
              title={agent.name}
              description={agent.description}
              selected={agent.id === value.agentId}
              onPress={() => setValue(resolveSettings(props.workspace, props.data, agent.id))}
            />
          ))}
      </View>
      <Text style={layout.label}>MODEL</Text>
      <Field
        label="Search server models"
        value={query}
        onChangeText={setQuery}
        placeholder="Filter models…"
      />
      {models.map((model) => (
        <Choice
          key={model}
          title={model}
          selected={model === value.model}
          onPress={() => setValue({ ...value, model })}
        />
      ))}
      <Field
        label="Model ID"
        value={value.model}
        onChangeText={(model) => setValue({ ...value, model })}
        placeholder="provider:model"
      />
      <Text style={layout.muted}>
        Enter a provider:model ID if it is not listed. Availability and reasoning support are
        validated by the server.
      </Text>
      <Text style={layout.label}>THINKING</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Choice
          title="Default"
          selected={value.thinkingLevel == null}
          onPress={() => setValue({ ...value, thinkingLevel: undefined })}
        />
        {thinkingLevels.map((level) => (
          <Choice
            key={level}
            title={level}
            selected={value.thinkingLevel === level}
            onPress={() => setValue({ ...value, thinkingLevel: level })}
          />
        ))}
      </View>
      <Button
        disabled={
          !/^\S+:\S+$/.test(value.model.trim()) ||
          !props.data.agents.some((agent) => agent.id === value.agentId && agent.uiSelectable)
        }
        onPress={() => props.onSave({ ...value, model: value.model.trim() })}
      >
        Use settings
      </Button>
    </Sheet>
  );
}

function Choice(props: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        minHeight: 44,
        borderWidth: 1,
        borderColor: props.selected ? colors.accent : colors.border,
        borderRadius: 8,
        backgroundColor: colors.panel,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={[layout.text, { color: props.selected ? colors.bright : colors.text }]}>
          {props.title}
        </Text>
        {props.description && <Text style={layout.muted}>{props.description}</Text>}
      </View>
      {props.selected && <Check color={colors.accent} size={16} />}
    </Pressable>
  );
}
