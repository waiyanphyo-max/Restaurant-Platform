import { useEffect, useState } from "react";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOperationsAuth } from "../../src/auth/AuthProvider";
import { getNavigationItems, getValidatedRole, type NavigationItem } from "../../src/navigation/policy";
import { readEmbeddedTenant } from "../../src/tenant";
import { WorkspaceBoundary } from "../../src/auth/WorkspaceBoundary";
import { RuntimeBrandingProvider, useRuntimeBranding } from "../../src/branding/RuntimeBrandingProvider";
import { useUiTheme } from "../../src/components/ui";
import { OperationsLanguageProvider, useOperationsLanguage, useOperationsText } from "../../src/navigation/OperationsLanguage";
import { primarySelected, workspaceNavigation, type PrimaryDestination } from "../../src/navigation/presentation";
import { WorkspaceTools } from "../../src/navigation/WorkspaceTools";
import { DraftNavigationProvider } from "../../src/navigation/DraftNavigationProvider";
import { useDraftNavigation } from "../../src/hooks/useUnsavedChanges";
import { InvitationRecoveryProvider } from "../../src/features/management/InvitationRecoveryProvider";
import homeIcon from "../../assets/uxi/home.png";
import ordersIcon from "../../assets/uxi/orders.png";
import deliveryIcon from "../../assets/uxi/delivery.png";
import moreIcon from "../../assets/uxi/more.png";
import accountIcon from "../../assets/uxi/account.png";

const icons = { dashboard: homeIcon, orders: ordersIcon, deliveries: deliveryIcon, more: moreIcon,
  notifications: ordersIcon, profile: accountIcon };

export default function WorkspaceLayout() {
  return <RuntimeBrandingProvider><InvitationRecoveryProvider><OperationsLanguageProvider><DraftNavigationProvider><WorkspaceBoundary><WorkspaceContent /></WorkspaceBoundary></DraftNavigationProvider></OperationsLanguageProvider></InvitationRecoveryProvider></RuntimeBrandingProvider>;
}

function WorkspaceContent() {
  const { state } = useOperationsAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { requestNavigation } = useDraftNavigation();
  const { fontScale } = useWindowDimensions();
  const { color } = useUiTheme();
  const { displayName, logoUrl } = useRuntimeBranding();
  const [moreOpen, setMoreOpen] = useState(false);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const { language, setLanguage } = useOperationsLanguage();
  const t = useOperationsText();
  useEffect(() => { setMoreOpen(false); }, [pathname]);
  if (state.status !== "ready") return <Redirect href="/" />;
  const tenant = readEmbeddedTenant();
  const navigation = getNavigationItems(state.membership, tenant.restaurantId);
  const role = getValidatedRole(state.membership, tenant.restaurantId);
  if (!role) return null;
  const presentation = workspaceNavigation(navigation, role);
  const roleLabels = { OWNER: t("Owner", "ပိုင်ရှင်"), MANAGER: t("Manager", "မန်နေဂျာ"),
    STAFF: t("Staff", "ဝန်ထမ်း"), DELIVERY_DRIVER: t("Delivery driver", "ပို့ဆောင်သူ") };
  const labels: Partial<Record<PrimaryDestination, string>> = {
    dashboard: t("Today", "ယနေ့"), orders: t("Orders", "မှာယူမှု"),
    deliveries: role === "DELIVERY_DRIVER" ? t("Tasks", "တာဝန်များ") : t("Delivery", "ပို့ဆောင်ရေး"),
    notifications: t("Updates", "အသိပေးချက်"), profile: t("Account", "အကောင့်"), more: t("More", "အခြား"),
  };
  const navigate = (path: NavigationItem["path"]) => {
    if (path === pathname) { setMoreOpen(false); return; }
    requestNavigation(() => { setMoreOpen(false); router.navigate(path); });
  };
  return <SafeAreaView style={[styles.screen, { backgroundColor: color.background }]}>
    <KeyboardAvoidingView style={styles.content} behavior="height">
    <View style={[styles.header, { backgroundColor: color.background }]}>
      {logoUrl && logoUrl !== failedLogo ? <Image source={{ uri: logoUrl }} accessibilityLabel={`${displayName} logo`}
        onError={() => setFailedLogo(logoUrl)} resizeMode="contain" style={styles.logo} /> : null}
      <View style={styles.identity}><Text allowFontScaling style={[styles.name, { color: color.foreground }]}>{displayName}</Text>
        <Text allowFontScaling style={[styles.caption, { color: color.foregroundMuted }]}>{roleLabels[role]}{tenant.environment !== "production" ? ` · ${tenant.environment}` : ""}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Switch to Myanmar", "အင်္ဂလိပ်ဘာသာသို့ ပြောင်းရန်")}
        onPress={() => setLanguage(language === "en" ? "my" : "en")} style={[styles.language, { borderColor: color.borderStrong }]}>
        <Text allowFontScaling style={{ color: color.foreground }}>{language === "en" ? "မြန်မာ" : "English"}</Text>
      </Pressable>
    </View>
    <View style={styles.content} key={`${tenant.restaurantId}:${state.userId}:${role}`}>
      <View style={[styles.content, moreOpen ? styles.hidden : null]} pointerEvents={moreOpen ? "none" : "auto"}
        accessibilityElementsHidden={moreOpen} importantForAccessibility={moreOpen ? "no-hide-descendants" : "auto"}><Slot /></View>
      {moreOpen ? <WorkspaceTools items={navigation} role={role} navigate={navigate} close={() => setMoreOpen(false)} /> : null}
    </View>
    <ScrollView horizontal style={styles.navigation} contentContainerStyle={[styles.tabs, { backgroundColor: color.surface, borderColor: color.border }]}>
      {presentation.primary.map(destination => {
        const selected = primarySelected(destination, pathname, moreOpen);
        return <Pressable key={destination} accessibilityRole="tab" accessibilityLabel={labels[destination]}
          accessibilityState={{ selected }} onPress={() => destination === "more" ? setMoreOpen(true) : navigate(`/${destination}`)}
          style={[styles.tab, { minWidth: 64 * Math.max(1, fontScale), backgroundColor: selected ? color.secondary : color.surface }]}>
          <Image source={icons[destination as keyof typeof icons]} accessible={false} resizeMode="contain"
            style={[styles.icon, { tintColor: selected ? color.onSecondary : color.foregroundMuted }]} />
          <Text allowFontScaling style={[styles.caption, styles.tabLabel, { color: selected ? color.onSecondary : color.foregroundMuted }]}>{labels[destination]}</Text>
        </Pressable>;
      })}
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  identity: { flex: 1, minWidth: 120, gap: 4 }, name: { ...foundationTokens.typography.label, flexShrink: 1 },
  caption: { ...foundationTokens.typography.caption, flexShrink: 1 }, logo: { width: 44, height: 44, borderRadius: 8 },
  language: { minHeight: 48, minWidth: 48, borderWidth: 1, borderRadius: 12, padding: 8, justifyContent: "center" },
  navigation: { flexGrow: 0, flexShrink: 0 }, tabs: { flexDirection: "row", flexGrow: 1, borderTopWidth: 1, gap: 4, padding: 8 },
  tab: { flexGrow: 1, flexBasis: 0, minHeight: 60, padding: 4, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12 },
  icon: { width: 24, height: 24 }, tabLabel: { textAlign: "center" }, content: { flex: 1 }, hidden: { display: "none" }
});
