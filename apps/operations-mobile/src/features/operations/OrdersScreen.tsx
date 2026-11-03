import { useState } from "react";
import { Link } from "expo-router";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { Choices } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp, operationalAmount } from "./format";
import { ORDER_STATUSES, searchOrders } from "./workflows";

export function OrdersScreen({ history = false }: { history?: boolean }) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const query = useApiQuery(signal => getOperationsApi().listOrders({ page, size: 20, status: status || undefined }, { signal }), `orders:${page}:${status}`);
  return <Page title={history ? "Sales History" : "Orders"} subtitle={history ? "Historical order snapshots and payment records." : "Restaurant order activity."} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    {history ? <Card><Body>These are operational order records. Accounting search, date filters and refund reconciliation will be available in a future release.</Body></Card> : null}
    <Card><Choices label="Order status (all records)" value={status || "ALL"} values={["ALL", ...ORDER_STATUSES]} onChange={value => { setStatus(value === "ALL" ? "" : value); setPage(0); }} />
      <FormField label="Search this page by order number or ID" value={search} onChangeText={setSearch} />
      <FormField label="Filter this page by channel (exact code, blank for all)" value={channel} onChangeText={setChannel} autoCapitalize="characters" />
      <Body>Search and channel filters apply to the loaded page. Use status and page controls to find more records.</Body></Card>
    <QueryResult {...query}>{data => <>
      {searchOrders(data.content, search, channel).map(order => <Card key={order.id} title={order.orderNumber}>
        <Body>{order.status} · {order.orderType} · {order.orderChannel}</Body><Body>{exactTimestamp(order.createdAt)}</Body>
        <Body>Order total: {operationalAmount(order.totalAmount)} · Payment status is shown in details.</Body>
        <Link href={{ pathname: "/order/[orderId]", params: { orderId: order.id } }}>View order</Link>
      </Card>)}
      {!searchOrders(data.content, search, channel).length ? <Card><Body>No matching orders on this page.</Body></Card> : null}
      <Body>Page {data.number + 1} of {Math.max(1, data.totalPages)} · {data.totalElements} orders</Body>
      <Action title="Previous page" secondary disabled={data.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh orders" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}
