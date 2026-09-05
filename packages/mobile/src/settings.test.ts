import { describe, expect, test } from "bun:test";
import { KNOWN_MODELS } from "../../../src/common/constants/knownModels";
import { modelChoices, resolveSettings, type SettingsData } from "./settings";

function data(): SettingsData {
  return {
    config: { agentAiDefaults: {} },
    providers: {
      anthropic: { isConfigured: true, isEnabled: true, apiKeySet: true },
      openai: { isConfigured: true, isEnabled: false, apiKeySet: true },
      google: { isConfigured: false, isEnabled: true, apiKeySet: false },
    },
    agents: [],
  };
}

describe("mobile model settings", () => {
  test("exposes built-ins for configured providers even without a custom catalog", () => {
    const options = modelChoices(data(), "");
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((id) => id.startsWith("anthropic:"))).toBe(true);
  });
  test("honors hidden models while retaining the active choice and custom models", () => {
    const config = data();
    const hidden = KNOWN_MODELS.SONNET.id;
    config.config.hiddenModels = [hidden];
    config.providers.anthropic.models = ["custom-model"];
    expect(modelChoices(config, "")).not.toContain(hidden);
    const options = modelChoices(config, hidden);
    expect(options).toContain(hidden);
    expect(options.filter((id) => id === hidden)).toHaveLength(1);
    expect(options).toContain("anthropic:custom-model");
  });
  test("resolves agent-scoped workspace settings ahead of global preferences", () => {
    const config = data();
    config.config.defaultModel = "fallback:model";
    config.config.agentAiDefaults = { exec: { modelString: "global:exec", thinkingLevel: "low" } };
    expect(
      resolveSettings(
        { agentId: "plan", aiSettings: { model: "legacy:plan", thinkingLevel: "medium" } },
        config,
        "exec"
      ).model
    ).toBe("global:exec");
    expect(
      resolveSettings(
        { aiSettingsByAgent: { exec: { model: "workspace:exec", thinkingLevel: "high" } } },
        config,
        "exec"
      )
    ).toEqual({
      agentId: "exec",
      model: "workspace:exec",
      thinkingLevel: "high",
      reasoningMode: undefined,
    });
  });
});
