import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertCircle, ArrowLeft, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, layout } from "../theme";

export function IconButton(props: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  const Icon = props.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: props.disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon size={20} color={props.color ?? colors.muted} />
    </Pressable>
  );
}

export function Button(props: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  icon?: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled || props.busy }}
      disabled={props.disabled || props.busy}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.secondary && styles.secondary,
        { opacity: props.disabled || props.busy ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={colors.bright} size="small" />
      ) : Icon ? (
        <Icon size={18} color={colors.bright} />
      ) : null}
      <Text style={styles.buttonText}>{props.children}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={{ gap: 8 }}>
      <Text style={layout.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.dim}
        selectionColor={colors.accent}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
        accessibilityLabel={label}
        style={[styles.input, inputProps.style]}
      />
    </View>
  );
}

export function Notice(props: { children: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.notice}>
      <View style={[layout.row, { alignItems: "flex-start" }]}>
        <AlertCircle size={18} color={colors.danger} />
        <Text selectable style={[layout.text, { color: colors.danger, flex: 1 }]}>
          {props.children}
        </Text>
      </View>
      {props.onRetry && (
        <Button secondary onPress={props.onRetry}>
          Retry
        </Button>
      )}
    </View>
  );
}

export function Loading(props: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={layout.muted}>{props.label ?? "Loading…"}</Text>
    </View>
  );
}

export function Header(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {props.onBack && <IconButton label="Back" icon={ArrowLeft} onPress={props.onBack} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {props.title}
        </Text>
        {props.subtitle && (
          <Text numberOfLines={1} style={layout.muted}>
            {props.subtitle}
          </Text>
        )}
      </View>
      {props.trailing}
    </View>
  );
}

export function Sheet(props: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <SafeAreaView style={layout.fill}>
        <Header
          title={props.title}
          trailing={<IconButton label="Close" icon={X} onPress={props.onClose} />}
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}>
          {props.children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
  },
  secondary: { backgroundColor: colors.elevated },
  buttonText: { color: colors.bright, fontSize: 15, fontWeight: "600" },
  input: {
    color: colors.bright,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  notice: {
    padding: 14,
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  loading: { padding: 28, gap: 12, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 68,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerTitle: { color: colors.bright, fontWeight: "600", fontSize: 16 },
});
