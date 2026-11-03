import { useState } from "react";
import { Link } from "expo-router";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { Choices } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp, operationalAmount } from "./format";
import { ORDER_STATUSES, searchOrders } from "./workflows";
import { CounterOrderPanel } from "./CounterOrderPanel";

const ORDER_CHANNELS = ["ALL", "TABLE_QR", "COMMON_QR", "CUSTOMER_APP", "STAFF"] as const;

export function OrdersScreen({ history = false }: { history?: boolean }) {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("ALL");
  const query = useApiQuery(signal => getOperationsApi().listOrders({ page, size: 20, status: status || undefined }, { signal }), `orders:${page}:${status}`);
  const canCreate = !history && state.status === "ready" && ["OWNER", "MANAGER", "STAFF"].includes(state.membership.role);
  return <Page title={history ? "Sales History" : "Orders"} subtitle={history ? "Historical order snapshots and payment records." : "Restaurant order activity."} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    {history ? <Card><Link href="/sales-history">Open the shared Sales Ledger for accounting dates, product search, and refunds</Link></Card> : null}
    {canCreate ? <CounterOrderPanel onOrderChanged={() => { setPage(0); setStatus(""); setSearch(""); setChannel("ALL"); query.reload(); }} /> : null}
    <Card><Choices label="Order status (all records)" value={status || "ALL"} values={["ALL", ...ORDER_STATUSES]} onChange={value => { setStatus(value === "ALL" ? "" : value); setPage(0); }} />
      <FormField label="Search this page by order number or ID" value={search} onChangeText={setSearch} />
      <Choices label="Order channel on this page" value={channel} values={ORDER_CHANNELS} onChange={setChannel} />
      <Body>Search and channel filters apply to the loaded page. Use status and page controls to find more records.</Body></Card>
    <QueryResult {...query}>{data => {
      const orders = searchOrders(data.content, search, channel === "ALL" ? "" : channel);
      return <>
        {orders.map(order => <Card key={order.id} title={order.orderNumber}>
          <Body>{order.status} · {order.orderType} · {order.orderChannel}</Body><Body>{exactTimestamp(order.createdAt)}</Body>
          <Body>Order total: {operationalAmount(order.totalAmount)} · Payment status is shown in details.</Body>
          <Link href={{ pathname: "/order/[orderId]", params: { orderId: order.id } }}>View order</Link>
        </Card>)}
        {!orders.length ? <Card><Body>No matching orders on this page.</Body></Card> : null}
        <Body>Page {data.number + 1} of {Math.max(1, data.totalPages)} · {data.totalElements} orders</Body>
        <Action title="Previous page" secondary disabled={data.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
        <Action title="Next page" secondary disabled={data.last} onPress={() => setPage(value => value + 1)} />
        <Action title="Refresh orders" secondary onPress={query.reload} />
      </>;
    }}</QueryResult>
  </Page>;
}
