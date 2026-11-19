import { Link, Redirect, Slot, usePathname } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOperationsAuth } from "../../src/auth/AuthProvider";
import { getNavigationItems } from "../../src/navigation/policy";
import { readEmbeddedTenant } from "../../src/tenant";
import { WorkspaceBoundary } from "../../src/auth/WorkspaceBoundary";
import { RuntimeBrandingProvider, useRuntimeBranding } from "../../src/branding/RuntimeBrandingProvider";
import { useUiTheme } from "../../src/components/ui";

export default function WorkspaceLayout() {
  return <RuntimeBrandingProvider><WorkspaceBoundary><WorkspaceContent /></WorkspaceBoundary></RuntimeBrandingProvider>;
}

function WorkspaceContent() {
  const { state } = useOperationsAuth();
  const pathname = usePathname();
  const { color } = useUiTheme();
  const { displayName, logoUrl } = useRuntimeBranding();
  if (state.status !== "ready") return <Redirect href="/" />;
  const tenant = readEmbeddedTenant();
  const navigation = getNavigationItems(state.membership, tenant.restaurantId);
  return <SafeAreaView style={[styles.screen, { backgroundColor: color.background }]}>
    <View style={[styles.header, { backgroundColor: color.primary }]}>
      {logoUrl ? <Image source={{ uri: logoUrl }} accessibilityLabel={`${displayName} logo`} style={styles.logo} /> : null}
      <View style={styles.identity}><Text allowFontScaling style={[styles.name, { color: color.onPrimary }]}>{displayName}</Text>
        <Text allowFontScaling style={{ color: color.onPrimary }}>{state.membership.role.replaceAll("_", " ")}{tenant.environment !== "production" ? ` · ${tenant.environment}` : ""}</Text></View>
    </View>
    <View><ScrollView horizontal contentContainerStyle={styles.navigation} showsHorizontalScrollIndicator={false}>
      {navigation.map(item => <Link key={item.id} href={item.path} accessibilityRole="link"
        accessibilityState={{ selected: pathname === item.path }} style={[styles.link, { color: color.foreground }, pathname === item.path ? [styles.selected, { backgroundColor: color.surfaceMuted }] : null]}>{item.label}</Link>)}
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
