import "./formTestPlatform";
import { afterEach, expect, test } from "bun:test";
import { createRef } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createORPCClient } from "@orpc/client";
import { View } from "react-native";
import type { TextInput } from "react-native";
import type { MuxMessage, MuxToolPart } from "../../../../src/common/types/message";
import type { MobileClient } from "../api";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import { Button, Field, Sheet } from "../components/Controls";
import { Message } from "../components/Message";
import { Markdown } from "../components/Markdown";
import { CreateWorkspace } from "./CreateWorkspace";
import { ModelSettings } from "./ModelSettings";
import { SettingsScreen } from "./SettingsScreen";
import type { ChatSettings, SettingsData } from "../settings";

afterEach(cleanup);

const workspace: FrontendWorkspaceMetadata = {
  id: "workspace",
  name: "feature",
  projectName: "project",
  projectPath: "/project",
  namedWorkspacePath: "/project/feature",
  runtimeConfig: { type: "local" },
};

test("empty assistant history is explained without mislabeling a live or completed response", () => {
  const props = { canAnswer: false, onAnswer: async () => {} };
  const message = { id: "empty", role: "assistant" as const, parts: [] };
  const view = render(<Message {...props} message={message} streaming />);
  expect(view.queryByText("No response received")).toBeNull();
  view.rerender(<Message {...props} message={message} />);
  expect(view.getByText("No response received")).toBeDefined();
  view.rerender(<Message {...props} message={{ ...message, metadata: { partial: true } }} />);
  expect(view.getByText("Interrupted")).toBeDefined();
  expect(view.queryByText("No response received")).toBeNull();
  view.rerender(
    <Message {...props} message={{ ...message, parts: [{ type: "text", text: "A response" }] }} />
  );
  expect(view.queryByText("No response received")).toBeNull();
  expect(view.queryByText("Interrupted")).toBeNull();
});

test("a field ref focuses the next native input", () => {
  const next = createRef<TextInput>();
  const view = render(
    <>
      <Field label="First" returnKeyType="next" onSubmitEditing={() => next.current?.focus()} />
      <Field ref={next} label="Second" />
    </>
  );
  fireEvent.keyDown(view.getByLabelText("First"), { key: "Enter", keyCode: 13 });
  expect(document.activeElement).toBe(view.getByLabelText("Second"));
});

test("sheet contents and footer do not dismiss it; the backdrop does, unless dismissal is blocked", () => {
  let dismissals = 0;
  let submissions = 0;
  const children = <Field label="Title" />;
  const footer = (
    <Button
      onPress={() => {
        submissions++;
      }}
    >
      Submit
    </Button>
  );
  const view = render(
    <Sheet
      title="Example"
      onClose={() => {
        dismissals++;
      }}
      footer={footer}
    >
      {children}
    </Sheet>
  );
  fireEvent.click(view.getByLabelText("Title"));
  fireEvent.click(view.getByRole("button", { name: "Submit" }));
  expect(submissions).toBe(1);
  expect(dismissals).toBe(0);
  fireEvent.click(view.getByRole("button", { name: "Dismiss Example" }));
  expect(dismissals).toBe(1);
  view.rerender(
    <Sheet
      title="Example"
      dismissDisabled
      onClose={() => {
        dismissals++;
      }}
      footer={footer}
    >
      {children}
    </Sheet>
  );
  fireEvent.click(view.getByRole("button", { name: "Dismiss Example" }));
  fireEvent.click(view.getByRole("button", { name: "Close" }));
  expect(dismissals).toBe(1);
});

test("workspace creation cannot be dismissed or submitted twice while the server is creating it", async () => {
  let resolve!: (value: { success: true; metadata: FrontendWorkspaceMetadata }) => void;
  const created = new Promise<{ success: true; metadata: FrontendWorkspaceMetadata }>((done) => {
    resolve = done;
  });
  let calls = 0;
  let dismissals = 0;
  let selected: FrontendWorkspaceMetadata | undefined;
  const client = createORPCClient<MobileClient>({
    call: async (path) => {
      if (path.join(".") !== "workspace.createScratch") throw new Error("Unexpected procedure");
      calls++;
      return created;
    },
  });
  const view = render(
    <CreateWorkspace
      client={client}
      signal={new AbortController().signal}
      connected
      projects={[]}
      onReconnect={async () => {}}
      onClose={() => {
        dismissals++;
      }}
      onCreated={(value) => {
        selected = value;
      }}
    />
  );
  fireEvent.click(view.getByRole("button", { name: "Create scratch chat" }));
  fireEvent.click(view.getByRole("button", { name: "Create scratch chat" }));
  fireEvent.click(view.getByRole("button", { name: "Close" }));
  fireEvent.click(view.getByRole("button", { name: "Dismiss New workspace" }));
  expect(calls).toBe(1);
  expect(dismissals).toBe(0);
  await act(async () => {
    resolve({ success: true, metadata: workspace });
    await created;
  });
  expect(selected).toBe(workspace);
});

