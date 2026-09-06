import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { jsonSchema, tool } from "ai";
import * as tokenizerModule from "@/node/utils/main/tokenizer";
import {
  estimateAssembledRequestTokens,
  getContextBudgetHardCeiling,
} from "@/common/utils/compaction/contextBudget";
import {
  checkAssembledRequestBudgetForModel,
  estimateFreshRequestTokensForModel,
  estimateToolResultTokensForModel,
} from "./contextBudgetCounting";

const model = "openai:gpt-4o";
afterEach(() => mock.restore());

describe("real-encoding budget guards", () => {
  test("bypass warmed approx-4 without changing ordinary callers for CJK, emoji and dense identifiers", async () => {
    const keys = [
      "XUM_APPROX_TOKENIZER",
      "MUX_APPROX_TOKENIZER",
      "XUM_FORCE_REAL_TOKENIZER",
      "MUX_FORCE_REAL_TOKENIZER",
    ] as const;
    const previous = keys.map((key) => process.env[key]);
    try {
      process.env.XUM_APPROX_TOKENIZER = "1";
      delete process.env.XUM_FORCE_REAL_TOKENIZER;
      delete process.env.MUX_FORCE_REAL_TOKENIZER;
      const approximate = await tokenizerModule.getTokenizerForModel(model);
      expect(approximate.encoding).toBe("approx-4");
      const limit = 10000;
      const ceiling = getContextBudgetHardCeiling(limit);
      for (const text of ["漢".repeat(10000), "🦊".repeat(4000), "a0b1c2d3e4f5".repeat(1500)]) {
        const warmCount = await approximate.countTokens(text);
        const payload = { system: "Short system", messages: [{ role: "user", content: text }] };
        expect(warmCount).toBeLessThan(ceiling);
        expect(estimateAssembledRequestTokens(payload)).toBeLessThan(ceiling);
        const rejected = await checkAssembledRequestBudgetForModel(payload, {
          model,
          modelContextLimit: limit,
        });
        expect(rejected?.type).toBe("context_budget_exceeded");
        expect(rejected?.estimate).toBeGreaterThan(ceiling);
        expect(
          await estimateFreshRequestTokensForModel(
            { userText: text, systemFloorTokens: 0, modelContextLimit: limit },
            { model }
          )
        ).toBeGreaterThan(ceiling);
        const stillApproximate = await tokenizerModule.getTokenizerForModel(model);
        expect(stillApproximate.encoding).toBe("approx-4");
        expect(await stillApproximate.countTokens(text)).toBe(warmCount);
      }
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  }, 20000);

  test("ordinary fitting ASCII/CJK prompts and ASCII schemas stay usable", async () => {
    const payload = {
      system: "Follow the project conventions. ".repeat(20),
      messages: [{ role: "user", content: "你好，请解释这个函数。" }],
      tools: {
        inspect: tool({
          description: "Inspect project code. ".repeat(100),
          inputSchema: jsonSchema({ type: "object", properties: { path: { type: "string" } } }),
        }),
      },
    };
    expect(
      await checkAssembledRequestBudgetForModel(payload, { model, modelContextLimit: 10000 })
    ).toBeUndefined();
    expect(
      await estimateFreshRequestTokensForModel(
        { userText: "Explain this function.", modelContextLimit: 4096 },
        { model }
      )
    ).toBeLessThan(getContextBudgetHardCeiling(4096));
  });

  test("counts system/schema text but excludes nested media bytes", async () => {
    const count = (bytes: string) =>
      estimateToolResultTokensForModel(
        { data: [{ type: "image", data: bytes, mimeType: "image/png" }] },
        { model }
      );
    expect(await count("x".repeat(100000))).toBe(await count("abc"));
    const payload = {
      messages: [{ role: "user", content: "small" }],
      tools: {
        huge: tool({
          description: "漢".repeat(10000),
          inputSchema: jsonSchema({ type: "object" }),
        }),
      },
    };
    expect(
      (await checkAssembledRequestBudgetForModel(payload, { model, modelContextLimit: 10000 }))
        ?.type
    ).toBe("context_budget_exceeded");
  });

  test("bounded chunk counts cover direct encoding around Unicode and identifier boundaries", async () => {
    const tokenizer = await tokenizerModule.getTokenizerForModel(model, undefined, {
      requireRealEncoding: true,
    });
    for (const text of [
      "a".repeat(4095) + "🦊漢字".repeat(100),
      "a0b1c2d3e4f5".repeat(500),
      "你好世界".repeat(1300),
    ]) {
      const direct = await tokenizer.countTokens(text);
      expect(await estimateToolResultTokensForModel(text, { model })).toBeGreaterThanOrEqual(
        direct
      );
    }
  }, 10000);

  test("huge repeated ASCII completes with bounded real-encoding calls", async () => {
    const tokenizer = await tokenizerModule.getTokenizerForModel(model, undefined, {
      requireRealEncoding: true,
    });
    const count = spyOn(tokenizer, "countTokens");
    spyOn(tokenizerModule, "getTokenizerForModel").mockResolvedValue(tokenizer);
    const rejected = await checkAssembledRequestBudgetForModel(
      { system: "x".repeat(1_500_000), messages: [] },
      { model, modelContextLimit: 10000 }
    );
    expect(rejected?.type).toBe("context_budget_exceeded");
    expect(count.mock.calls.length).toBeLessThan(30);
    expect(
      count.mock.calls.every(
        ([text]) => text.length <= 4096 && Buffer.from(text).toString("utf8") === text
      )
    ).toBe(true);
  }, 10000);

  test("encoding initialization and counting failures do not downgrade to character heuristics", async () => {
    const failure = new Error("encoding unavailable");
    spyOn(tokenizerModule, "getTokenizerForModel").mockRejectedValueOnce(failure);
    expect(
      await estimateFreshRequestTokensForModel({ userText: "hello" }, { model }).catch(
        (error: unknown) => error
      )
    ).toBe(failure);
    spyOn(tokenizerModule, "getTokenizerForModel").mockResolvedValueOnce({
      encoding: "real",
      countTokens: () => Promise.reject(failure),
    });
    expect(
      await checkAssembledRequestBudgetForModel(
        { messages: [{ role: "user", content: "hello" }] },
        { model, modelContextLimit: 10000 }
      ).catch((error: unknown) => error)
    ).toBe(failure);
  });
});
