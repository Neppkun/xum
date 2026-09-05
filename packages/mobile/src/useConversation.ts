import { useEffect, useState } from "react";
import type { MobileClient } from "./api";
import { applyChatEvent, createTranscriptState } from "./transcript";
import type { SettingsData } from "./settings";

export function useConversation(client: MobileClient, workspaceId: string) {
  const [transcript, setTranscript] = useState(createTranscriptState);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setTranscript(createTranscriptState());
    setSettings(null);
    setError(null);
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
  }, [client, workspaceId, generation]);
  return { transcript, settings, error, retry: () => setGeneration((value) => value + 1) };
}
