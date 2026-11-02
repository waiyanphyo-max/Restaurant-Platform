import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, DataTable, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { operationalAmount } from "./format";

export function MenuScreen() {
  const query = useApiQuery(signal => getOperationsApi().listProducts({ signal }), "menu-products");
  return <Page title="Menu" subtitle="Products and current availability">
    <QueryResult {...query}>{products => <Card><DataTable columns={["Product", "Price", "Availability"]} rows={products.map(product => ({ key: product.id,
      cells: [product.name, product.price === null ? "Variant pricing" : operationalAmount(product.price), product.available ? "Available" : "Unavailable"] }))} />
      <Action title="Refresh menu" secondary onPress={query.reload} /></Card>}</QueryResult>
  </Page>;
}

export function TeamScreen() {
  const query = useApiQuery(signal => getOperationsApi().listMembers({ signal }), "team-members");
  return <Page title="Team" subtitle="Current restaurant members">
    <QueryResult {...query}>{members => <Card><DataTable columns={["Name", "Email", "Role"]} rows={members.map(member => ({ key: member.id,
      cells: [member.fullName ?? "Name unavailable", member.email ?? "Email unavailable", member.role.replaceAll("_", " ")] }))} />
      <Action title="Refresh team" secondary onPress={query.reload} /></Card>}</QueryResult>
  </Page>;
}

export function SettingsScreen() {
  const query = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "restaurant-settings");
  return <Page title="Settings" subtitle="Restaurant configuration">
    <QueryResult {...query}>{settings => <Card title="Restaurant preferences">
      <Body>Currency: {settings.currency}</Body><Body>Timezone: {settings.timezone}</Body>
      <Body>Accepting orders: {settings.acceptsOrders ? "Yes" : "No"}</Body>
      <Body>QR ordering: {settings.allowQrOrder ? "Enabled" : "Disabled"}</Body>
      <Body>Delivery: {settings.allowDelivery ? "Enabled" : "Disabled"}</Body>
      <Body>Takeaway: {settings.allowTakeaway ? "Enabled" : "Disabled"}</Body>
      <Action title="Refresh settings" secondary onPress={query.reload} />
    </Card>}</QueryResult>
  </Page>;
}
