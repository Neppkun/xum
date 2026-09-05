import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Folder,
  GitBranch,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  X,
} from "lucide-react-native";
import type { FrontendWorkspaceMetadata } from "../../../../src/common/types/workspace";
import type { Projects } from "../useProjects";
import { IconButton, Loading, Notice } from "../components/Controls";
import { colors, layout } from "../theme";

export function Navigator(props: {
  projects: Projects;
  workspaces: FrontendWorkspaceMetadata[];
  selectedId?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (workspace: FrontendWorkspaceMetadata) => void;
  onCreate: () => void;
  onSettings: () => void;
  onClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const groups = new Map<string, { name: string; workspaces: FrontendWorkspaceMetadata[] }>();
  for (const [path, config] of props.projects)
    groups.set(path, {
      name: config.displayName ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
      workspaces: [],
    });
  for (const workspace of props.workspaces) {
    const key = workspace.kind === "scratch" ? "scratch" : workspace.projectPath;
    const group = groups.get(key) ?? {
      name: workspace.kind === "scratch" ? "Scratch chats" : workspace.projectName,
      workspaces: [],
    };
    group.workspaces.push(workspace);
    groups.set(key, group);
  }
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.brand}>
          xum<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        <View style={layout.row}>
          <IconButton label="Refresh workspaces" icon={RefreshCw} onPress={props.onRetry} />
          <IconButton label="New workspace" icon={Plus} onPress={props.onCreate} />
          {props.onClose && (
            <IconButton label="Close workspace drawer" icon={X} onPress={props.onClose} />
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {props.error && <Notice onRetry={props.onRetry}>{props.error}</Notice>}
        {props.loading && <Loading label="Loading workspaces…" />}
        {!props.loading && groups.size === 0 && (
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={layout.text}>A little room to think.</Text>
            <Text style={layout.muted}>
              Create a scratch chat, or add a project from Xum desktop to get started.
            </Text>
          </View>
        )}
        {[...groups].map(([key, group]) => (
          <View key={key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed.has(key) }}
              onPress={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              style={styles.group}
            >
              {key === "scratch" ? (
                <MessageSquare size={15} color={colors.muted} />
              ) : (
                <Folder size={15} color={colors.muted} />
              )}
              <Text numberOfLines={1} style={[layout.label, { flex: 1, letterSpacing: 0 }]}>
                {group.name}
              </Text>
              <Text style={layout.muted}>{group.workspaces.length}</Text>
            </Pressable>
            {!collapsed.has(key) &&
              group.workspaces
                .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
                .map((workspace) => (
                  <Pressable
                    key={workspace.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: workspace.id === props.selectedId }}
                    onPress={() => props.onSelect(workspace)}
                    style={({ pressed }) => [
                      styles.workspace,
                      workspace.id === props.selectedId && styles.selected,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <GitBranch
                      size={15}
                      color={workspace.id === props.selectedId ? colors.accent : colors.dim}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.workspaceTitle}>
                        {workspace.title ?? workspace.name}
                      </Text>
                      <Text numberOfLines={1} style={layout.muted}>
                        {workspace.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
          </View>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={props.onSettings} style={styles.footer}>
        <Settings size={18} color={colors.muted} />
        <Text style={layout.muted}>Settings & connection</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRightColor: colors.border,
    borderRightWidth: 1,
  },
  top: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { color: colors.bright, fontWeight: "700", letterSpacing: -1, fontSize: 26 },
  group: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  workspace: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    minHeight: 60,
    borderRadius: 8,
    marginBottom: 3,
  },
  selected: { backgroundColor: colors.elevated },
  workspaceTitle: { color: colors.text, fontSize: 14, lineHeight: 21 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
