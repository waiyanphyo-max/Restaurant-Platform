import { Switch, Text, View } from "react-native";
import { Action, Body } from "./ui";

export function FormToggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
    <Text style={{ flex: 1, color: "#334155", fontSize: 15 }}>{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} />
  </View>;
}
export function Choices({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange(value: string): void }) {
  return <View style={{ gap: 8 }}><Body>{label}</Body><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
    {values.map(option => <Action key={option} title={`${value === option ? "✓ " : ""}${option.replaceAll("_", " ")}`} secondary={value !== option} onPress={() => onChange(option)} />)}
  </View></View>;
}
export function MutationFeedback({ busy, error, message }: { busy: boolean; error: string | null; message: string | null }) {
  return <>{busy ? <Body>Saving…</Body> : null}{error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c", fontSize: 15 }}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: "#166534", fontSize: 15 }}>{message}</Text> : null}</>;
}
