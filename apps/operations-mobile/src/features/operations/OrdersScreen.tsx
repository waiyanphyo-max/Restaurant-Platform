import { useState } from "react";
import { Link } from "expo-router";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, DataTable, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp, operationalAmount } from "./format";

export function OrdersScreen({ history = false }: { history?: boolean }) {
  const [page, setPage] = useState(0);
  const query = useApiQuery(signal => getOperationsApi().listOrders({ page, size: 20 }, { signal }), `orders:${page}`);
  return <Page title={history ? "Sales History" : "Orders"} subtitle={history ? "Historical order snapshots and payment records." : "Restaurant order activity."}>
    {history ? <Card><Body>These are operational order records. Accounting search, date filters and refund reconciliation will be available in a future release.</Body></Card> : null}
    <QueryResult {...query}>{data => <>
      <Card><DataTable columns={["Order", "Created at (offset)", "Status", "Order total", "Channel", "Details"]} rows={data.content.map(order => ({ key: order.id,
        cells: [order.orderNumber, exactTimestamp(order.createdAt), order.status, operationalAmount(order.totalAmount), order.orderChannel,
          <Link key={order.id} href={{ pathname: "/order/[orderId]", params: { orderId: order.id } }}>View order</Link>] }))} /></Card>
      <Body>Page {data.number + 1} of {Math.max(1, data.totalPages)} · {data.totalElements} orders</Body>
      <Action title="Previous page" secondary disabled={data.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh orders" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}
