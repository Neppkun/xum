import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Folder, MessageSquare } from "lucide-react-native";
import type { MobileClient } from "../api";
import type { Projects } from "../useProjects";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import { Button, Field, Loading, Notice, Sheet } from "../components/Controls";
import { colors, layout } from "../theme";

export function CreateWorkspace(props: {
  client: MobileClient;
  projects: Projects;
  onCreated: (workspace: FrontendWorkspaceMetadata) => void;
  onClose: () => void;
}) {
  const [project, setProject] = useState<string | null>(null);
  return (
    <Sheet title="New workspace" onClose={props.onClose}>
      <Text style={layout.muted}>
        Start a scratch conversation or an isolated worktree in an existing server project.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setProject(null)}
        style={[
          layout.row,
          {
            padding: 12,
            minHeight: 48,
            borderRadius: 8,
            backgroundColor: project === null ? colors.elevated : colors.panel,
          },
        ]}
      >
        <MessageSquare size={18} color={colors.accent} />
        <Text style={layout.text}>Scratch chat</Text>
      </Pressable>
      {props.projects.map(([path, config]) => (
        <Pressable
          key={path}
          accessibilityRole="button"
          accessibilityState={{ selected: project === path }}
          onPress={() => setProject(path)}
          style={[
            layout.row,
            {
              padding: 12,
              minHeight: 48,
              borderRadius: 8,
              backgroundColor: project === path ? colors.elevated : colors.panel,
            },
          ]}
        >
          <Folder size={18} color={colors.muted} />
          <Text numberOfLines={1} style={[layout.text, { flex: 1 }]}>
            {config.displayName ?? path.split(/[\\/]/).at(-1)}
          </Text>
        </Pressable>
      ))}
      <CreateForm
        key={project ?? "scratch"}
        client={props.client}
        project={project}
        onCreated={props.onCreated}
      />
    </Sheet>
  );
}

function CreateForm(props: {
  client: MobileClient;
  project: string | null;
  onCreated: (workspace: FrontendWorkspaceMetadata) => void;
}) {
  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState("");
  const [trunk, setTrunk] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(props.project !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const pending = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    if (props.project) {
      setLoading(true);
      props.client.projects
        .listBranches({ projectPath: props.project }, { signal: abort.signal })
        .then((result) => {
          if (abort.signal.aborted) return;
          setBranches(result.branches);
          setTrunk(result.recommendedTrunk ?? "");
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!abort.signal.aborted)
            setError(cause instanceof Error ? cause.message : "Could not load branches.");
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }
    return () => abort.abort();
  }, [props.client, props.project, generation]);

  async function create() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const signal = controller.current.signal;
    try {
      const result = props.project
        ? await props.client.workspace.create(
            {
              projectPath: props.project,
              branchName: branch.trim() || undefined,
              trunkBranch: trunk.trim(),
              title: title.trim() || undefined,
              // Omission selects the server's worktree default and server-owned src directory.
            },
            { signal }
          )
        : await props.client.workspace.createScratch(
            { title: title.trim() || undefined },
            { signal }
          );
      if (signal.aborted) return;
      if (!result.success) throw new Error(result.error);
      props.onCreated(result.metadata);
    } catch (cause) {
      if (!signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not create workspace. Refresh the list before retrying if the connection dropped."
        );
    } finally {
      pending.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Title (optional)"
        value={title}
        onChangeText={setTitle}
        placeholder="What are you working on?"
        editable={!busy}
      />
      {props.project && (
        <>
          <Field
            label="Branch name (optional)"
            value={branch}
            onChangeText={setBranch}
            placeholder="Generated by the server"
            editable={!busy}
          />
          <Field
            label="Base branch"
            value={trunk}
            onChangeText={setTrunk}
            placeholder="Select or enter a branch"
            editable={!busy && !loading}
          />
          {branches.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {branches.slice(0, 8).map((name) => (
                <Pressable
                  key={name}
                  disabled={busy}
                  accessibilityRole="button"
                  onPress={() => setTrunk(name)}
                  style={{
                    padding: 12,
                    minHeight: 44,
                    borderRadius: 8,
                    backgroundColor: colors.panel,
                  }}
                >
                  <Text style={layout.muted}>{name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      {loading && <Loading label="Loading base branches…" />}
      {error && <Notice onRetry={() => setGeneration((value) => value + 1)}>{error}</Notice>}
      <Button
        busy={busy}
        disabled={loading || (props.project !== null && !trunk.trim())}
        onPress={create}
      >
        {props.project ? "Create worktree" : "Create scratch chat"}
      </Button>
    </View>
  );
}
