import { StyleSheet, Switch, Text, View } from "react-native";
import { Action, Body } from "../../components/ui";

export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <View style={styles.toggle}><Text style={styles.label}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} /></View>;
}

export function Choices<T extends string>({ label, value, values, labels, onChange, disabled = false }: {
  label: string; value: T; values: readonly T[]; labels?: Partial<Record<T, string>>; onChange(value: NoInfer<T>): void; disabled?: boolean;
}) {
  return <View style={styles.choices}>
    <Body>{label}</Body>
    <View style={styles.row}>
      {values.map(item => <Action key={item} title={labels?.[item] ?? item.replaceAll("_", " ")}
        selected={value === item} secondary={value !== item} disabled={disabled} onPress={() => onChange(item)} />)}
    </View>
  </View>;
}

export function FormStatus({ error, message }: { error?: string | null; message?: string | null }) {
  return <>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}</>;
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  label: { flex: 1, fontSize: 15, color: "#334155" },
  choices: { gap: 8 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { color: "#b91c1c", fontSize: 15, lineHeight: 23 }, success: { color: "#166534", fontSize: 15, lineHeight: 23 }
});
