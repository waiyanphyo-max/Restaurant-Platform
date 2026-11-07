import { useState } from "react";
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet } from "react-native";
import { getCustomerPublicApi } from "../../api";
import { Action, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import { productAvailable, productPriceRange } from "../cart/cart";
import { homeAddress, useCustomerAccount } from "../profile/AccountProvider";

export function HomeScreen() {
  const tenant = readEmbeddedTenant();
  const router = useRouter();
  const account = useCustomerAccount();
  const t = useCustomerText();
  const menu = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }), "home-storefront");
  const address = account.state.status === "ready" ? homeAddress(account.state.data.addresses) : undefined;
  const retry = t("Try again", "ထပ်ကြိုးစားပါ");
  return <Page title={t(`Welcome to ${tenant.branding.displayName}`, `${tenant.branding.displayName} မှ ကြိုဆိုပါတယ်`)}
    subtitle={t("Order your favorites for home delivery.", "နှစ်သက်ရာ အစားအစာများကို အိမ်အရောက် မှာယူပါ။")}>
    {menu.state.status === "ready" ? <Card title={menu.state.data.restaurantName}>
      {menu.state.data.description ? <Body>{menu.state.data.description}</Body> : null}
      {menu.state.data.address ? <Body>{menu.state.data.address}</Body> : null}
      <Action title={t("Explore the menu", "မီနူးကြည့်ရန်")} onPress={() => router.navigate("/menu")} />
    </Card> : <StateView kind={menu.state.status} title={queryStateLabel(menu.state.status, t)} onRetry={menu.reload} retryLabel={retry} />}
    {account.state.status === "ready" ? <Card title={t("Your Home Address", "သင့်အိမ်လိပ်စာ")}>
      <Body>{address ? [address.street, address.township, address.city].filter(Boolean).join(", ")
        : t("Set up an address now or add it later from Profile.", "ယခု လိပ်စာထည့်ပါ သို့မဟုတ် ပရိုဖိုင်တွင် နောက်မှ ထည့်နိုင်ပါသည်။")}</Body>
      <Action title={address ? t("Change Home Address", "အိမ်လိပ်စာ ပြင်ရန်") : t("Set up Home Address", "အိမ်လိပ်စာ ထည့်ရန်")}
        secondary onPress={() => account.editAddress(address)} />
    </Card> : <StateView kind={account.state.status} title={queryStateLabel(account.state.status, t)} onRetry={account.reload} retryLabel={retry} />}
  </Page>;
}

export function MenuScreen() {
  const router = useRouter();
  const language = useCustomerLanguage();
  const t = useCustomerText();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const query = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }), "menu");
  const title = t("Menu", "မီနူး");
  if (query.state.status !== "ready") return <Page title={title}>
    <StateView kind={query.state.status} title={queryStateLabel(query.state.status, t)} onRetry={query.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />
  </Page>;

  const { categories, currency } = query.state.data;
  const activeCategory = categories.some(category => category.id === categoryId) ? categoryId : null;
  const term = search.trim().toLocaleLowerCase(language);
  const matches = categories.filter(category => activeCategory === null || category.id === activeCategory)
    .map(category => ({ ...category, products: category.products.filter(product =>
      [product.name, product.description, category.name].some(text => text?.toLocaleLowerCase(language).includes(term))) }))
    .filter(category => category.products.length > 0);

  return <Page title={title} onRefresh={query.reload}>
    <FormField label={t("Search the menu", "မီနူးတွင် ရှာရန်")} placeholder={t("Product or category", "အစားအစာ သို့မဟုတ် အမျိုးအစား")}
      value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} />
    {categories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
      <Action title={t("All categories", "အမျိုးအစား အားလုံး")} selected={activeCategory === null} secondary={activeCategory !== null} onPress={() => setCategoryId(null)} />
      {categories.map(category => <Action key={category.id} title={category.name} selected={activeCategory === category.id}
        secondary={activeCategory !== category.id} onPress={() => setCategoryId(category.id)} />)}
    </ScrollView> : null}
    {matches.length === 0 ? <Card title={term || activeCategory ? t("No matching items", "ကိုက်ညီသည့် အစားအစာ မတွေ့ပါ")
      : t("Menu coming soon", "မီနူး မကြာမီ ရရှိပါမည်")} /> : null}
    {matches.map(category => <Card key={category.id} title={category.name}>
      {category.products.map(product => {
        const available = productAvailable(product);
        const range = productPriceRange(product);
        const price = range && [range.min, ...(range.min === range.max ? [] : [range.max])]
          .map(amount => amount.toLocaleString(language)).join("–");
        return <Card key={product.id} title={product.name}>
          {product.imageUrl ? <Image source={{ uri: product.imageUrl }} accessibilityLabel={product.name} style={styles.image} resizeMode="cover" /> : null}
          {product.description ? <Body>{product.description}</Body> : null}
          {price ? <Body>{price} {currency}</Body> : null}
          {!available ? <Body>{t("Unavailable", "လောလောဆယ် မရနိုင်ပါ")}</Body> : null}
          <Action title={t("View item", "အစားအစာ အသေးစိတ်")} secondary onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: product.id } })} />
        </Card>;
      })}
    </Card>)}
  </Page>;
}

const styles = StyleSheet.create({ categories: { gap: 8 }, image: { height: 150, borderRadius: 10 } });
