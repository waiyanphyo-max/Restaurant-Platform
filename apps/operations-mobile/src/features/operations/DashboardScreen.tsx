import { Link } from "expo-router";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { Body, Card, Page } from "../../components/ui";
import { readEmbeddedTenant } from "../../tenant";
import { getNavigationItems } from "../../navigation/policy";

export function DashboardScreen() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready") return null;
  const navigation = getNavigationItems(state.membership, readEmbeddedTenant().restaurantId);
  return <Page title="Dashboard" subtitle={`Welcome to ${state.membership.name}`}>
    <Card title="Your workspace"><Body>Open an operation below to view current restaurant records.</Body></Card>
    {navigation.filter(item => !["dashboard", "profile"].includes(item.id)).map(item => <Card key={item.id} title={item.label}>
      <Link href={item.path}>Open {item.label.toLowerCase()}</Link>
    </Card>)}
  </Page>;
}
