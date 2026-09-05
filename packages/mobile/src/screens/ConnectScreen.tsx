import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowRight, ShieldCheck } from "lucide-react-native";
import { connect } from "../connection";
import { isInsecureEndpoint } from "../endpoint";
import { loadCredentials, saveCredentials } from "../credentials";
import { Button, Field, Loading, Notice } from "../components/Controls";
import { colors, layout } from "../theme";

export type Connection = Awaited<ReturnType<typeof connect>>;

export function ConnectScreen(props: { onConnect: (connection: Connection) => void }) {
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  let insecure = false;
  try {
    insecure = isInsecureEndpoint(endpoint.trim());
  } catch {
    /* A partially entered URL is validated on connect, not while typing. */
  }

  useEffect(() => {
    let active = true;
    loadCredentials()
      .then((saved) => {
        if (!active) return;
        if (saved) {
          setEndpoint(saved.endpoint);
          setToken(saved.token);
        }
      })
      .catch(() => {
        if (active)
          setError("Saved connection could not be read. Enter your server details again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      request.current?.abort();
    };
  }, []);

  async function submit() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    let connection: Connection | undefined;
    try {
      connection = await connect(endpoint.trim(), token.trim(), { signal: controller.signal });
      if (controller.signal.aborted) {
        connection.close();
        return;
      }
      await saveCredentials({ endpoint: endpoint.trim(), token: token.trim() });
      if (controller.signal.aborted) {
        connection.close();
        return;
      }
      request.current = null;
      props.onConnect(connection);
    } catch (cause) {
      connection?.close();
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not connect. Check the server URL and token."
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={layout.fill}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          <Text style={styles.wordmark}>
            xum<Text style={{ color: colors.accent }}>.</Text>
          </Text>
          <View style={{ gap: 10 }}>
            <Text style={styles.title}>{"Your agents.\nWithin reach."}</Text>
            <Text style={layout.muted}>
              Connect to your Xum server to pick up a conversation, review changes, or start
              something new.
            </Text>
          </View>
          {loading ? (
            <Loading label="Reading saved connection…" />
          ) : (
            <>
              <Field
                label="SERVER URL"
                placeholder="https://xum.example.com"
                value={endpoint}
                onChangeText={setEndpoint}
                keyboardType="url"
                editable={!busy}
                autoComplete="url"
              />
              <Field
                label="BEARER TOKEN"
                placeholder="Server authentication token"
                value={token}
                onChangeText={setToken}
                secureTextEntry
                editable={!busy}
                autoComplete="off"
                onSubmitEditing={() => {
                  if (endpoint.trim() && token.trim()) return submit();
                }}
              />
              {insecure && (
                <Notice>
                  This HTTP connection is not encrypted. Your bearer token and conversations can be
                  read by others on the network. Continue only on a trusted local network.
                </Notice>
              )}
              {error && <Notice>{error}</Notice>}
              <Button
                icon={ArrowRight}
                busy={busy}
                disabled={!endpoint.trim() || !token.trim()}
                onPress={() => {
                  return submit();
                }}
              >
                {insecure ? "Connect without encryption" : "Connect to Xum"}
              </Button>
            </>
          )}
          <View style={[layout.row, { alignItems: "flex-start" }]}>
            <ShieldCheck color={colors.muted} size={18} />
            <Text style={[layout.muted, { flex: 1 }]}>
              {Platform.OS === "web"
                ? "Your token stays in this tab’s memory. It is never saved in browser storage."
                : "Your connection is saved in this device’s secure credential storage."}{" "}
              Use a trusted HTTPS server; unencrypted connections are only for local development.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 28 },
  form: { gap: 24, maxWidth: 420, width: "100%", alignSelf: "center" },
  wordmark: { fontSize: 38, fontWeight: "700", letterSpacing: -2, color: colors.bright },
  title: {
    color: colors.bright,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: -0.8,
  },
});
