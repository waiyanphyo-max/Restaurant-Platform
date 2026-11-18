import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentRef, type PropsWithChildren, type ReactNode, type Ref, type RefObject } from "react";
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps } from "react-native";
import type { RestaurantBranding } from "@restaurant-platform/shared-types";
import { foundationTokens, resolveThemeTokens, type ThemeTokens } from "@restaurant-platform/ui-tokens";
import { readEmbeddedTenant } from "../tenant";

type ThemeScope = { restaurantId: string; branding?: Partial<RestaurantBranding> | null };
const ThemeContext = createContext<ThemeScope | null>(null);

/** A presentation seam for a future runtime read; never selects a tenant or persists a palette. */
export function ThemeProvider({ restaurantId, branding, children }: PropsWithChildren<ThemeScope>) {
  return <ThemeContext.Provider value={{ restaurantId, branding }}>{children}</ThemeContext.Provider>;
}
export function useUiTheme(): ThemeTokens {
  const scope = useContext(ThemeContext);
  const tenant = readEmbeddedTenant();
  return useMemo(() => resolveThemeTokens(scope?.restaurantId === tenant.restaurantId ? scope.branding : undefined, tenant.branding),
    [scope?.restaurantId, scope?.branding, tenant.restaurantId, tenant.branding]);
}

export function Page({ title, subtitle, children, onRefresh, refreshing = false }: PropsWithChildren<{ title: string; subtitle?: string; onRefresh?: () => void; refreshing?: boolean }>) {
  const { color } = useUiTheme();
  return <ScrollView style={{ backgroundColor: color.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.foreground} colors={[color.foreground]} /> : undefined}>
    <Text allowFontScaling accessibilityRole="header" style={[styles.heading, { color: color.foreground }]}>{title}</Text>
    {subtitle ? <Text allowFontScaling style={[styles.body, { color: color.foregroundMuted }]}>{subtitle}</Text> : null}{children}
  </ScrollView>;
}
export function Card({ title, children }: PropsWithChildren<{ title?: string }>) {
  const { color } = useUiTheme();
  return <View style={[styles.card, { backgroundColor: color.surface, borderColor: color.border }]}>
    {title ? <Text allowFontScaling accessibilityRole="header" style={[styles.title, { color: color.foreground }]}>{title}</Text> : null}{children}
  </View>;
}
export function Body({ children, tone = "neutral", style, ...props }: PropsWithChildren<TextProps & { tone?: StatusTone | "muted" }>) {
  const { color } = useUiTheme();
  const foreground = tone === "neutral" ? color.foreground : tone === "muted" ? color.foregroundMuted : color[`${tone}Foreground`];
  return <Text {...props} allowFontScaling style={[styles.body, { color: foreground }, style]}>{children}</Text>;
}
export function Action({ title, onPress, disabled = false, secondary = false, selected, loading = false, danger = false, accessibilityHint, ref }: {
  title: string; onPress(): void; disabled?: boolean; secondary?: boolean; selected?: boolean; loading?: boolean; danger?: boolean; accessibilityHint?: string;
  ref?: Ref<ComponentRef<typeof View>>;
}) {
  const { color } = useUiTheme();
  const [focused, setFocused] = useState(false);
  const blocked = disabled || loading;
  const backgroundColor = blocked ? color.disabledSurface : danger ? color.danger : secondary ? color.secondary : color.primary;
  const foregroundColor = blocked ? color.disabledForeground : danger ? color.onDanger : secondary ? color.onSecondary : color.onPrimary;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: blocked, selected, busy: loading }} disabled={blocked}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onPress={() => { if (!blocked) onPress(); }}
    style={({ pressed }) => [styles.action, { backgroundColor, borderColor: focused ? foregroundColor : color.borderStrong,
      transform: [{ translateY: pressed && !blocked ? 1 : 0 }] }]}>
    {loading ? <ActivityIndicator color={foregroundColor} accessibilityLabel="Loading" /> : null}
    <Text allowFontScaling style={[styles.actionText, { color: foregroundColor }]}>{title}</Text>
  </Pressable>;
}
export function FormField({ label, error, accessibilityHint, onFocus, onBlur, ...props }: TextInputProps & { label: string; error?: string }) {
  const { color } = useUiTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text allowFontScaling nativeID={id} style={[styles.label, { color: color.foreground }]}>{label}</Text>
    <TextInput {...props} allowFontScaling accessibilityLabel={props.accessibilityLabel ?? label} accessibilityLabelledBy={id}
      accessibilityHint={[accessibilityHint, error].filter(Boolean).join(". ") || undefined}
      accessibilityState={{ ...props.accessibilityState, disabled: props.editable === false || props.accessibilityState?.disabled }}
      placeholderTextColor={props.placeholderTextColor ?? color.foregroundMuted} selectionColor={color.focus}
      onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[styles.input, { color: props.editable === false ? color.disabledForeground : color.foreground,
        backgroundColor: props.editable === false ? color.disabledSurface : color.surface,
        borderColor: focused ? color.focus : error ? color.dangerForeground : color.borderStrong }, props.style]} />
    {error ? <Text allowFontScaling nativeID={`${id}-error`} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[styles.label, { color: color.dangerForeground }]}>{error}</Text> : null}
  </View>;
}

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";
function statusColors(color: ThemeTokens["color"], tone: StatusTone) {
  if (tone === "neutral") return { backgroundColor: color.surfaceMuted, color: color.foreground };
  return { backgroundColor: color[`${tone}Surface`], color: color[tone] };
}
export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: StatusTone }>) {
  const { color } = useUiTheme();
  const pair = statusColors(color, tone);
  return <View style={[styles.badge, { backgroundColor: pair.backgroundColor }]}>
    <Text allowFontScaling style={[styles.label, { color: pair.color }]}>{children}</Text>
  </View>;
}
export function Status({ children, tone = "neutral" }: PropsWithChildren<{ tone?: StatusTone }>) {
  const { color } = useUiTheme();
  const pair = statusColors(color, tone);
  return <View accessibilityLiveRegion="polite" style={[styles.status, { backgroundColor: pair.backgroundColor }]}>
    <Text allowFontScaling accessibilityRole={tone === "danger" ? "alert" : "text"} style={[styles.body, { color: pair.color }]}>{children}</Text>
  </View>;
}

