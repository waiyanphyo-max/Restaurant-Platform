import { useRouter } from "expo-router";
import { Image } from "react-native";
import { getCustomerPublicApi } from "../../api";
import { Action, Body, Card, Page, StateView } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { readEmbeddedTenant } from "../../tenant";
import { homeAddress, useCustomerAccount } from "../profile/AccountProvider";

export function HomeScreen() {
  const tenant = readEmbeddedTenant();
  const router = useRouter();
  const account = useCustomerAccount();
  const menu = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }), "home-storefront");
  const address = account.state.status === "ready" ? homeAddress(account.state.data.addresses) : undefined;
  return <Page title={`Welcome to ${tenant.branding.displayName}`} subtitle="Fresh choices from your favorite restaurant.">
    {menu.state.status === "ready" ? <Card title={menu.state.data.restaurantName}>
      {menu.state.data.description ? <Body>{menu.state.data.description}</Body> : null}
      {menu.state.data.address ? <Body>{menu.state.data.address}</Body> : null}
      <Action title="Explore the menu" onPress={() => router.navigate("/menu")} />
    </Card> : <StateView kind={menu.state.status} onRetry={menu.reload} />}
    {account.state.status === "ready" ? <Card title="Your Home Address"><Body>{address ? [address.street, address.township, address.city].filter(Boolean).join(", ") : "Set up an address now or add it later from Profile."}</Body>
      <Action title={address ? "Change Home Address" : "Set up Home Address"} secondary onPress={() => account.editAddress(address)} />
    </Card> : <StateView kind={account.state.status} title="Home Address" onRetry={account.reload} />}
  </Page>;
}
export function MenuScreen() {
  const query = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }), "menu");
  return <Page title="Menu" subtitle="Explore what is cooking. Ordering will be available in a future update." onRefresh={query.reload}>
    {query.state.status !== "ready" ? <StateView kind={query.state.status} onRetry={query.reload} /> : <>
      {!query.state.data.categories.some(category => category.products.length) ? <Card title="Menu coming soon"><Body>Check back for this restaurant’s menu.</Body></Card> : null}
      {query.state.data.categories.map(category => <Card key={category.id} title={category.name}>
        {category.products.map(product => <Card key={product.id} title={product.name}>
          {product.imageUrl ? <Image source={{ uri: product.imageUrl }} accessibilityLabel={product.name} style={{ height: 150, borderRadius: 10 }} resizeMode="cover" /> : null}
          {product.description ? <Body>{product.description}</Body> : null}
          <Body>{product.price == null ? "Select a variant" : `${product.price.toLocaleString()} ${query.state.status === "ready" ? query.state.data.currency : ""}`}{product.available ? "" : " · Unavailable"}</Body>
          {product.variants.map(variant => <Body key={variant.id}>{variant.name}: {variant.price ?? "—"}{variant.available ? "" : " · Unavailable"}</Body>)}
        </Card>)}
      </Card>)}
    </>}
  </Page>;
}
