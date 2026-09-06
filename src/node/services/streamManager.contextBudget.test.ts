import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createMuxMessage } from "@/common/types/message";
import { evaluateStepBudget } from "@/common/utils/compaction/contextBudget";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { StreamManager } from "./streamManager";
import { createTestHistoryService } from "./testHistoryService";

describe("settled context hard ceiling", () => {
  test("dense outputs stop before a second provider call at auto-off and retain every paired result", async () => {
    const h = await createTestHistoryService();
    const workspaceId = "dense-output-hard-stop";
    const messageId = "assistant-hard-stop";
    const outputs = ["🦊".repeat(50000), "second sibling completed"];
    let providerCalls = 0;
    const executed: number[] = [];
    const model = new MockLanguageModelV3({
      doStream: () => {
        providerCalls += 1;
        if (providerCalls > 1)
          return Promise.resolve({
            stream: simulateReadableStream({
              chunks: [
                { type: "text-start", id: "unexpected" },
                { type: "text-delta", id: "unexpected", delta: "unexpected second request" },
                { type: "text-end", id: "unexpected" },
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage: {
                    inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 10, text: 10, reasoning: 0 },
                  },
                },
              ],
            }),
          });
        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "tool-call", toolCallId: "first", toolName: "produce", input: '{"index":0}' },
              {
                type: "tool-call",
                toolCallId: "second",
                toolName: "produce",
                input: '{"index":1}',
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 10, text: 10, reasoning: 0 },
                },
              },
            ],
          }),
        });
      },
    });
    const manager = new StreamManager(h.historyService);
    const runtimeDir = path.join(h.tempDir, "runtime");
    await fs.mkdir(runtimeDir);
    try {
      expect(
        (
          await h.historyService.appendManyToHistory(workspaceId, [
            createMuxMessage("user", "user", "Run both tools"),
            createMuxMessage(messageId, "assistant", ""),
          ])
        ).success
      ).toBe(true);
      const started = await manager.startStream({
        workspaceId,
        messageId,
        historySequence: 1,
        model,
        modelString: "openai:gpt-4o",
        messages: [{ role: "user", content: "Run both tools" }],
        system: "Run tools",
        runtime: new LocalRuntime(h.tempDir),
        providedRuntimeTempDir: runtimeDir,
        tools: {
          produce: tool({
            inputSchema: z.object({ index: z.number() }),
            execute: ({ index }) => {
              executed.push(index);
              return outputs[index];
            },
          }),
        },
        onStepSettled: (step) => {
          expect(Math.ceil(step.toolResultChars / 4) + 1010).toBeLessThan(119808);
          expect(step.toolResultTokens).toBeGreaterThan(119808);
          return Promise.resolve(
            evaluateStepBudget({
              contextTokens: step.usage?.inputTokens ?? 0,
              outputTokens: step.usage?.outputTokens ?? 0,
              toolResultChars: step.toolResultChars,
              imageParts: step.imageParts,
              toolResultTokens: step.toolResultTokens,
              modelContextLimit: 128000,
              threshold: 1,
              warningEmitted: false,
            }).decision
          );
        },
      });
      expect(started.success).toBe(true);
      if (!started.success) throw new Error("Expected stream startup");
      const completion = await started.data.completion;
      expect(completion).toMatchObject({
        status: "failed",
        streamError: { errorType: "context_budget_blocked" },
      });
      if (completion.status === "failed")
        expect(completion.streamError.contextBudgetExceeded).toBeUndefined();
      expect(providerCalls).toBe(1);
      expect(executed).toEqual([0, 1]);
      expect((await h.historyService.commitPartial(workspaceId)).success).toBe(true);
      const history = await h.historyService.getLastMessages(workspaceId, 10);
      expect(history.success).toBe(true);
      if (!history.success) throw new Error(history.error);
      const resultParts = history.data
        .find((row) => row.id === messageId)
        ?.parts.filter((part) => part.type === "dynamic-tool");
      expect(resultParts).toHaveLength(2);
      expect(
        resultParts?.map((part) => ({
          id: part.toolCallId,
          state: part.state,
          output: part.state === "output-available" ? part.output : undefined,
        }))
      ).toEqual([
        { id: "first", state: "output-available", output: outputs[0] },
        { id: "second", state: "output-available", output: outputs[1] },
      ]);
      expect(
        history.data.some(
          (row) =>
            row.metadata?.muxMetadata?.type === "context-window-rollover" ||
            row.metadata?.muxMetadata?.type === "context-budget-warning"
        )
      ).toBe(false);
      expect(history.data.filter((row) => row.role === "user")).toHaveLength(1);
    } finally {
      await manager.stopStream(workspaceId);
      await h.cleanup();
    }
  }, 20000);
});
