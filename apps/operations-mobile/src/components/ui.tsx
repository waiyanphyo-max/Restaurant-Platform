import { useId, type PropsWithChildren, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { readEmbeddedTenant } from "../tenant";

export function Page({ title, subtitle, children, onRefresh, refreshing = false }: PropsWithChildren<{ title: string; subtitle?: string; onRefresh?: () => void; refreshing?: boolean }>) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    {children}
  </ScrollView>;
}

export function Card({ title, children }: PropsWithChildren<{ title?: string }>) {
  return <View style={styles.card}>{title ? <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text> : null}{children}</View>;
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
  return <View style={styles.field}>
    <Text nativeID={id} style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityLabelledBy={id} placeholderTextColor="#64748b" {...props}
      style={[styles.input, error ? styles.invalid : null, props.style]} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function DataTable({ columns, rows, emptyMessage = "No records found." }: {
  columns: readonly string[]; rows: readonly { key: string; cells: readonly ReactNode[] }[]; emptyMessage?: string;
}) {
  if (!rows.length) return <Body>{emptyMessage}</Body>;
  return <ScrollView horizontal accessibilityLabel="Records table">
    <View>
      <View style={[styles.tableRow, styles.tableHeader]}>{columns.map(column => <Text key={column} style={[styles.cell, styles.label]}>{column}</Text>)}</View>
      {rows.map(row => <View key={row.key} style={styles.tableRow}>{row.cells.map((cell, index) =>
        <View key={index} style={styles.cell}>{typeof cell === "string" || typeof cell === "number"
          ? <Text accessibilityLabel={columns[index] ? `${columns[index]}: ${cell}` : undefined} style={styles.body}>{cell}</Text>
          : cell}</View>)}</View>)}
    </View>
  </ScrollView>;
}

export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel }: {
  visible: boolean; title: string; message: string; confirmLabel: string; onConfirm(): void; onCancel(): void;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}><View accessibilityViewIsModal style={styles.dialog}>
      <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text><Body>{message}</Body>
      <Action title={confirmLabel} onPress={onConfirm} /><Action title="Cancel" secondary onPress={onCancel} />
    </View></View>
  </Modal>;
}

/** The caller can supply exact display text for values scaled for chart geometry. */
export function BarChart({ label, points }: { label: string; points: readonly { label: string; value: number; displayValue?: string }[] }) {
  const values = points.map(point => Number.isFinite(point.value) ? Math.max(0, point.value) : 0);
  const maximum = Math.max(1, ...values);
  const brand = resolveBrandTokens(readEmbeddedTenant().branding);
  return <View accessibilityLabel={label} style={styles.chart}>
    <Text accessibilityRole="header" style={styles.cardTitle}>{label}</Text>
    {points.map((point, index) => {
      const label = `${point.label}: ${point.displayValue ?? values[index]}`;
      return <View key={point.label} accessible accessibilityLabel={label}>
        <Text style={styles.body}>{label}</Text>
        <View style={styles.track}><View style={[styles.bar, { width: `${values[index] / maximum * 100}%`, backgroundColor: brand.primaryColor }]} /></View>
      </View>;
    })}
  </View>;
}

export function StateView({ kind, title, message, onRetry }: {
  kind: "loading" | "offline" | "error" | "denied"; title?: string; message?: string; onRetry?: () => void;
}) {
  const titles = { loading: "Loading your workspace", offline: "You are offline", error: "Something went wrong", denied: "Access unavailable" };
  return <Card><Text accessibilityRole="header" style={styles.cardTitle}>{title ?? titles[kind]}</Text>
    {kind === "loading" ? <><ActivityIndicator accessibilityLabel="Loading" />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 10 }}>
        {["100%", "82%", "64%"].map(width => <View key={width} style={{ height: 16, borderRadius: 6, backgroundColor: "#e2e8f0", width: width as `${number}%` }} />)}
      </View></> : null}
    {message ? <Text accessibilityRole={kind === "error" ? "alert" : "text"} style={styles.body}>{message}</Text> : null}
    {onRetry ? <Action title="Try again" onPress={onRetry} /> : null}
  </Card>;
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 48, width: "100%", maxWidth: 1000, alignSelf: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: "#18222e" },
  muted: { fontSize: 14, lineHeight: 21, color: "#526174" },
  body: { fontSize: 15, lineHeight: 23, color: "#334155" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 18, gap: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#18222e" },
  action: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: "center" },
  actionText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  field: { gap: 6 }, label: { fontSize: 14, fontWeight: "600", color: "#334155" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#94a3b8", borderRadius: 8, paddingHorizontal: 12, color: "#18222e", backgroundColor: "#fff" },
  invalid: { borderColor: "#b91c1c" }, error: { fontSize: 14, color: "#b91c1c" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e2e8f0" }, tableHeader: { backgroundColor: "#f1f5f9" }, cell: { width: 165, padding: 10, justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: "white", borderRadius: 16, padding: 24, gap: 16, maxWidth: 440, width: "100%", alignSelf: "center" },
  chart: { gap: 12 }, track: { height: 12, backgroundColor: "#e2e8f0", borderRadius: 4 }, bar: { height: 12, borderRadius: 4 }
});
