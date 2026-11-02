import { useState } from "react";
import { Link } from "expo-router";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, Page } from "../../components/ui";
import { Choices, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp } from "./format";

export function NotificationsScreen() {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const [status, setStatus] = useState("PENDING");
  const mutation = useApiMutation();
  const query = useApiQuery(signal => getOperationsApi().listNotifications(status === "ALL" ? undefined : status, { signal }), `notifications:${status}`);
  return <Page title="Notifications" subtitle="Your updates for this restaurant" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Choices label="Notification status" value={status} values={["PENDING", "READ", "ALL"]} onChange={setStatus} />
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{notifications => notifications.length ? notifications.map(item => <Card key={item.id} title={item.title}>
      <Body>{item.body}</Body><Body>{item.status === "READ" ? "Read" : "Unread"} · {exactTimestamp(item.createdAt)}</Body>
      {item.orderId && ["OWNER", "MANAGER", "STAFF"].includes(role) ? <Link href={{ pathname: "/order/[orderId]", params: { orderId: item.orderId } }}>Open order</Link>
        : item.notificationType.startsWith("DELIVERY") ? <Link href="/deliveries">Open deliveries</Link> : null}
      {item.status !== "READ" ? <Action title="Mark as read" secondary disabled={mutation.busy} onPress={() => { void mutation.run(() => getOperationsApi().markNotificationRead(item.id), query.reload); }} /> : null}
    </Card>) : <Card><Body>No notifications match this filter.</Body></Card>}</QueryResult>
    <Action title="Refresh notifications" secondary onPress={query.reload} />
  </Page>;
}
