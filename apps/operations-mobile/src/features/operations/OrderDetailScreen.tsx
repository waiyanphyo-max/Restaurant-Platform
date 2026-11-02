import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Body, Card, DataTable, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp, operationalAmount } from "./format";

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { state } = useOperationsAuth();
  const financial = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [order, payments] = await Promise.all([
      api.getOrder(orderId, { signal }), financial ? api.listOrderPayments(orderId, { signal }) : Promise.resolve([])
    ]);
    return { order, payments };
  }, `order:${orderId}:${financial}`);
  return <Page title="Order detail">
    <QueryResult {...query}>{({ order, payments }) => <>
      <Card title={order.orderNumber}><Body>{exactTimestamp(order.createdAt)}</Body>
        <Body>{order.status} · {order.orderType} · {order.orderChannel}</Body>
        <Body>Subtotal: {operationalAmount(order.subtotal)} · Discount: {operationalAmount(order.discountAmount)}</Body>
        <Body>Delivery fee: {operationalAmount(order.deliveryFee)} · Total: {operationalAmount(order.totalAmount)}</Body>
        {financial ? <Body>Created by: {order.createdByUserId ?? "Guest or unavailable"}</Body> : null}
      </Card>
      {order.items.map(item => <Card key={item.id} title={item.productName}>
        <Body>Variant: {item.variantName ?? "Standard"} · Quantity: {item.quantity}</Body>
        <Body>Historical unit price: {operationalAmount(item.unitPrice)} · Line total: {operationalAmount(item.subtotal)}</Body>
        {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity} · {operationalAmount(modifier.additionalPrice)}</Body>)}
      </Card>)}
      {financial ? <Card title="Payments"><DataTable columns={["Method", "Status", "Amount", "Paid at (offset)"]} rows={payments.map(payment => ({ key: payment.id,
        cells: [payment.method, payment.status, operationalAmount(payment.amount), payment.paidAt ? exactTimestamp(payment.paidAt) : "Unpaid"] }))} />
        <Body>Refund and cancellation statuses are operational records. A reconciled refund history is not yet available.</Body>
      </Card> : null}
      <Card title="Order status history"><DataTable columns={["Status", "Timestamp (offset)", "Note"]} rows={order.statusHistory.map(event => ({ key: event.id,
        cells: [event.status, exactTimestamp(event.createdAt), event.note ?? "—"] }))} /></Card>
    </>}</QueryResult>
  </Page>;
}
