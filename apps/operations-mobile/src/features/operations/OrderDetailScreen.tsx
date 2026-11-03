import { useState } from "react";
import { Link } from "expo-router";
import type { UpdateOrderStatusRequest } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp, operationalAmount } from "./format";
import { canCollectPayment, orderActions } from "./workflows";

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { state } = useOperationsAuth();
  const financial = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const mutation = useApiMutation();
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<{ status?: UpdateOrderStatusRequest["status"]; paymentId?: string; message: string } | null>(null);
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [order, payments] = await Promise.all([
      api.getOrder(orderId, { signal }), financial ? api.listOrderPayments(orderId, { signal }) : Promise.resolve([])
    ]);
    return { order, payments };
  }, `order:${orderId}:${financial}`);
  return <Page title="Order detail" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{({ order, payments }) => <>
      <Card title={order.orderNumber}><Body>{exactTimestamp(order.createdAt)}</Body>
        <Body>{order.status} · {order.orderType} · {order.orderChannel}</Body>
        <Body>Subtotal: {operationalAmount(order.subtotal)} · Discount: {operationalAmount(order.discountAmount)}</Body>
        <Body>Delivery fee: {operationalAmount(order.deliveryFee)} · Total: {operationalAmount(order.totalAmount)}</Body>
        {financial ? <Body>Created by: {order.createdByUserId ?? "Guest or unavailable"}</Body> : null}
        {order.tableId ? <Body>Table ID: {order.tableId}</Body> : null}
        {order.queueTicketId ? <Link href="/queue">View pickup queue</Link> : null}
        {order.orderType === "DELIVERY" ? <><Body>{order.deliveryName} · {order.deliveryPhone}</Body><Body>{order.deliveryAddress}</Body><Body>{order.deliveryNote}</Body><Link href="/deliveries">Manage delivery and cash on delivery</Link></> : null}
      </Card>
      <Card title="Order actions"><FormField label="Status note (optional)" value={note} onChangeText={setNote} maxLength={500} />
        {orderActions(order, state.status === "ready" ? state.membership.role : "").map(status => <Action key={status} title={status === "CANCELLED" ? "Cancel order" : `Mark ${status.toLowerCase()}`} disabled={mutation.busy}
          onPress={() => setConfirmation({ status, message: status === "CANCELLED" ? "Cancel this order? Historical records remain. Review tracked stock and pending payments separately after cancellation. Collected cash is not refunded by this action." : `Change this order from ${order.status} to ${status}?` })} />)}
        {!orderActions(order, state.status === "ready" ? state.membership.role : "").length ? <Body>No order status action available. Delivery progress is managed from Deliveries.</Body> : null}
      </Card>
      {order.items.map(item => <Card key={item.id} title={item.productName}>
        <Body>Variant: {item.variantName ?? "Standard"} · Quantity: {item.quantity}</Body>
        <Body>Historical unit price: {operationalAmount(item.unitPrice)} · Line total: {operationalAmount(item.subtotal)}</Body>
        {item.specialInstruction ? <Body>Instruction: {item.specialInstruction}</Body> : null}
        {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity} · {operationalAmount(modifier.additionalPrice)}</Body>)}
      </Card>)}
      {financial ? <Card title="Payments"><DataTable columns={["Method", "Status", "Amount", "Paid at (offset)"]} rows={payments.map(payment => ({ key: payment.id,
        cells: [payment.method, payment.status, operationalAmount(payment.amount), payment.paidAt ? exactTimestamp(payment.paidAt) : "Unpaid"] }))} />
        {!payments.length ? <Body>Payment information unavailable; this does not mean the order is paid.</Body> : null}
        {payments.filter(payment => canCollectPayment(payment, order.status)).map(payment => <Action key={payment.id} title={`Confirm cash collected: ${operationalAmount(payment.amount)}`} disabled={mutation.busy}
          onPress={() => setConfirmation({ paymentId: payment.id, message: `Confirm you physically received ${operationalAmount(payment.amount)} in cash for this order?` })} />)}
        <Body>Refund and cancellation statuses are operational records. A reconciled refund history is not yet available.</Body>
      </Card> : null}
      <Card title="Order status history"><DataTable columns={["Status", "Timestamp (offset)", "Note"]} rows={order.statusHistory.map(event => ({ key: event.id,
        cells: [event.status, exactTimestamp(event.createdAt), event.note ?? "—"] }))} /></Card>
    </>}</QueryResult>
    <ConfirmDialog visible={confirmation !== null} title="Confirm order action" message={confirmation?.message ?? ""} confirmLabel="Confirm" onCancel={() => setConfirmation(null)} onConfirm={() => {
      const pending = confirmation; setConfirmation(null); if (!pending) return;
      void mutation.run(async () => { if (pending.paymentId) await getOperationsApi().collectPayment(orderId, pending.paymentId);
        else await getOperationsApi().updateOrderStatus(orderId, { status: pending.status!, note: note.trim() || null }); }, () => { setNote(""); query.reload(); });
    }} />
  </Page>;
}
