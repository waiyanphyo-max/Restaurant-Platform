import { useState } from "react";
import { Link } from "expo-router";
import type { ManagerOrderDetailDto, OrderAction } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp, operationalAmount } from "./format";
import { canCollectPayment, orderActions } from "./workflows";
import { OrderAddress } from "./OrderAddress";
import { completeMeaning, orderActionLabels } from "./OrderCardActions";

type OrderConfirmation = (
  | { kind: "status"; status: OrderAction; note: string | null }
  | { kind: "payment"; paymentId: string }
) & { orderStatus: string; message: string };

function cancellationMessage(order: Pick<ManagerOrderDetailDto, "orderChannel" | "orderType" | "status">): string {
  if (order.orderType !== "DELIVERY" || order.orderChannel !== "CUSTOMER_APP") {
    return "Cancel this unpaid order? Pending counter payments will be cancelled. Collected payments require separate financial review; kitchen cancellation is unavailable. Historical records remain; review counter stock separately.";
  }
  const stock = order.status === "PREPARING"
    ? "Stock is retained because preparation has started."
    : "Recorded stock reservations will be released. Review any historical items without reservation records separately.";
  return `Cancel this delivery order? Pending cash on delivery will be cancelled. ${stock}`;
}

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const management = role === "OWNER" || role === "MANAGER";
  const mutation = useApiMutation();
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const query = useApiQuery(signal => getOperationsApi().getOrder(orderId, { signal }), `order:${orderId}`);
  const canViewPayments = management || role === "STAFF" && query.state.status === "ready" && query.state.data.orderType !== "DELIVERY";
  const paymentQuery = useApiQuery(async signal => {
    const payments = canViewPayments ? await getOperationsApi().listOrderPayments(orderId, { signal }) : [];
    return management ? payments : payments.filter(payment => payment.method === "CASH_AT_COUNTER");
  }, `order-payments:${orderId}:${canViewPayments}`);
  function refresh() {
    setConfirmation(null);
    query.reload();
    paymentQuery.reload();
  }

  return <Page title="Order detail" onRefresh={refresh} refreshing={query.state.status === "loading"}>
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{order => <>
      <Card title={order.orderNumber}><Body>{exactTimestamp(order.createdAt)}</Body>
        <Body>{order.status} · {order.orderType} · {order.orderChannel}</Body>
        <Body>Subtotal: {operationalAmount(order.subtotal)} · Discount: {operationalAmount(order.discountAmount)}</Body>
        <Body>Delivery fee: {operationalAmount(order.deliveryFee)} · Total: {operationalAmount(order.totalAmount)}</Body>
        {management ? <Body>Created by: {order.createdByUserId ?? "Guest or unavailable"}</Body> : null}
        {order.tableId ? <Body>Table ID: {order.tableId}</Body> : null}
        {order.queueTicketId ? <Link href="/queue">View pickup queue</Link> : null}
        {order.orderChannel === "STAFF" && order.orderType !== "DELIVERY" && order.deliveryNote ? <Body>Order note: {order.deliveryNote}</Body> : null}
        {order.orderType === "DELIVERY" ? <>
          {order.deliveryDestination ? <OrderAddress destination={order.deliveryDestination} />
            : order.deliveryAddress ? <><Body>{order.deliveryName} · {order.deliveryPhone}</Body><Body>{order.deliveryAddress}</Body>
              <Body>Region / State: {order.deliveryCity ?? "Unavailable"} · Township: {order.deliveryTownship ?? "Unavailable"}</Body><Body>{order.deliveryNote}</Body></> : null}
          <Link href="/deliveries">{management ? "Manage delivery and cash on delivery" : "Open your assigned deliveries"}</Link>
        </> : null}
      </Card>
      <Card title="Order actions">
        {orderActions(order, role).length ? <FormField label="Note / cancellation reason (10–500 characters required to cancel)" value={note} onChangeText={setNote} maxLength={500} editable={!mutation.busy} multiline />
          : <Body>{order.orderType === "DELIVERY" ? "Manage delivery progress from Deliveries." : "No order status action is available."}</Body>}
        {orderActions(order, role).map(status => <Action key={status} title={orderActionLabels[status]} disabled={mutation.busy || status === "CANCEL" && note.trim().length < 10}
          onPress={() => setConfirmation({
            kind: "status", status, note: note.trim() || null, orderStatus: order.status,
            message: status === "CANCEL" ? cancellationMessage(order) : status === "COMPLETE" ? completeMeaning(order) : "Accept this order after reviewing the items and delivery address?"
          })} />)}
      </Card>
      {order.items.map(item => <Card key={item.id} title={item.productName}>
        <Body>Variant: {item.variantName ?? "Standard"} · Quantity: {item.quantity}</Body>
        <Body>Historical unit price: {operationalAmount(item.unitPrice)} · Line total: {operationalAmount(item.subtotal)}</Body>
        {item.specialInstruction ? <Body>Instruction: {item.specialInstruction}</Body> : null}
        {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity} · {operationalAmount(modifier.additionalPrice)}</Body>)}
      </Card>)}
      {canViewPayments ? <Card title={management ? "Payments" : "Counter payment"}>
        <QueryResult {...paymentQuery}>{payments => <>
          <DataTable columns={["Method", "Status", "Amount", "Paid at (offset)"]} rows={payments.map(payment => ({ key: payment.id,
            cells: [payment.method, payment.status, operationalAmount(payment.amount), payment.paidAt ? exactTimestamp(payment.paidAt) : "Unpaid"] }))}
            emptyMessage="No payment records are available." />
          {payments.filter(payment => canCollectPayment(payment, order.status)).map(payment => <Action key={payment.id} title={`Confirm cash collected: ${operationalAmount(payment.amount)}`} disabled={mutation.busy}
            onPress={() => setConfirmation({ kind: "payment", paymentId: payment.id, orderStatus: order.status, message: `Confirm you physically received ${operationalAmount(payment.amount)} in cash for this order?` })} />)}
        </>}</QueryResult>
        {management ? <Link href="/sales-history">View refund and reversal records in Sales History</Link> : null}
      </Card> : null}
      <Card title="Order status history"><DataTable columns={["Status", "Timestamp (offset)", "Note"]} rows={order.statusHistory.map(event => ({ key: event.id,
        cells: [event.status, exactTimestamp(event.createdAt), event.note ?? "—"] }))} /></Card>
    </>}</QueryResult>
    <Action title="Refresh order" secondary disabled={mutation.busy} onPress={refresh} />
    <ConfirmDialog visible={confirmation !== null} title="Confirm order action" message={confirmation?.message ?? ""} confirmLabel="Confirm" onCancel={() => setConfirmation(null)} onConfirm={() => {
      const pending = confirmation;
      setConfirmation(null);
      if (!pending || query.state.status !== "ready" || pending.orderStatus !== query.state.data.status) return;
      const order = query.state.data;
      if (pending.kind === "status") {
        if (!orderActions(order, role).includes(pending.status)) return;
        if (pending.status === "CANCEL" && (!pending.note || pending.note.length < 10)) return;
        void mutation.run(() => getOperationsApi().executeOrderAction(orderId, { action: pending.status, expectedStatus: pending.orderStatus, reason: pending.note }),
          () => { setNote(""); refresh(); }, refresh);
      } else if (paymentQuery.state.status === "ready" && paymentQuery.state.data.some(payment =>
        payment.id === pending.paymentId && canCollectPayment(payment, order.status))) {
        void mutation.run(() => getOperationsApi().collectPayment(orderId, pending.paymentId), refresh, refresh);
      }
    }} />
  </Page>;
}
