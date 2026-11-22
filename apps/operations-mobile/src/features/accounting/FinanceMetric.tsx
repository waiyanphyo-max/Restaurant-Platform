import { StyleSheet, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { Body, useUiTheme } from "../../components/ui";
import { useOperationsText } from "../../navigation/OperationsLanguage";
import { salesAmount } from "./salesApi";

/** Exact source text is allowed to wrap; missing values never become zero. */
export function FinanceMetric({ label, amount, currency }: { label: string; amount: string | null | undefined; currency: string }) {
  const { color } = useUiTheme();
  const t = useOperationsText();
  const available = typeof amount === "string" && /^-?\d+$/.test(amount);
  return <View style={[styles.row, { borderColor: color.border }]}>
    <Body tone="muted" style={styles.label}>{label}</Body>
    <Body style={styles.amount}>{available ? `${salesAmount(amount)} ${currency}` : t("Unavailable", "မရရှိနိုင်ပါ")}</Body>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: foundationTokens.spacing.sm, paddingVertical: foundationTokens.spacing.xs, borderBottomWidth: 1 },
  label: { flexGrow: 1, flexBasis: 180, minWidth: 0 },
  amount: { fontWeight: "600", flexShrink: 1, minWidth: 0, maxWidth: "100%" },
});
