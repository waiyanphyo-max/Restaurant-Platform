import { StatusBar, StyleSheet, Text, View } from "react-native";
import { foundationTokens, resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { readEmbeddedTenant } from "./tenant";
import { AuthPanel } from "./auth/AuthPanel";

const tenant = readEmbeddedTenant();
const brand = resolveBrandTokens(tenant.branding);

export default function App() {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { backgroundColor: brand.primaryColor }]}>
        <Text style={[styles.restaurant, { color: brand.onPrimaryColor }]}>{tenant.branding.displayName}</Text>
        <Text style={[styles.subtitle, { color: brand.onPrimaryColor }]}>Operations Android foundation</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Restaurant operations</Text>
        <Text style={styles.body}>Owner, Manager, Staff, and Driver workflows will use this restaurant-locked application.</Text>
        <Text style={styles.note}>Operational screens will be added after backend membership and permission checks are integrated.</Text>
        <AuthPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  header: { padding: foundationTokens.spacing.lg, paddingTop: foundationTokens.spacing.xl },
  restaurant: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: foundationTokens.spacing.sm },
  content: { padding: foundationTokens.spacing.lg },
  title: { fontSize: 20, fontWeight: "700", color: "#18222E" },
  body: { fontSize: 16, lineHeight: 24, marginTop: foundationTokens.spacing.md, color: "#334455" },
  note: { fontSize: 14, lineHeight: 21, marginTop: foundationTokens.spacing.lg, color: "#506070" }
});
