import { StyleSheet, Switch, View } from "react-native";
import { Action, Body, Status, useUiTheme } from "../../components/ui";

export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  const { color } = useUiTheme();
  return <View style={styles.toggle}><Body style={styles.label}>{label}</Body><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: color.primary }} /></View>;
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
  return <>{error ? <Status tone="danger">{error}</Status> : null}{message ? <Status tone="success">{message}</Status> : null}</>;
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, minHeight: 48 },
  label: { flex: 1 },
  choices: { gap: 8 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
