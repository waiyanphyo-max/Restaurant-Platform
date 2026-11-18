import { Switch, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { Action, Body } from "./ui";

export function FormToggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: foundationTokens.spacing.sm,
    minHeight: foundationTokens.density.touchTarget }}>
    <View style={{ flex: 1 }}><Body>{label}</Body></View>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} hitSlop={foundationTokens.spacing.md} />
  </View>;
}
export function Choices({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange(value: string): void }) {
  return <View style={{ gap: 8 }}><Body>{label}</Body><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
    {values.map(option => <Action key={option} title={`${value === option ? "✓ " : ""}${option.replaceAll("_", " ")}`} secondary={value !== option} onPress={() => onChange(option)} />)}
  </View></View>;
}
export function MutationFeedback({ busy, error, message }: { busy: boolean; error: string | null; message: string | null }) {
  return <>{busy ? <Body accessibilityLiveRegion="polite">Saving…</Body> : null}
    {error ? <Body accessibilityRole="alert" tone="danger">{error}</Body> : null}
    {message ? <Body accessibilityLiveRegion="polite" tone="success">{message}</Body> : null}</>;
}
