import { StyleSheet, Text, View } from "react-native";
import { Action } from "../../components/ui";

export function FinancialPagination({ page, totalPages, onPageChange }: {
  page: number; totalPages: number; onPageChange(page: number): void;
}) {
  if (totalPages <= 1 && page === 0) return null;
  const hasNext = page + 1 < totalPages;
  const pageLabel = page < totalPages ? `Page ${page + 1} of ${totalPages}` : `Page ${page + 1}`;

  return <View style={styles.container}>
    <Text accessibilityLiveRegion="polite" style={styles.label}>{pageLabel}</Text>
    <View style={styles.actions}>
      <Action title="Previous page" secondary disabled={page === 0} onPress={() => onPageChange(page - 1)} />
      <Action title="Next page" secondary disabled={!hasNext} onPress={() => onPageChange(page + 1)} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 15, color: "#334155" }
});
