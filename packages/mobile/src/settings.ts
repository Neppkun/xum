import type { MobileClient } from "./api";
import type { FrontendWorkspaceMetadata } from "../../../src/common/types/workspace";
import type { SendMessageOptions } from "../../../src/common/orpc/types";
import type { ThinkingLevel } from "../../../src/common/types/thinking";

export type SettingsData = {
  config: Awaited<ReturnType<MobileClient["config"]["getConfig"]>>;
  providers: Awaited<ReturnType<MobileClient["providers"]["getConfig"]>>;
  agents: Awaited<ReturnType<MobileClient["agents"]["list"]>>;
};
export type ChatSettings = Pick<
  SendMessageOptions,
  "model" | "agentId" | "thinkingLevel" | "reasoningMode"
>;
export const thinkingLevels: ThinkingLevel[] = ["off", "low", "medium", "high", "xhigh", "max"];

export function resolveSettings(
  workspace: FrontendWorkspaceMetadata,
  data: SettingsData,
  agentId: string
): ChatSettings {
  const workspaceDefaults =
    workspace.aiSettingsByAgent?.[agentId] ??
    (workspace.agentId === agentId ? workspace.aiSettings : undefined);
  const globalDefaults = data.config.agentAiDefaults[agentId];
  const agentDefaults = data.agents.find((agent) => agent.id === agentId)?.aiDefaults;
  return {
    agentId,
    model:
      workspaceDefaults?.model ??
      globalDefaults?.modelString ??
      agentDefaults?.model ??
      data.config.defaultModel ??
      "",
    thinkingLevel:
      workspaceDefaults?.thinkingLevel ??
      globalDefaults?.thinkingLevel ??
      agentDefaults?.thinkingLevel,
    reasoningMode: workspaceDefaults?.reasoningMode ?? globalDefaults?.reasoningMode,
  };
}

export function modelChoices(data: SettingsData, currentModel: string): string[] {
  const models = new Set<string>();
  if (currentModel) models.add(currentModel);
  if (data.config.defaultModel) models.add(data.config.defaultModel);
  for (const [provider, config] of Object.entries(data.providers)) {
    if (!config.isEnabled || !config.isConfigured) continue;
    for (const entry of [...(config.models ?? []), ...(config.discoveredModels ?? [])]) {
      const id = typeof entry === "string" ? entry : entry.id;
      models.add(`${provider}:${id}`);
    }
  }
  return [...models].filter(
    (model) => model === currentModel || !data.config.hiddenModels?.includes(model)
  );
}
