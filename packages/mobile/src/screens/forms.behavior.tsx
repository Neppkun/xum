import "./formTestPlatform";
import { afterEach, expect, test } from "bun:test";
import { createRef } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createORPCClient } from "@orpc/client";
import type { TextInput } from "react-native";
import type { MobileClient } from "../api";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import { Button, Field, Sheet } from "../components/Controls";
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
