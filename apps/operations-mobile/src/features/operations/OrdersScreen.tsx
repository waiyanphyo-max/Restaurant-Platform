import { useEffect, useState } from "react";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { View } from "react-native";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { Choices } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp, operationalAmount } from "./format";
import { ORDER_GROUPS, searchOrders, type OrderGroup } from "./workflows";
import { CounterOrderPanel } from "./CounterOrderPanel";
import { OrderAddress } from "./OrderAddress";
import { OrderCardActions } from "./OrderCardActions";
import { OrderStatusBadge, serviceLabel } from "./OrderPresentation";
import { OrderActionCoordinator } from "./order-action-coordinator";
import { RouteAction } from "../../navigation/RouteAction";
import { WorkspaceLink } from "../../navigation/WorkspaceLink";

const ORDER_CHANNELS = ["ALL", "TABLE_QR", "COMMON_QR", "CUSTOMER_APP", "STAFF"] as const;

export function OrdersScreen({ history = false }: { history?: boolean }) {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<OrderGroup>(history ? "HISTORY" : "NEW");
  const [status, setStatus] = useState(history ? "COMPLETED" : "PENDING");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [, setActionRevision] = useState(0);
  const [actionCoordinator] = useState(() => new OrderActionCoordinator());
  const query = useApiQuery(signal => getOperationsApi().listOrders({ page, size: 20, status: status || undefined }, { signal }), `orders:${page}:${status}`);
  const loadedPage = query.state.status === "ready" ? query.state.data : null;
  useEffect(() => actionCoordinator.connect(() => setActionRevision(value => value + 1), query.reload), [actionCoordinator, query.reload]);
  useEffect(() => { if (loadedPage) actionCoordinator.reconcile(); }, [actionCoordinator, loadedPage]);
  const canCreate = !history && state.status === "ready" && ["OWNER", "MANAGER", "STAFF"].includes(state.membership.role);
  function selectGroup(next: OrderGroup) {
    setGroup(next); setStatus(next === "ALL" ? "" : ORDER_GROUPS[next][0]); setPage(0);
  }
  const groupLabels: Record<OrderGroup, string> = { NEW: "New · အသစ်", ACTIVE: "Active · ဆောင်ရွက်ဆဲ", HISTORY: "History · မှတ်တမ်း", ALL: "All · အားလုံး" };
  return <Page title={history ? "Order history · အော်ဒါမှတ်တမ်း" : "Orders · အော်ဒါများ"}
    subtitle="Start with orders that need a decision. ဆုံးဖြတ်ရန်လိုသည့် အော်ဒါများကို စစ်ဆေးပါ။" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    {history ? <Card><WorkspaceLink href="/sales-history">Open the shared Sales Ledger for accounting dates, product search, and refunds</WorkspaceLink></Card> : null}
    {canCreate ? <CounterOrderPanel onOrderChanged={() => { setPage(0); selectGroup("NEW"); setSearch(""); setChannel("ALL"); query.reload(); }} /> : null}
    <FormField label="Search this page by order number or ID · ဤစာမျက်နှာတွင် ရှာရန်" value={search} onChangeText={setSearch} />
    <View accessibilityLabel="Order groups" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(Object.keys(ORDER_GROUPS) as OrderGroup[]).map(value => <Action key={value} title={groupLabels[value]} selected={group === value} secondary={group !== value} onPress={() => selectGroup(value)} />)}
    </View>
    <Action title={filtersOpen ? "Hide filters · စစ်ထုတ်မှု ပိတ်ရန်" : "Filters · စစ်ထုတ်ရန်"} secondary selected={filtersOpen} onPress={() => setFiltersOpen(value => !value)} />
    {filtersOpen ? <Card><Choices label="Order status across all records · အခြေအနေ" value={status || "ALL"} values={group === "ALL" ? ["ALL", ...ORDER_GROUPS.ALL] : ORDER_GROUPS[group]}
      onChange={value => { setStatus(value === "ALL" ? "" : value); setPage(0); }} />
      <Choices label="Order channel on this page" value={channel} values={ORDER_CHANNELS} onChange={setChannel} />
      <Body>Search and channel filters apply to the loaded page. Use status and page controls to find more records.</Body>
      <Body>Date and payment filters are available in authorized financial records.</Body></Card> : null}
    <Body tone="muted">{status ? `Showing ${status} across all records. ` : "Showing all order statuses. "}Search applies to this page only. ဤစာမျက်နှာရှိ အော်ဒါများကိုသာ ရှာဖွေပါသည်။</Body>
    <QueryResult {...query}>{data => {
      const orders = searchOrders(data.content, search, channel === "ALL" ? "" : channel);
      return <>
        {orders.map(order => <Card key={order.id} title={order.orderNumber}>
          <OrderStatusBadge status={order.status} /><Body>{serviceLabel(order)}</Body><Body tone="muted">{exactTimestamp(order.createdAt)}</Body>
          {order.items?.length ? <Body>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {order.items.length} order lines</Body> : null}
          <Body>Order total: {operationalAmount(order.totalAmount)} · Payment status is shown in details.</Body>
          {(order.items ?? []).map(item => <Card key={item.id} title={`${item.productName} × ${item.quantity}`}>
            {item.variantName ? <Body>Variant: {item.variantName}</Body> : null}
            {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity}</Body>)}
            {item.specialInstruction ? <Body>Instruction: {item.specialInstruction}</Body> : null}
          </Card>)}
          {order.orderNote ? <Body>Order instructions: {order.orderNote}</Body> : null}
          {order.deliveryDestination ? <><OrderAddress destination={order.deliveryDestination} />
            <Body>Delivery fee: {operationalAmount(order.deliveryFee)}</Body></> : null}
          {!history ? <OrderCardActions order={order} role={state.status === "ready" ? state.membership.role : ""} onChanged={query.reload} coordinator={actionCoordinator} /> : null}
          <RouteAction href={{ pathname: "/order/[orderId]", params: { orderId: order.id } }} title="View order · အော်ဒါကြည့်ရန်" secondary />
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
