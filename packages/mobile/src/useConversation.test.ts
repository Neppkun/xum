import "./testDom";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createORPCClient } from "@orpc/client";
import type { MobileClient } from "./api";
import type { WorkspaceChatMessage } from "./transcript";
import { useConversation } from "./useConversation";

afterEach(cleanup);

function message(sequence: number, text = `message ${sequence}`): WorkspaceChatMessage {
  return {
    type: "message",
    id: String(sequence),
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { historySequence: sequence },
  };
}

function fixture() {
  type Page = Awaited<ReturnType<MobileClient["workspace"]["history"]["loadMore"]>>;
  let complete!: (page: Page) => void;
  const page = new Promise<Page>((resolve) => {
    complete = resolve;
  });
  let eventController!: ReadableStreamDefaultController<WorkspaceChatMessage>;
  const events = new ReadableStream<WorkspaceChatMessage>({
    start(controller) {
      eventController = controller;
    },
  });
  const requests: Array<{ input: unknown; signal?: AbortSignal }> = [];
  const client = createORPCClient<MobileClient>({
    call: async (path, input, options) => {
      switch (path.join(".")) {
        case "config.getConfig":
          return { agentAiDefaults: {} };
        case "providers.getConfig":
          return {};
        case "agents.list":
          return [];
        case "workspace.onChat":
          options.signal?.addEventListener("abort", () => eventController.close(), { once: true });
          return events.values();
        case "workspace.history.loadMore":
          requests.push({ input, signal: options.signal });
          return page;
        default:
          throw new Error(`Unexpected call: ${path.join(".")}`);
      }
    },
  });
  const lifetime = new AbortController();
  const view = renderHook(() => useConversation(client, "workspace", lifetime.signal));
  return {
    ...view,
    complete,
    requests,
    async ready() {
      await act(async () => {
        eventController.enqueue(message(10, "current"));
        eventController.enqueue({ type: "caught-up", hasOlderHistory: true });
      });
      await waitFor(() => expect(view.result.current.transcript.caughtUp).toBe(true));
    },
    async emit(event: WorkspaceChatMessage) {
      await act(async () => eventController.enqueue(event));
    },
  };
}

test("older history is inserted without replacing newer copies and uses the oldest visible row", async () => {
  const view = fixture();
  await view.ready();
  await act(async () => {
    const pending = view.result.current.loadOlder();
    view.complete({
      messages: [message(2), message(10, "stale")],
      nextCursor: null,
      hasOlder: false,
    });
    await pending;
  });
  expect(view.requests[0].input).toEqual({
    workspaceId: "workspace",
    cursor: { beforeHistorySequence: 10, beforeMessageId: "10" },
  });
  expect(view.result.current.transcript.messages.map((item) => item.id)).toEqual(["2", "10"]);
  expect(view.result.current.transcript.messages[1].parts).toEqual([
    { type: "text", text: "current" },
  ]);
  expect(view.result.current.transcript.hasOlderHistory).toBe(false);
});

test("truncate cancels an older-history read so its late response cannot resurrect removed messages", async () => {
  const view = fixture();
  await view.ready();
  let pending!: Promise<void>;
  act(() => {
    pending = view.result.current.loadOlder();
  });
  await view.emit({ type: "delete", historySequences: [2, 10] });
  expect(view.requests[0].signal?.aborted).toBe(true);
  await act(async () => {
    view.complete({ messages: [message(2)], nextCursor: null, hasOlder: false });
    await pending;
  });
  expect(view.result.current.transcript.messages).toEqual([]);
});

test("switching away aborts an in-flight page and duplicate taps do not start another read", async () => {
  const view = fixture();
  await view.ready();
  let pending!: Promise<void>;
  act(() => {
    pending = view.result.current.loadOlder();
    view.result.current.loadOlder();
  });
  expect(view.requests).toHaveLength(1);
  view.unmount();
  expect(view.requests[0].signal?.aborted).toBe(true);
  view.complete({ messages: [message(2)], nextCursor: null, hasOlder: false });
  await pending;
});
