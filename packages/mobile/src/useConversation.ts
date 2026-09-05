import { useEffect, useState } from "react";
import type { MobileClient } from "./api";
import { applyChatEvent, createTranscriptState } from "./transcript";
import type { SettingsData } from "./settings";
import { linkedAbortController } from "./useConnection";

export function useConversation(client: MobileClient, workspaceId: string, signal: AbortSignal) {
  const [transcript, setTranscript] = useState(createTranscriptState);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState(() => client);
  useEffect(() => {
    const controller = linkedAbortController(signal);
    setTranscript(createTranscriptState());
    setSettings(null);
    setError(null);
    setOwner(() => client);
    if (signal.aborted) return;
    async function subscribe() {
      const [config, providers, agents] = await Promise.all([
        client.config.getConfig(undefined, { signal: controller.signal }),
        client.providers.getConfig(undefined, { signal: controller.signal }),
        client.agents.list({ workspaceId }, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setSettings({ config, providers, agents });
      const events = await client.workspace.onChat(
        { workspaceId, mode: { type: "full" } },
        { signal: controller.signal }
      );
      for await (const event of events) {
        if (controller.signal.aborted) return;
        setTranscript((current) => applyChatEvent(current, event));
      }
      if (!controller.signal.aborted)
        throw new Error(
          "Conversation disconnected. Retry to reload the full history before sending."
        );
    }
    subscribe().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the conversation. Retry to reconnect."
        );
    });
    return () => controller.abort();
  }, [client, workspaceId, signal]);
  // A replacement client must never inherit the old socket’s caught-up flag, even
  // for the render before the subscription effect runs. Draft state lives above this hook.
  return owner === client
    ? { transcript, settings, error }
    : { transcript: createTranscriptState(), settings: null, error: null };
}
