import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { useCustomerAuth } from "../../src/auth/AuthProvider";
import { CustomerAccountProvider } from "../../src/features/profile/AccountProvider";
import { readEmbeddedTenant } from "../../src/tenant";

const destinations = ["home", "menu", "cart", "orders", "profile"] as const;
export default function StoreLayout() {
  const { state } = useCustomerAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (state.status !== "signed_in") return <Redirect href="/" />;
  const tenant = readEmbeddedTenant();
  const brand = resolveBrandTokens(tenant.branding);
  return <SafeAreaView style={styles.screen}>
    <View style={[styles.header, { backgroundColor: brand.primaryColor }]}>
      {tenant.branding.logoUrl ? <Image source={{ uri: tenant.branding.logoUrl }} accessibilityLabel={`${tenant.branding.displayName} logo`} style={styles.logo} /> : null}
      <Text style={[styles.name, { color: brand.onPrimaryColor }]}>{tenant.branding.displayName}</Text>
    </View>
    <CustomerAccountProvider key={state.userId}><View style={styles.content}><Slot /></View></CustomerAccountProvider>
    <View style={styles.tabs}>{destinations.map(destination => <Pressable key={destination} accessibilityRole="tab" accessibilityLabel={destination}
      accessibilityState={{ selected: pathname === `/${destination}` }} onPress={() => router.navigate(`/${destination}`)}
      style={[styles.tab, pathname === `/${destination}` ? { borderTopColor: brand.primaryColor } : null]}>
      <Text style={[styles.label, { color: pathname === `/${destination}` ? brand.primaryColor : "#526174" }]}>{destination[0].toUpperCase() + destination.slice(1)}</Text>
    </Pressable>)}</View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#f6f8fa" }, header: { padding: 18, flexDirection: "row", gap: 12, alignItems: "center" }, name: { fontSize: 22, fontWeight: "700", flex: 1 }, logo: { width: 40, height: 40, borderRadius: 8 }, content: { flex: 1 }, tabs: { flexDirection: "row", backgroundColor: "white", borderTopWidth: 1, borderColor: "#e2e8f0" }, tab: { flex: 1, minHeight: 56, justifyContent: "center", borderTopWidth: 3, borderTopColor: "transparent" }, label: { textAlign: "center", fontWeight: "600", fontSize: 13 } });
