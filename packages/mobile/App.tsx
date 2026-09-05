import { useEffect, useState } from "react";
import { Modal, StatusBar, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Menu, Plus } from "lucide-react-native";
import { clearCredentials } from "./src/credentials";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import type { Connection } from "./src/screens/ConnectScreen";
import { Navigator } from "./src/screens/Navigator";
import { ConversationScreen } from "./src/screens/ConversationScreen";
import { CreateWorkspace } from "./src/screens/CreateWorkspace";
import { ChangesScreen } from "./src/screens/ChangesScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { Button, Header, IconButton, Loading, Notice } from "./src/components/Controls";
import { useProjects } from "./src/useProjects";
import { colors, layout } from "./src/theme";

export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  useEffect(() => () => connection?.close(), [connection]);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <SafeAreaView style={layout.fill}>
        {connection ? (
          <ConnectedApp connection={connection} onDisconnect={() => setConnection(null)} />
        ) : (
          <ConnectScreen onConnect={setConnection} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ConnectedApp(props: { connection: Connection; onDisconnect: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const data = useProjects(props.connection.client);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [create, setCreate] = useState(false);
  const [screen, setScreen] = useState<"chat" | "changes" | "settings">("chat");
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const selected = data.workspaces.find((workspace) => workspace.id === selectedId);
  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await clearCredentials();
      props.onDisconnect();
    } catch {
      setDisconnectError(
        "Could not clear secure credentials. Try again before leaving this device."
      );
      setDisconnecting(false);
    }
  }
  const navigation = (
    <Navigator
      {...data}
      selectedId={selected?.id}
      onRetry={data.retry}
      onSelect={(workspace) => {
        setSelectedId(workspace.id);
        setDrawer(false);
        setScreen("chat");
      }}
      onCreate={() => {
        setDrawer(false);
        setCreate(true);
      }}
      onSettings={() => {
        setDrawer(false);
        setScreen("settings");
      }}
      onClose={wide ? undefined : () => setDrawer(false)}
    />
  );
  return (
    <View style={[layout.fill, { flexDirection: "row" }]}>
      {wide && <View style={{ width: 292 }}>{navigation}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={[
            layout.fill,
            (screen === "settings" || (screen === "changes" && selected)) && { display: "none" },
          ]}
        >
          {selected ? (
            <ConversationScreen
              key={selected.id}
              client={props.connection.client}
              workspace={selected}
              onMenu={wide ? undefined : () => setDrawer(true)}
              onChanges={() => setScreen("changes")}
            />
          ) : (
            <>
              <Header
                title="Workspaces"
                trailing={
                  !wide && (
                    <IconButton
                      label="Open workspaces"
                      icon={Menu}
                      onPress={() => setDrawer(true)}
                    />
                  )
                }
              />
              <View style={[layout.content, { flex: 1, justifyContent: "center" }]}>
                {data.loading ? (
                  <Loading label="Loading your workspaces…" />
                ) : data.error ? (
                  <Notice onRetry={data.retry}>{data.error}</Notice>
                ) : (
                  <>
                    <Text style={layout.title}>Make space for your next idea.</Text>
                    <Text style={layout.muted}>
                      Select a workspace or start a new conversation. Everything stays on your Xum
                      server.
                    </Text>
                    <Button icon={Plus} onPress={() => setCreate(true)}>
                      New workspace
                    </Button>
                  </>
                )}
              </View>
            </>
          )}
        </View>
        {screen === "changes" && selected && (
          <ChangesScreen
            key={selected.id}
            client={props.connection.client}
            workspaceId={selected.id}
            onBack={() => setScreen("chat")}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen
            endpoint={props.connection.endpoint}
            onDisconnect={disconnect}
            onBack={() => setScreen("chat")}
            error={disconnectError}
            busy={disconnecting}
          />
        )}
      </View>
      {!wide && drawer && (
        <Modal animationType="slide" onRequestClose={() => setDrawer(false)}>
          <SafeAreaView style={layout.fill}>{navigation}</SafeAreaView>
        </Modal>
      )}
      {create && (
        <CreateWorkspace
          client={props.connection.client}
          projects={data.projects}
          onClose={() => setCreate(false)}
          onCreated={(workspace) => {
            setSelectedId(workspace.id);
            setScreen("chat");
            setCreate(false);
            data.retry();
          }}
        />
      )}
    </View>
  );
}