test("model search accepts friendly names and returning preserves the selection", async () => {
  const data: SettingsData = {
    config: { agentAiDefaults: {}, defaultModel: "anthropic:claude-sonnet-4-5" },
    providers: { anthropic: { isConfigured: true, isEnabled: true, apiKeySet: true } },
    agents: [
      { id: "exec", name: "Exec", scope: "built-in", uiSelectable: true, subagentRunnable: true },
    ],
  };
  let saved: ChatSettings | undefined;
  const view = render(
    <ModelSettings
      workspace={workspace}
      data={data}
      value={{ agentId: "exec", model: "anthropic:claude-sonnet-4-5", thinkingLevel: "high" }}
      onClose={() => {}}
      onSave={(value) => {
        saved = value;
      }}
    />
  );
  fireEvent.click(view.getByRole("button", { name: "Choose model" }));
  fireEvent.change(view.getByLabelText("Search models"), { target: { value: "Sonnet 4.5" } });
  await waitFor(() =>
    expect(view.getByRole("button", { name: "anthropic:claude-sonnet-4-5" })).toBeDefined()
  );
  fireEvent.change(view.getByLabelText("Search models"), { target: { value: "not-a-model" } });
  expect(view.queryByRole("button", { name: "anthropic:claude-sonnet-4-5" })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Back" }));
  fireEvent.click(view.getByRole("button", { name: "Use settings" }));
  expect(saved?.model).toBe("anthropic:claude-sonnet-4-5");
  expect(saved?.thinkingLevel).toBe("high");
});

test("disconnect requires confirmation and can be cancelled without clearing credentials", () => {
  let disconnects = 0;
  const view = render(
    <SettingsScreen
      endpoint="https://server.example"
      onBack={() => {}}
      onDisconnect={() => {
        disconnects++;
      }}
      busy={false}
      error={null}
    />
  );
  fireEvent.click(view.getByRole("button", { name: "Disconnect" }));
  expect(disconnects).toBe(0);
  fireEvent.click(view.getByRole("button", { name: "Keep connection" }));
  expect(disconnects).toBe(0);
  fireEvent.click(view.getByRole("button", { name: "Disconnect" }));
  fireEvent.click(view.getByRole("button", { name: "Disconnect & forget credentials" }));
  expect(disconnects).toBe(1);
});

test("Markdown separates headings and hanging list items while preserving literal hostile text", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const view = render(
    <Markdown
      text={`## Steps\nIntro **before** the list.\n1. Keep ${hostile}\n   and this continuation\n2. Preserve \`a_b\`\n\n- A bullet\n- Another bullet\n\nAfter the list.`}
    />
  );
  expect(view.getByRole("heading").textContent).toBe("Steps");
  expect(view.getAllByRole("list")).toHaveLength(2);
  const items = view.getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(items[0].textContent).toContain(`1.Keep ${hostile}\nand this continuation`);
  expect(items[1].textContent).toBe("2.Preserve a_b");
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.getByText("After the list.")).toBeDefined();
});

test("Markdown keeps partial code fences and code whitespace literal throughout streaming", () => {
  const code = "- not a list\n  <script>literal()</script>  \n";
  const view = render(<Markdown text={`\`\`\`tsx\n${code}`} />);
  const codeElement = view.getByText(
    (_, element) => element?.children.length === 0 && element.textContent === code
  );
  expect(codeElement.textContent).toBe(code);
  expect(view.queryByRole("list")).toBeNull();
  expect(view.container.querySelector("script")).toBeNull();
  view.rerender(<Markdown text={`\`\`\`tsx\n${code}\`\`\`\n\nNext paragraph`} />);
  expect(
    view.getByText((_, element) => element?.children.length === 0 && element.textContent === code)
  ).toBeDefined();
  expect(view.getByText("Next paragraph")).toBeDefined();
  view.rerender(<Markdown text={"Unfinished ` and ** delimiters stay literal.\n``"} />);
  expect(view.container.textContent).toContain("Unfinished ` and ** delimiters stay literal.\n``");
});

function toolMessage(part: MuxToolPart, metadata?: MuxMessage["metadata"]): MuxMessage {
  return { id: "tool-message", role: "assistant", parts: [part], metadata };
}

