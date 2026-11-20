import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCustomerAuth } from "../../src/auth/AuthProvider";
import { CustomerCartProvider, useCustomerCart } from "../../src/features/cart/CartProvider";
import { CustomerCheckoutProvider, useCustomerCheckout } from "../../src/features/checkout/CheckoutProvider";
import { CustomerAccountProvider } from "../../src/features/profile/AccountProvider";
import { useCustomerText } from "../../src/i18n";
import { useRuntimeBranding } from "../../src/branding/RuntimeBrandingProvider";
import { useUiTheme } from "../../src/components/ui";
import { BrandLogo } from "../../src/components/FoodMedia";
import { CustomerMenuProvider } from "../../src/features/storefront/MenuProvider";
import homeIcon from "../../assets/uxi/home.png";
import menuIcon from "../../assets/uxi/menu.png";
import cartIcon from "../../assets/uxi/cart.png";
import ordersIcon from "../../assets/uxi/orders.png";
import accountIcon from "../../assets/uxi/account.png";

const destinations = ["home", "menu", "cart", "orders", "profile"] as const;
const icons = { home: homeIcon, menu: menuIcon, cart: cartIcon, orders: ordersIcon, profile: accountIcon };
export default function StoreLayout() {
  const { state } = useCustomerAuth();
  if (state.status !== "signed_in") return <Redirect href="/" />;
  return <CustomerAccountProvider key={state.userId}>
    <CustomerCartProvider>
      <CustomerCheckoutProvider owner={state.userId}><CustomerMenuProvider><StoreNavigation /></CustomerMenuProvider></CustomerCheckoutProvider>
    </CustomerCartProvider>
  </CustomerAccountProvider>;
}

function StoreNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useCustomerText();
  const { fontScale } = useWindowDimensions();
  const { lines } = useCustomerCart();
  const count = lines.reduce((sum, line) => sum + line.item.quantity, 0);
  const { state: checkout } = useCustomerCheckout();
  const hasReceipt = checkout.status === "uncertain" || checkout.status === "created" ||
    checkout.status === "recovery_pending" || checkout.status === "unrecorded";
  const labels = { home: t("Home", "ပင်မ"), menu: t("Menu", "မီနူး"), cart: t("Cart", "ခြင်းတောင်း"),
    orders: t("Orders", "မှာယူမှုများ"), profile: t("Account", "အကောင့်") };
  const { displayName, logoUrl: logo } = useRuntimeBranding();
  const { color } = useUiTheme();
  return <SafeAreaView style={[styles.screen, { backgroundColor: color.background }]}>
    <KeyboardAvoidingView style={styles.content} behavior="height">
    <View style={[styles.header, { backgroundColor: color.background }]}>
      <BrandLogo uri={logo} label={t(`${displayName} logo`, `${displayName} အမှတ်တံဆိပ်`)} />
      <Text allowFontScaling style={[styles.name, { color: color.foreground }]}>{displayName}</Text>
    </View>
    {hasReceipt && pathname !== "/checkout" ? <Pressable accessibilityRole="button" accessibilityLiveRegion="polite"
      accessibilityLabel={t("Review your recent checkout", "မကြာသေးမီက ငွေရှင်းမှုကို စစ်ဆေးရန်")}
      style={[styles.receipt, { backgroundColor: color.warningSurface, borderColor: color.warningForeground }]}
      onPress={() => router.navigate("/checkout")}>
      <Text allowFontScaling style={[styles.label, { color: color.warningForeground }]}>{t("Review your recent checkout", "မကြာသေးမီက ငွေရှင်းမှုကို စစ်ဆေးရန်")}</Text>
    </Pressable> : null}
    <View style={styles.content}><Slot /></View>
    <ScrollView horizontal style={styles.navigation} contentContainerStyle={[styles.tabs, { backgroundColor: color.surface, borderColor: color.border }]}>
      {destinations.map(destination => {
        const selected = pathname === `/${destination}` || destination === "menu" && pathname.startsWith("/product/")
          || destination === "orders" && pathname.startsWith("/order/") || destination === "profile" && (pathname === "/address" || pathname === "/notifications");
        const label = `${labels[destination]}${destination === "cart" && count ? ` · ${count}` : ""}`;
        return <Pressable key={destination} accessibilityRole="tab" accessibilityLabel={label}
          accessibilityState={{ selected }} onPress={() => router.navigate(`/${destination}`)}
          style={[styles.tab, { minWidth: 64 * Math.max(1, fontScale), backgroundColor: selected ? color.secondary : color.surface }]}>
          <Image source={icons[destination]} accessible={false} resizeMode="contain" style={[styles.icon, { tintColor: selected ? color.onSecondary : color.foregroundMuted }]} />
          <Text allowFontScaling style={[styles.label, { color: selected ? color.onSecondary : color.foregroundMuted }]}>{label}</Text>
        </Pressable>;
      })}
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", gap: 12, alignItems: "center" },
  name: { ...foundationTokens.typography.label, flex: 1, flexShrink: 1 }, content: { flex: 1 },
  receipt: { padding: 12, borderWidth: 1, minHeight: 48, justifyContent: "center" }, navigation: { flexGrow: 0, flexShrink: 0 },
  tabs: { flexDirection: "row", flexGrow: 1, borderTopWidth: 1, gap: 4, padding: 8 },
  tab: { flexGrow: 1, flexBasis: 0, minHeight: 60, padding: 4, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12 },
  icon: { width: 24, height: 24 }, label: { ...foundationTokens.typography.caption, textAlign: "center", flexShrink: 1 } });