export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel, cancelLabel = "Cancel", confirmDisabled = false, busy = false, danger = false, returnFocusRef }: {
  visible: boolean; title: string; message: string; confirmLabel: string; onConfirm(): void; onCancel(): void;
  cancelLabel?: string; confirmDisabled?: boolean; busy?: boolean; danger?: boolean; returnFocusRef?: RefObject<ComponentRef<typeof View> | null>;
}) {
  const { color } = useUiTheme();
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const wasVisible = useRef(false);
  useEffect(() => {
    if (wasVisible.current && !visible && returnFocusRef?.current) {
      const handle = findNodeHandle(returnFocusRef.current);
      if (typeof handle === "number") AccessibilityInfo.setAccessibilityFocus(handle);
    }
    wasVisible.current = visible;
  }, [visible, returnFocusRef]);
  const focusHeading = () => {
    const handle = findNodeHandle(heading.current);
    if (typeof handle === "number") AccessibilityInfo.setAccessibilityFocus(handle);
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} onShow={focusHeading}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal onAccessibilityEscape={onCancel} style={[styles.dialog, { backgroundColor: color.surface }]}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.dialogContent}>
          <Text ref={heading} allowFontScaling accessibilityRole="header" style={[styles.title, { color: color.foreground }]}>{title}</Text>
          <Body>{message}</Body>
          <Action title={cancelLabel} secondary onPress={onCancel} />
          <Action title={confirmLabel} disabled={confirmDisabled} loading={busy} danger={danger} onPress={onConfirm} />
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

export function StateView({ kind, title, message, onRetry, retryLabel = "Try again" }: {
  kind: "loading" | "empty" | "offline" | "error" | "denied" | "forbidden"; title?: string; message?: string; onRetry?: () => void; retryLabel?: string;
}) {
  const { color } = useUiTheme();
  const titles = { loading: "Loading your workspace", empty: "Nothing here yet", offline: "You are offline", error: "Something went wrong",
    denied: "Access unavailable", forbidden: "You do not have access" };
  return <View accessibilityLiveRegion="polite" accessibilityState={{ busy: kind === "loading" }}>
    <Card title={title ?? titles[kind]}>
      {kind === "loading" ? <ActivityIndicator color={color.foreground} accessibilityLabel={title ?? titles.loading} /> : null}
      {message ? <Text allowFontScaling accessibilityRole={kind === "error" || kind === "forbidden" ? "alert" : "text"}
        style={[styles.body, { color: color.foreground }]}>{message}</Text> : null}
      {onRetry ? <Action title={retryLabel} onPress={onRetry} /> : null}
    </Card>
  </View>;
}

