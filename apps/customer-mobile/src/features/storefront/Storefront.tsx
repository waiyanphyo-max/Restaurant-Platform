import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, SectionList, StyleSheet, View, useWindowDimensions } from "react-native";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { Action, Badge, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { FoodMedia } from "../../components/FoodMedia";
import { accountFailureTitle, apiFailureMessage } from "../../hooks/apiFailure";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../i18n";
import { useRuntimeBranding } from "../../branding/RuntimeBrandingProvider";
import { productAvailable, productPriceRange } from "../cart/cart";
import { useCustomerCart } from "../cart/CartProvider";
import { homeAddress, useCustomerAccount } from "../profile/AccountProvider";
import { usePublicMenu } from "./MenuProvider";
import { featuredProduct, filterMenu, formatMoney } from "./presentation";

export function HomeScreen() {
  const { displayName, refresh } = useRuntimeBranding();
  const account = useCustomerAccount();
  const router = useRouter();
  const t = useCustomerText();
  const menu = usePublicMenu();
  const data = menu.state.status === "ready" ? menu.state.data : undefined;
  const address = account.state.status === "ready"
    ? account.state.data.addresses.find(item => item.isDefault) ?? homeAddress(account.state.data.addresses) : undefined;
  const featured = menu.state.status === "ready" ? featuredProduct(menu.state.data) : undefined;
  return <Page title={t("What sounds good?", "ဘာစားချင်ပါသလဲ။")}
    onRefresh={() => { menu.reload(); void refresh(); }}
    subtitle={t(`Welcome to ${displayName}`, `${displayName} မှ ကြိုဆိုပါတယ်`)}>
    {account.state.status === "ready" ? <Card title={t("Deliver to", "ပို့ဆောင်မည့် လိပ်စာ")}>
      <Body>{address ? [address.label, address.street, address.township, address.city].filter(Boolean).join(" · ")
        : t("Choose a delivery address", "ပို့ဆောင်မည့် လိပ်စာ ရွေးပါ")}</Body>
      <Action title={address ? t("Change address", "လိပ်စာ ပြင်ရန်") : t("Add an address", "လိပ်စာ ထည့်ရန်")}
        secondary onPress={() => account.editAddress(address)} />
    </Card> : <StateView kind={account.state.status} title={account.state.status === "error" ? accountFailureTitle(account.state.failure, t) : queryStateLabel(account.state.status, t)}
      message={account.state.status === "loading" ? undefined : apiFailureMessage(account.state.failure, t)} onRetry={account.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />}
    <Card title={t("Fresh from the kitchen", "မီးဖိုချောင်မှ လတ်လတ်ဆတ်ဆတ်")}>
      <Body tone="muted">{t("Choose your meal. Review delivery availability at checkout.", "အစားအစာ ရွေးပါ။ ပို့ဆောင်နိုင်မှုကို ငွေရှင်းချိန်တွင် စစ်ဆေးပါ။")}</Body>
      {menu.state.status === "ready" && menu.state.data.description ? <Body>{menu.state.data.description}</Body> : null}
      <Action title={t("Explore the menu", "မီနူးကြည့်ရန်")} onPress={() => router.navigate("/menu")} />
    </Card>
    {menu.state.status === "ready" ? <>
      {featured ? <><Body accessibilityRole="header" style={styles.sectionTitle}>{t("Featured for you", "အထူးရွေးချယ်ထားသည်")}</Body>
        <ProductCard product={featured} menu={menu.state.data} featured /></> : null}
      <Body accessibilityRole="header" style={styles.sectionTitle}>{t("Our food", "ကျွန်ုပ်တို့၏ အစားအစာများ")}</Body>
      {menu.state.data.categories.flatMap(category => category.products).slice(0, 6).map(product =>
        <ProductCard key={product.id} product={product} menu={data!} />)}
      {menu.state.data.categories.every(category => category.products.length === 0)
        ? <StateView kind="empty" title={t("Menu coming soon", "မီနူး မကြာမီ ရရှိပါမည်")} /> : null}
    </> : <StateView kind={menu.state.status} title={queryStateLabel(menu.state.status, t)} onRetry={menu.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />}
    <CartEntry />
  </Page>;
}

export function MenuScreen() {
  const { refresh } = useRuntimeBranding();
  const t = useCustomerText();
  const [search, setSearch] = useState("");
  const { fontScale } = useWindowDimensions();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const query = usePublicMenu();
  const categories = query.state.status === "ready" ? query.state.data.categories : undefined;
  useEffect(() => {
    if (categories && categoryId && !categories.some(category => category.id === categoryId)) setCategoryId(null);
  }, [categories, categoryId]);
  const title = t("Menu", "မီနူး");
  if (query.state.status !== "ready") return <Page title={title}>
    <StateView kind={query.state.status} title={queryStateLabel(query.state.status, t)} onRetry={query.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />
  </Page>;

  const menu = query.state.data;
  const activeCategory = menu.categories.some(category => category.id === categoryId) ? categoryId : null;
  const matches = filterMenu(menu, search, activeCategory);
  const featured = featuredProduct(menu, matches);
  const reset = () => { setSearch(""); setCategoryId(null); };
  const header = <View style={styles.listHeader}>
    <FormField label={t("Search the menu", "မီနူးတွင် ရှာရန်")} placeholder={t("Product or category", "အစားအစာ သို့မဟုတ် အမျိုးအစား")}
      value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} />
    {menu.categories.length ? <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.categories}>
      <Action title={t("All categories", "အမျိုးအစား အားလုံး")} selected={activeCategory === null} secondary={activeCategory !== null} onPress={() => setCategoryId(null)} />
      {[...menu.categories].sort((a, b) => a.displayOrder - b.displayOrder).map(category => <Action key={category.id} title={category.name} selected={activeCategory === category.id}
        secondary={activeCategory !== category.id} onPress={() => setCategoryId(category.id)} />)}
    </ScrollView> : null}
    {featured ? <><Body accessibilityRole="header" style={styles.sectionTitle}>{t("Featured for you", "အထူးရွေးချယ်ထားသည်")}</Body>
      <ProductCard product={featured} menu={menu} featured /></> : null}
  </View>;
  return <Page title={title} scroll={false}>
    <SectionList style={styles.list} sections={matches.map(category => ({ ...category, data: category.products }))}
      keyExtractor={product => product.id} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      stickySectionHeadersEnabled={false} initialNumToRender={8} windowSize={5}
      refreshing={false} onRefresh={() => { query.reload(); void refresh(); }}
      ListHeaderComponent={header} contentContainerStyle={styles.listContent}
      renderSectionHeader={({ section }) => <Body accessibilityRole="header" style={styles.sectionTitle}>{section.name}</Body>}
      renderItem={({ item }) => <ProductCard product={item} menu={menu} />}
      ListFooterComponent={fontScale > 1.3 ? <CartEntry /> : undefined}
      ListEmptyComponent={<Card title={search || activeCategory ? t("No matching items", "ကိုက်ညီသည့် အစားအစာ မတွေ့ပါ") : t("Menu coming soon", "မီနူး မကြာမီ ရရှိပါမည်")}>
        {search || activeCategory ? <Action title={t("Clear search and filters", "ရှာဖွေမှုနှင့် စစ်ထုတ်မှုများ ရှင်းရန်")} secondary onPress={reset} /> : null}
      </Card>} />
    {fontScale <= 1.3 ? <CartEntry /> : null}
  </Page>;
}

function ProductCard({ product, menu, featured = false }: { product: MenuProductDto; menu: PublicMenuResponse; featured?: boolean }) {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const range = productPriceRange(product);
  const price = range ? range.min === range.max ? formatMoney(range.min, menu.currency, language)
    : `${range.min.toLocaleString(language)}–${formatMoney(range.max, menu.currency, language)}` : t("Price unavailable", "ဈေးနှုန်း မရရှိပါ");
  return <Card title={product.name}>
    <View style={styles.productRow}>
      <FoodMedia uri={product.imageUrl} label={product.name} />
      <View style={styles.productInfo}>
        {featured ? <Badge tone="accent">{t("Featured", "အထူးရွေးချယ်ထားသည်")}</Badge> : null}
        <Body style={styles.price}>{price}</Body>
        <Body tone={productAvailable(product) ? "muted" : "warning"}>{productAvailable(product) ? t("Available", "ရနိုင်သည်") : t("Unavailable", "လောလောဆယ် မရနိုင်ပါ")}</Body>
      </View>
    </View>
    {product.description ? <Body tone="muted">{product.description}</Body> : null}
    <Action title={t("View item", "အစားအစာ အသေးစိတ်")} accessibilityHint={product.name} secondary
      onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: product.id } })} />
  </Card>;
}

function CartEntry() {
  const router = useRouter();
  const t = useCustomerText();
  const { lines } = useCustomerCart();
  const count = lines.reduce((sum, line) => sum + line.item.quantity, 0);
  return <Action title={`${t("View cart", "ခြင်းတောင်း ကြည့်ရန်")}${count ? ` · ${count}` : ""}`} onPress={() => router.navigate("/cart")} />;
}

const styles = StyleSheet.create({
  categories: { gap: foundationTokens.spacing.sm, paddingBottom: 4 }, list: { flex: 1 }, listHeader: { gap: 12 },
  listContent: { gap: 12, paddingBottom: 16 }, sectionTitle: { ...foundationTokens.typography.title, paddingTop: 4 },
  productRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, productInfo: { flex: 1, minWidth: 0, gap: 4 },
  price: { fontWeight: "600" }
});
