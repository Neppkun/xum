import {
  hasInterruptedStream,
  isEligibleForAutoRetry,
  isPreTokenInterruptedUserTurn,
} from "@/common/utils/messages/retryEligibility";
import { describe, expect, test } from "bun:test";
import { MuxMessageSchema } from "@/common/orpc/schemas/message";
import { createMuxMessage } from "@/common/types/message";
import { StreamingMessageAggregator } from "./StreamingMessageAggregator";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

describe("token-budget replay", () => {
  test("retains old windows and machine warnings while hiding the provider lead-in", () => {
    const messages = [
      createMuxMessage("user", "user", "Investigate the failing test", { historySequence: 1 }),
      createMuxMessage("warning", "user", "Write the next steps to workspace notes.", {
        historySequence: 2,
        synthetic: true,
        uiVisible: true,
        muxMetadata: { type: "context-budget-warning", contextTokens: 800, maxTokens: 1000 },
      }),
      createMuxMessage("reset", "assistant", "", {
        historySequence: 3,
        contextBoundaryKind: "reset",
        muxMetadata: {
          type: "context-window-rollover",
          rolloverId: "reset",
          reason: "on-send",
          previousWindowId: "initial",
          flushOpportunity: true,
          contextTokens: 900,
          maxTokens: 1000,
        },
      }),
      createMuxMessage("lead-in", "user", "Model-only retrieval instructions", {
        historySequence: 4,
        synthetic: true,
        muxMetadata: { type: "context-window-lead-in", rolloverId: "reset" },
      }),
      createMuxMessage("next", "user", "Continue with the fix", { historySequence: 5 }),
      createMuxMessage("manual-reset", "assistant", "", {
        historySequence: 6,
        contextBoundaryKind: "reset",
      }),
      createMuxMessage("budget-continue", "user", "Continue", {
        historySequence: 7,
        synthetic: true,
        uiVisible: false,
        muxMetadata: { type: "normal", contextBudgetContinuation: true },
      }),
    ];
    const aggregator = new StreamingMessageAggregator(CREATED_AT);
    aggregator.loadHistoricalMessages(
      messages.map((message) => MuxMessageSchema.parse(message)),
      false
    );
    const displayed = aggregator.getDisplayedMessages();
    expect(displayed.map((message) => message.type)).toEqual([
      "user",
      "user",
      "compaction-boundary",
      "user",
      "compaction-boundary",
    ]);
    expect(displayed[1]).toMatchObject({
      contextBudgetWarning: { contextTokens: 800, maxTokens: 1000 },
    });
    expect(displayed[2]).toMatchObject({ boundaryKind: "reset", contextWindowRollover: true });
    expect(displayed[4]).toMatchObject({ boundaryKind: "reset", contextWindowRollover: undefined });
    expect(aggregator.getActiveStreamMessageId()).toBeUndefined();
  });

  test("rejected replay tails are visible terminal barriers, not retry candidates", () => {
    const aggregator = new StreamingMessageAggregator(CREATED_AT);
    aggregator.loadHistoricalMessages(
      [
        createMuxMessage("completed-user", "user", "Already handled", { historySequence: 1 }),
        createMuxMessage("completed-answer", "assistant", "Completed response", {
          historySequence: 2,
        }),
        createMuxMessage("rejected-user", "user", "Rejected request", {
          historySequence: 3,
          contextBudgetRejected: true,
        }),
      ].map((message) => MuxMessageSchema.parse(message)),
      false
    );
    const displayed = aggregator.getDisplayedMessages();
    const tail = displayed.at(-1);
    expect(tail).toMatchObject({ type: "user", content: "Rejected request" });
    expect(hasInterruptedStream(displayed)).toBe(false);
    expect(isEligibleForAutoRetry(displayed)).toBe(false);
    expect(isPreTokenInterruptedUserTurn(tail, { reason: "startup", at: 1 })).toBe(false);
    aggregator.loadHistoricalMessages(
      [
        MuxMessageSchema.parse(
          createMuxMessage("next", "user", "New request", { historySequence: 4 })
        ),
      ],
      false
    );
    expect(hasInterruptedStream(aggregator.getDisplayedMessages())).toBe(true);
  });

  test.each([false, true])(
    "does not collapse human or malformed warning rows (synthetic=%s)",
    (synthetic) => {
      const message = createMuxMessage("warning", "user", "Visible input", {
        historySequence: 1,
        synthetic,
        uiVisible: true,
        muxMetadata: {
          type: "context-budget-warning",
          contextTokens: synthetic ? -1 : 800,
          maxTokens: 1000,
        },
      });
      const aggregator = new StreamingMessageAggregator(CREATED_AT);
      aggregator.loadHistoricalMessages([MuxMessageSchema.parse(message)], false);
      expect(aggregator.getDisplayedMessages()[0]).toMatchObject({
        type: "user",
        content: "Visible input",
        contextBudgetWarning: undefined,
      });
    }
  );
});
