import { Link } from "expo-router";
import { Image } from "react-native";
import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { readEmbeddedTenant } from "../../tenant";
import { getNavigationItems } from "../../navigation/policy";
import { operationalAmount } from "./format";

export function DashboardScreen() {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const operational = ["OWNER", "MANAGER", "STAFF"].includes(role);
  const management = ["OWNER", "MANAGER"].includes(role);
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [restaurant, orders, queue, deliveries, notifications, daily] = await Promise.allSettled([
      api.getRestaurant({ signal }),
      operational ? Promise.all(["PENDING", "ACCEPTED", "PREPARING", "READY"].map(status => api.listOrders({ status, size: 1 }, { signal }))) : Promise.resolve(null),
      operational ? api.listQueue(undefined, { signal }) : Promise.resolve(null),
      management ? api.listDeliveries({ size: 5 }, { signal }) : api.listMyDeliveries({ size: 5 }, { signal }),
      api.listNotifications("PENDING", { signal }),
      management ? api.getDailyReport(undefined, { signal }) : Promise.resolve(null)
    ] as const);
    for (const result of [restaurant, orders, queue, deliveries, notifications, daily]) {
      if (result.status === "rejected" && (result.reason instanceof MissingAccessTokenError || result.reason instanceof ApiHttpError && result.reason.status === 401)) throw result.reason;
    }
    return {
      restaurant: restaurant.status === "fulfilled" ? restaurant.value : null,
      orders: orders.status === "fulfilled" ? orders.value : null,
      queue: queue.status === "fulfilled" ? queue.value : null,
      deliveries: deliveries.status === "fulfilled" ? {
        totalElements: deliveries.value.totalElements,
        content: deliveries.value.content.map(({ id, orderNumber, status }) => ({ id, orderNumber, status }))
      } : null,
      notifications: notifications.status === "fulfilled" ? notifications.value : null,
      daily: daily.status === "fulfilled" ? daily.value : null
    };
  }, `dashboard:${role}`);
  if (state.status !== "ready") return null;
  const navigation = getNavigationItems(state.membership, readEmbeddedTenant().restaurantId);
  return <Page title={state.membership.name} subtitle={role === "DELIVERY_DRIVER" ? "Your delivery workspace" : "Restaurant operations"} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <QueryResult {...query}>{data => <>
      <Card title="Restaurant">
        {data.restaurant?.logoUrl ? <Image source={{ uri: data.restaurant.logoUrl }} accessibilityLabel="Restaurant logo" style={{ width: 72, height: 72, borderRadius: 12 }} /> : null}
        <Body>{data.restaurant?.name ?? state.membership.name}</Body>
        <Body>{data.restaurant ? data.restaurant.active ? "Restaurant active" : "Restaurant inactive" : "Profile unavailable. Pull to refresh."}</Body>
      </Card>
      {management ? <Card title="Today's restaurant operations">
        {data.daily ? <>
          <Body>{data.daily.reportDate} · {data.daily.timezone}</Body>
          <Body>{data.daily.totalOrders} created · {data.daily.completedOrders} completed · {data.daily.cancelledOrders} cancelled</Body>
          <Body>Value of orders created today, excluding cancellations: {operationalAmount(data.daily.orderAmountExcludingCancelled)}</Body>
          <Body>Payments marked paid today: {operationalAmount(data.daily.paidAmount)}</Body>
        </> : <Body>Today's operational totals are unavailable. Pull to refresh.</Body>}
        <Link href="/reports">Open shared financial reports</Link>
      </Card> : null}
      {operational ? <Card title="Orders needing attention">
        {data.orders ? data.orders.map((page, index) => <Body key={index}>{["Pending acceptance", "Accepted", "Preparing", "Ready"][index]}: {page.totalElements}</Body>) : <Body>Order overview unavailable. Retry after checking your connection.</Body>}
        <Link href="/orders">Manage orders</Link>
      </Card> : null}
      {operational ? <Card title="Queue and pickup">
        {data.queue ? <><Body>{data.queue.length} active tickets in the restaurant's current queue day</Body>
          <Body>{data.queue.filter(ticket => ticket.status === "READY").length} ready · {data.queue.filter(ticket => ticket.status === "CALLED").length} called</Body></> : <Body>Queue overview unavailable.</Body>}
        <Link href="/queue">Open pickup queue</Link>
      </Card> : null}
      <Card title="Delivery activity">
        {data.deliveries ? <><Body>{data.deliveries.totalElements} delivery records {role === "STAFF" || role === "DELIVERY_DRIVER" ? "assigned to you" : "for this restaurant"}</Body>
          {data.deliveries.content.length ? data.deliveries.content.map(delivery => <Body key={delivery.id}>{delivery.orderNumber} · {delivery.status.replaceAll("_", " ")}</Body>) : <Body>No deliveries found.</Body>}</> : <Body>Delivery activity unavailable.</Body>}
        <Link href="/deliveries">Open deliveries</Link>
      </Card>
      <Card title="Notifications">
        {data.notifications ? <><Body>{data.notifications.length} unread updates</Body>{data.notifications.slice(0, 3).map(item => <Body key={item.id}>{item.title}</Body>)}</> : <Body>Notifications unavailable.</Body>}
        <Link href="/notifications">View updates</Link>
      </Card>
      <Card title="Quick navigation">{navigation.filter(item => !["dashboard", "profile"].includes(item.id)).map(item => <Link key={item.id} href={item.path}>Open {item.label.toLowerCase()}</Link>)}</Card>
      <Action title="Refresh overview" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}
