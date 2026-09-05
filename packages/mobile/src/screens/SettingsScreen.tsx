import { Platform, ScrollView, Text, View } from "react-native";
import { LogOut, Monitor, ShieldCheck } from "lucide-react-native";
import { Button, Header, Notice } from "../components/Controls";
import { colors, layout } from "../theme";

export function SettingsScreen(props: {
  endpoint: string;
  onDisconnect: () => void;
  onBack: () => void;
  error: string | null;
  busy: boolean;
}) {
  return (
    <View style={layout.fill}>
      <Header title="Settings" onBack={props.onBack} />
      <ScrollView contentContainerStyle={layout.content}>
        <Text style={layout.label}>CONNECTION</Text>
        <View style={{ gap: 10, padding: 16, borderRadius: 10, backgroundColor: colors.panel }}>
          <View style={layout.row}>
            <ShieldCheck color={colors.accent} size={18} />
            <Text style={layout.text}>Your Xum server</Text>
          </View>
          <Text selectable style={layout.muted}>
            {props.endpoint}
          </Text>
          <Text style={layout.muted}>
            {Platform.OS === "web"
              ? "Authentication is held in memory for this tab only."
              : "Authentication is kept in this device’s secure credential storage."}
          </Text>
        </View>
        <Text style={layout.label}>ON THIS DEVICE</Text>
        <View style={{ gap: 12 }}>
          <View style={layout.row}>
            <Monitor color={colors.muted} size={18} />
            <Text style={layout.text}>A companion to your workspace</Text>
          </View>
          <Text style={layout.muted}>
            Agents, files, and commands run on your connected Xum server, not on this device. You
            can chat, interrupt an agent, create a worktree or scratch chat, and read tracked
            changes here.
          </Text>
          <Text style={layout.muted}>
            Use Xum desktop for provider credentials, runtime provisioning, terminals, desktop
            control, file editing, and project administration. Image and file attachments are
            currently displayed as filenames only.
          </Text>
        </View>
        {props.error && <Notice>{props.error}</Notice>}
        <Button secondary icon={LogOut} busy={props.busy} onPress={props.onDisconnect}>
          Disconnect & forget credentials
        </Button>
        <Text style={layout.muted}>Disconnecting does not stop agents running on the server.</Text>
      </ScrollView>
    </View>
  );
}
