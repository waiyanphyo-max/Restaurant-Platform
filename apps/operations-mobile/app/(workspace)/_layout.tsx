import { Link, Redirect, Slot, usePathname } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { useOperationsAuth } from "../../src/auth/AuthProvider";
import { getNavigationItems } from "../../src/navigation/policy";
import { readEmbeddedTenant } from "../../src/tenant";

export default function WorkspaceLayout() {
  const { state } = useOperationsAuth();
  const pathname = usePathname();
  if (state.status !== "ready") return <Redirect href="/" />;
  const tenant = readEmbeddedTenant();
  const brand = resolveBrandTokens(tenant.branding);
  const navigation = getNavigationItems(state.membership, tenant.restaurantId);
  return <SafeAreaView style={styles.screen}>
    <View style={[styles.header, { backgroundColor: brand.primaryColor }]}>
      {tenant.branding.logoUrl ? <Image source={{ uri: tenant.branding.logoUrl }} accessibilityLabel={`${tenant.branding.displayName} logo`} style={styles.logo} /> : null}
      <View style={styles.identity}><Text style={[styles.name, { color: brand.onPrimaryColor }]}>{tenant.branding.displayName}</Text>
        <Text style={{ color: brand.onPrimaryColor }}>{state.membership.role.replaceAll("_", " ")}{tenant.environment !== "production" ? ` · ${tenant.environment}` : ""}</Text></View>
    </View>
    <View><ScrollView horizontal contentContainerStyle={styles.navigation} showsHorizontalScrollIndicator={false}>
      {navigation.map(item => <Link key={item.id} href={item.path} accessibilityRole="link"
        accessibilityState={{ selected: pathname === item.path }} style={[styles.link, pathname === item.path ? styles.selected : null]}>{item.label}</Link>)}
    </ScrollView></View>
    <View style={styles.content} key={`${state.userId}:${state.membership.role}`}><Slot /></View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f8fa" }, header: { padding: 20, flexDirection: "row", gap: 12, alignItems: "center" },
  identity: { flex: 1, gap: 4 }, name: { fontSize: 23, fontWeight: "700" }, logo: { width: 44, height: 44, borderRadius: 8 },
  navigation: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 }, link: { padding: 12, color: "#334155", borderRadius: 8, minHeight: 48 },
  selected: { backgroundColor: "#e2e8f0", fontWeight: "700" }, content: { flex: 1 }
});