export function DataTable({ columns, rows, emptyMessage = "No records found." }: {
  columns: readonly string[]; rows: readonly { key: string; cells: readonly ReactNode[] }[]; emptyMessage?: string;
}) {
  const { color } = useUiTheme();
  if (!rows.length) return <Body>{emptyMessage}</Body>;
  return <ScrollView horizontal accessibilityLabel="Records table">
    <View>
      <View style={[styles.tableRow, { borderColor: color.border, backgroundColor: color.surfaceMuted }]}>{columns.map(column =>
        <Text allowFontScaling key={column} style={[styles.cell, styles.label, { color: color.foreground }]}>{column}</Text>)}</View>
      {rows.map(row => <View key={row.key} style={[styles.tableRow, { borderColor: color.border }]}>{row.cells.map((cell, index) =>
        <View key={index} style={styles.cell}>{typeof cell === "string" || typeof cell === "number"
          ? <Text allowFontScaling accessibilityLabel={columns[index] ? `${columns[index]}: ${cell}` : undefined}
            style={[styles.body, { color: color.foreground }]}>{cell}</Text> : cell}</View>)}</View>)}
    </View>
  </ScrollView>;
}
/** The caller supplies exact display text for values scaled for chart geometry. */
export function BarChart({ label, points }: { label: string; points: readonly { label: string; value: number; displayValue?: string }[] }) {
  const { color } = useUiTheme();
  const values = points.map(point => Number.isFinite(point.value) ? Math.max(0, point.value) : 0);
  const maximum = Math.max(1, ...values);
  return <View accessibilityLabel={label} style={styles.chart}>
    <Text allowFontScaling accessibilityRole="header" style={[styles.title, { color: color.foreground }]}>{label}</Text>
    {points.map((point, index) => {
      const label = `${point.label}: ${point.displayValue ?? values[index]}`;
      return <View key={point.label} accessible accessibilityLabel={label}>
        <Text allowFontScaling style={[styles.body, { color: color.foreground }]}>{label}</Text>
        <View style={[styles.track, { backgroundColor: color.surfaceMuted }]}>
          <View style={[styles.bar, { width: `${values[index] / maximum * 100}%`, backgroundColor: color.accentForeground }]} />
        </View>
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  page: { padding: foundationTokens.spacing.md, gap: foundationTokens.spacing.md, paddingBottom: foundationTokens.spacing.xl + foundationTokens.spacing.md,
    width: "100%", maxWidth: foundationTokens.density.pageMaxWidth, alignSelf: "center", flexGrow: 1 },
  heading: { ...foundationTokens.typography.heading, flexShrink: 1 },
  title: { ...foundationTokens.typography.title, flexShrink: 1 },
  body: { ...foundationTokens.typography.body, flexShrink: 1 },
  label: { ...foundationTokens.typography.label, flexShrink: 1 },
  card: { borderRadius: foundationTokens.radius.md, padding: foundationTokens.spacing.md, gap: foundationTokens.spacing.sm,
    borderWidth: 1, minWidth: 0 },
  action: { borderRadius: foundationTokens.radius.md, paddingHorizontal: foundationTokens.spacing.md,
    paddingVertical: foundationTokens.spacing.sm, minHeight: foundationTokens.density.touchTarget,
    minWidth: foundationTokens.density.touchTarget, justifyContent: "center", borderWidth: 3, gap: foundationTokens.spacing.xs },
  actionText: { ...foundationTokens.typography.body, fontWeight: "600", textAlign: "center", flexShrink: 1 },
  field: { gap: foundationTokens.spacing.xs, minWidth: 0 },
  input: { ...foundationTokens.typography.body, minHeight: foundationTokens.density.touchTarget, borderWidth: 3,
    borderRadius: foundationTokens.radius.md, paddingHorizontal: foundationTokens.spacing.sm, paddingVertical: foundationTokens.spacing.sm },
  badge: { alignSelf: "flex-start", borderRadius: foundationTokens.radius.md,
    paddingHorizontal: foundationTokens.spacing.sm, paddingVertical: foundationTokens.spacing.xxs, maxWidth: "100%" },
  status: { borderRadius: foundationTokens.radius.md, padding: foundationTokens.spacing.sm },
  overlay: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: foundationTokens.spacing.md },
  dialog: { borderRadius: foundationTokens.radius.md, maxHeight: "90%", maxWidth: foundationTokens.density.dialogMaxWidth,
    width: "100%", alignSelf: "center" },
  dialogContent: { padding: foundationTokens.spacing.lg, gap: foundationTokens.spacing.md },
  tableRow: { flexDirection: "row", borderBottomWidth: 1 }, cell: { width: 165, padding: foundationTokens.spacing.sm, justifyContent: "center" },
  chart: { gap: foundationTokens.spacing.sm },
  track: { height: 12, borderRadius: foundationTokens.radius.sm }, bar: { height: 12, borderRadius: foundationTokens.radius.sm }
});
