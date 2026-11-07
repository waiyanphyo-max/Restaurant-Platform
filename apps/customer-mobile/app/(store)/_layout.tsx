import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import { useCustomerAuth } from "../../src/auth/AuthProvider";
import { CustomerCartProvider } from "../../src/features/cart/CartProvider";
import { CustomerCheckoutProvider, useCustomerCheckout } from "../../src/features/checkout/CheckoutProvider";
import { CustomerAccountProvider } from "../../src/features/profile/AccountProvider";
import { useCustomerText } from "../../src/i18n";
import { readEmbeddedTenant } from "../../src/tenant";

const destinations = ["home", "menu", "cart", "orders", "profile"] as const;
export default function StoreLayout() {
  const { state } = useCustomerAuth();
  if (state.status !== "signed_in") return <Redirect href="/" />;
  return <CustomerAccountProvider key={state.userId}>
    <CustomerCartProvider>
      <CustomerCheckoutProvider owner={state.userId}><StoreNavigation /></CustomerCheckoutProvider>
    </CustomerCartProvider>
  </CustomerAccountProvider>;
}

function StoreNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useCustomerText();
  const { state: checkout } = useCustomerCheckout();
  const hasReceipt = checkout.status === "uncertain" || checkout.status === "created" ||
    checkout.status === "recovery_pending" || checkout.status === "unrecorded";
  const labels = { home: t("Home", "ပင်မ"), menu: t("Menu", "မီနူး"), cart: t("Cart", "ခြင်းတောင်း"),
    orders: t("Orders", "မှာယူမှုများ"), profile: t("Profile", "ပရိုဖိုင်") };
  const tenant = readEmbeddedTenant();
  const brand = resolveBrandTokens(tenant.branding);
  return <SafeAreaView style={styles.screen}>
    <View style={[styles.header, { backgroundColor: brand.primaryColor }]}>
      {tenant.branding.logoUrl ? <Image source={{ uri: tenant.branding.logoUrl }} accessibilityLabel={`${tenant.branding.displayName} logo`} style={styles.logo} /> : null}
      <Text style={[styles.name, { color: brand.onPrimaryColor }]}>{tenant.branding.displayName}</Text>
    </View>
    {hasReceipt && pathname !== "/checkout" ? <Pressable accessibilityRole="button" style={styles.receipt}
      onPress={() => router.navigate("/checkout")}>
      <Text style={styles.label}>{t("Review your recent checkout", "မကြာသေးမီက ငွေရှင်းမှုကို စစ်ဆေးရန်")}</Text>
    </Pressable> : null}
    <View style={styles.content}><Slot /></View>
    <View style={styles.tabs}>{destinations.map(destination => <Pressable key={destination} accessibilityRole="tab" accessibilityLabel={destination}
      accessibilityState={{ selected: pathname === `/${destination}` }} onPress={() => router.navigate(`/${destination}`)}
      style={[styles.tab, pathname === `/${destination}` ? { borderTopColor: brand.primaryColor } : null]}>
      <Text style={[styles.label, { color: pathname === `/${destination}` ? brand.primaryColor : "#526174" }]}>{labels[destination]}</Text>
    </Pressable>)}</View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#f6f8fa" }, header: { padding: 18, flexDirection: "row", gap: 12, alignItems: "center" }, name: { fontSize: 22, fontWeight: "700", flex: 1 }, logo: { width: 40, height: 40, borderRadius: 8 }, content: { flex: 1 }, receipt: { padding: 12, backgroundColor: "#dbeafe" }, tabs: { flexDirection: "row", backgroundColor: "white", borderTopWidth: 1, borderColor: "#e2e8f0" }, tab: { flex: 1, minHeight: 56, justifyContent: "center", borderTopWidth: 3, borderTopColor: "transparent" }, label: { textAlign: "center", fontWeight: "600", fontSize: 13 } });
