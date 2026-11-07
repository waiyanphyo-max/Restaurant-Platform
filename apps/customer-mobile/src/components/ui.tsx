import { useId, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { readEmbeddedTenant } from "../tenant";

export function Page({ title, subtitle, children, onRefresh, refreshing = false }: PropsWithChildren<{ title: string; subtitle?: string; onRefresh?: () => void; refreshing?: boolean }>) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}{children}
  </ScrollView>;
}
export function Card({ title, children }: PropsWithChildren<{ title?: string }>) {
  return <View style={styles.card}>{title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}{children}</View>;
}
export function Body({ children }: PropsWithChildren) { return <Text style={styles.body}>{children}</Text>; }
export function Action({ title, onPress, disabled = false, secondary = false, selected }: {
  title: string; onPress(): void; disabled?: boolean; secondary?: boolean; selected?: boolean;
}) {
  const brand = resolveBrandTokens(readEmbeddedTenant().branding);
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, { backgroundColor: secondary ? "#e8edf1" : brand.primaryColor, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={[styles.actionText, { color: secondary ? "#18222e" : brand.onPrimaryColor }]}>{title}</Text>
  </Pressable>;
}
export function FormField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const id = useId();
  return <View style={styles.field}><Text nativeID={id} style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityLabelledBy={id} placeholderTextColor="#64748b" {...props} style={[styles.input, props.style]} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
export function StateView({ kind, title, message, onRetry, retryLabel = "Try again" }: {
  kind: "loading" | "offline" | "error" | "denied"; title?: string; message?: string; onRetry?: () => void; retryLabel?: string;
}) {
  const titles = { loading: "Loading", offline: "You are offline", error: "Unable to load", denied: "Please sign in again" };
  return <Card title={title ?? titles[kind]}>{kind === "loading" ? <ActivityIndicator accessibilityLabel={title ?? titles.loading} /> : null}
    {message ? <Body>{message}</Body> : null}{onRetry ? <Action title={retryLabel} onPress={onRetry} /> : null}</Card>;
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  heading: { fontSize: 27, fontWeight: "700", color: "#18222e" }, title: { fontSize: 18, fontWeight: "600", color: "#18222e" },
  body: { fontSize: 15, lineHeight: 23, color: "#334155" }, card: { backgroundColor: "#fff", borderRadius: 14, padding: 18, gap: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  action: { borderRadius: 8, padding: 12, minHeight: 48, justifyContent: "center" }, actionText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  field: { gap: 6 }, label: { fontSize: 14, fontWeight: "600", color: "#334155" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#94a3b8", borderRadius: 8, paddingHorizontal: 12, color: "#18222e", backgroundColor: "#fff" }, error: { color: "#b91c1c" }
});
