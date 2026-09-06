import { describe, expect, it } from "bun:test";
import type { ProvidersConfigMap } from "@/common/orpc/types";
import { hasCodexOauthTokens, wouldRouteOpenAIThroughCodexOauth } from "./codexOauthRouting";
import { openaiDirectProviderOptionsAvailable } from "@/common/utils/ai/openaiProviderOptionsAvailability";

const auth = { type: "oauth", access: "access", refresh: "refresh", expires: 1000 };

describe("Codex OAuth account routing", () => {
  it("keeps legacy metadata and raw token defaults compatible", () => {
    for (const config of [{ codexOauthSet: true }, { codexOauth: auth }]) {
      expect(hasCodexOauthTokens(config)).toBe(true);
      expect(hasCodexOauthTokens(config, "default")).toBe(true);
      expect(hasCodexOauthTokens(config, "missing")).toBe(false);
    }
  });

  it("uses metadata account IDs instead of the aggregate connection flag", () => {
    const config = {
      codexOauthSet: true,
      codexOauthAccounts: [{ id: "work", label: "Work" }],
      codexOauthDefaultAccountId: "missing",
    };
    expect(hasCodexOauthTokens(config)).toBe(false);
    expect(hasCodexOauthTokens(config, "default")).toBe(false);
    expect(hasCodexOauthTokens(config, "work")).toBe(true);
    expect(hasCodexOauthTokens({ ...config, codexOauthDefaultAccountId: "work" })).toBe(true);
    expect(hasCodexOauthTokens({ ...config, codexOauthAccounts: [] }, "work")).toBe(false);
  });

  it("selects raw account maps without substituting legacy tokens", () => {
    const config = {
      codexOauth: auth,
      codexOauthAccounts: {
        work: { label: "Work", auth },
        invalid: { label: "Invalid", auth: { ...auth, refresh: "" } },
      },
      codexOauthDefaultAccountId: "work",
    };
    expect(hasCodexOauthTokens(config)).toBe(true);
    expect(hasCodexOauthTokens(config, "default")).toBe(true);
    expect(hasCodexOauthTokens(config, "missing")).toBe(false);
    expect(hasCodexOauthTokens(config, "invalid")).toBe(false);
    expect(hasCodexOauthTokens({ ...config, codexOauthAccounts: {} })).toBe(false);
  });

  it("threads selected accounts into direct provider option availability", () => {
    const providersConfig: ProvidersConfigMap = {
      openai: {
        apiKeySet: true,
        isConfigured: true,
        isEnabled: true,
        codexOauthSet: true,
        codexOauthDefaultAccountId: "deleted",
        codexOauthAccounts: [{ id: "work", label: "Work" }],
      },
    };
    const model = "openai:gpt-5.5";
    expect(wouldRouteOpenAIThroughCodexOauth(model, providersConfig)).toBe(false);
    expect(
      wouldRouteOpenAIThroughCodexOauth(model, providersConfig, { codexOauthAccountId: "work" })
    ).toBe(true);
    expect(
      openaiDirectProviderOptionsAvailable(model, { providersConfig, codexOauthAccountId: "work" })
    ).toBe(false);
    expect(
      wouldRouteOpenAIThroughCodexOauth(model, providersConfig, {
        codexOauthAccountId: "work",
        openaiWireFormat: "chatCompletions",
      })
    ).toBe(false);
    providersConfig.openai.codexOauthDefaultAuth = "apiKey";
    expect(
      wouldRouteOpenAIThroughCodexOauth(model, providersConfig, { codexOauthAccountId: "work" })
    ).toBe(false);
  });
});