test("a tool in a narrow transcript opens a sheet with literal output and closes without changing the message", () => {
  const output = "<img src=x>\nactual command output";
  const part: MuxToolPart = {
    type: "dynamic-tool",
    toolCallId: "bash-call",
    toolName: "bash",
    input: { script: "git status --short" },
    state: "output-available",
    output,
  };
  const view = render(
    <View style={{ width: 375 }}>
      <Message message={toolMessage(part)} canAnswer={false} onAnswer={async () => {}} />
    </View>
  );
  expect(view.getByRole("group", { name: "Assistant message" })).toBeDefined();
  expect(
    view.queryByText(
      (_, element) => element?.children.length === 0 && element.textContent === output
    )
  ).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Bash: Done. git status --short" }));
  expect(
    view.getByText((_, element) => element?.children.length === 0 && element.textContent === output)
  ).toBeDefined();
  expect(document.querySelector("img")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Close" }));
  expect(
    view.queryByText(
      (_, element) => element?.children.length === 0 && element.textContent === output
    )
  ).toBeNull();
  expect(view.getByRole("button", { name: "Bash: Done. git status --short" })).toBeDefined();
});

test("tool headers distinguish execution, completion, failure, redaction, and interrupted replay", () => {
  const part: MuxToolPart = {
    type: "dynamic-tool",
    toolCallId: "read-call",
    toolName: "file_read",
    input: { path: "src/app.ts", script: { not: "a string" } },
    state: "input-available",
  };
  const renderMessage = (tool: MuxToolPart, streaming = false, partial = false) => (
    <Message
      message={toolMessage(tool, { partial })}
      streaming={streaming}
      canAnswer={false}
      onAnswer={async () => {}}
    />
  );
  const view = render(renderMessage(part, true));
  expect(view.getByRole("button", { name: "File read: Pending. src/app.ts" })).toBeDefined();
  view.rerender(renderMessage({ ...part, executionStartedAt: 0 }, true));
  expect(view.getByRole("button", { name: "File read: Running. src/app.ts" })).toBeDefined();
  view.rerender(renderMessage(part));
  expect(view.getByRole("button", { name: "File read: No result. src/app.ts" })).toBeDefined();
  view.rerender(renderMessage(part, false, true));
  expect(view.getByRole("button", { name: "File read: Interrupted. src/app.ts" })).toBeDefined();
  view.rerender(
    renderMessage({
      ...part,
      state: "output-available",
      output: { success: false, error: "denied" },
    })
  );
  expect(view.getByRole("button", { name: "File read: Failed. src/app.ts" })).toBeDefined();
  view.rerender(renderMessage({ ...part, state: "output-redacted" }));
  fireEvent.click(view.getByRole("button", { name: "File read: Redacted. src/app.ts" }));
  expect(view.queryByText("denied")).toBeNull();
});

test("tool inspection caps large values but does not claim an exact-limit result is truncated", () => {
  const part: MuxToolPart = {
    type: "dynamic-tool",
    toolCallId: "large",
    toolName: "bash",
    input: {},
    state: "output-available",
    output: "x".repeat(24000),
  };
  const view = render(
    <Message message={toolMessage(part)} canAnswer={false} onAnswer={async () => {}} />
  );
  fireEvent.click(view.getByRole("button", { name: "Bash: Done" }));
  expect(view.getByText("x".repeat(24000)).textContent).toHaveLength(24000);
  expect(view.queryByText(/Showing the first/)).toBeNull();
  view.rerender(
    <Message
      message={toolMessage({ ...part, output: "x".repeat(24000) + "hidden suffix" })}
      canAnswer={false}
      onAnswer={async () => {}}
    />
  );
  expect(view.queryByText(/hidden suffix/)).toBeNull();
  expect(view.getByText(/Showing the first/)).toBeDefined();
});

test("question answers remain inline and require complete input before submission", async () => {
  const answers: Array<Record<string, string>> = [];
  const part: MuxToolPart = {
    type: "dynamic-tool",
    toolCallId: "question",
    toolName: "ask_user_question",
    state: "input-available",
    input: { questions: [{ question: "Which branch?" }, { question: "What should change?" }] },
  };
  const view = render(
    <Message
      message={toolMessage(part)}
      streaming
      canAnswer
      onAnswer={async (_id, value) => {
        answers.push(value);
      }}
    />
  );
  fireEvent.click(view.getByRole("button", { name: "Send answers" }));
  expect(answers).toHaveLength(0);
  fireEvent.change(view.getByLabelText("Which branch?"), { target: { value: "main" } });
  fireEvent.click(view.getByRole("button", { name: "Send answers" }));
  expect(answers).toHaveLength(0);
  fireEvent.change(view.getByLabelText("What should change?"), {
    target: { value: "Keep the API stable" },
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send answers" }));
  });
  expect(answers).toEqual([
    { "Which branch?": "main", "What should change?": "Keep the API stable" },
  ]);
});

test("reasoning stays an inline disclosure and historical errors are not replaced by an empty-response hint", () => {
  const message: MuxMessage = {
    id: "reasoning",
    role: "assistant",
    parts: [{ type: "reasoning", text: "Consider <unsafe> as literal text." }],
  };
  const props = { canAnswer: false, onAnswer: async () => {} };
  const view = render(<Message {...props} message={message} />);
  expect(view.queryByText("Consider <unsafe> as literal text.")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Reasoning" }));
  expect(view.getByText("Consider <unsafe> as literal text.")).toBeDefined();
  expect(view.queryByRole("button", { name: "Close" })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Reasoning" }));
  expect(view.queryByText("Consider <unsafe> as literal text.")).toBeNull();
  view.rerender(
    <Message
      {...props}
      message={{ ...message, parts: [], metadata: { error: "Provider rejected the request" } }}
    />
  );
  expect(view.getByRole("alert").textContent).toContain("Provider rejected the request");
  expect(view.queryByText("No response received")).toBeNull();
});
