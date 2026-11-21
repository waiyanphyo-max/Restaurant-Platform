import { useState } from "react";
import type { ManagerOrderDetailDto, OrderAction } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page, Status } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp, operationalAmount } from "./format";
import { cancellationReasonError, canCollectPayment, orderActions } from "./workflows";
import { OrderAddress } from "./OrderAddress";
import { completeMeaning } from "./OrderCardActions";
import { actionLabel, CancellationReason, OrderStatusBadge, serviceLabel } from "./OrderPresentation";
import { WorkspaceLink } from "../../navigation/WorkspaceLink";

type OrderConfirmation = (
  | { kind: "status"; status: OrderAction; note: string | null }
  | { kind: "payment"; paymentId: string }
) & { orderStatus: string; message: string };

function cancellationMessage(order: Pick<ManagerOrderDetailDto, "orderChannel" | "orderType" | "status">): string {
  if (order.orderType !== "DELIVERY" || order.orderChannel !== "CUSTOMER_APP") {
    return "Cancel this unpaid order? Pending counter payments will be cancelled. Collected payments require separate financial review; kitchen cancellation is unavailable. Historical records remain; review counter stock separately. ငွေမပေးရသေးသည့် အော်ဒါကို ပယ်ဖျက်မည်လား။ မှတ်တမ်းများကို ထိန်းသိမ်းမည်။ ငွေပြန်အမ်းခြင်း မဟုတ်ပါ။";
  }
  const stock = order.status === "PREPARING"
    ? "Stock is retained because preparation has started."
    : "Recorded stock reservations will be released. Review any historical items without reservation records separately.";
  return `Cancel this delivery order? Pending cash on delivery will be cancelled. ${stock} ဤပို့ဆောင်ရေး အော်ဒါကို ပယ်ဖျက်မည်လား။ မှတ်တမ်းများကို ထိန်းသိမ်းမည်။ ငွေပြန်အမ်းခြင်း မဟုတ်ပါ။`;
}

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const management = role === "OWNER" || role === "MANAGER";
  const mutation = useApiMutation();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const query = useApiQuery(signal => getOperationsApi().getOrder(orderId, { signal }), `order:${orderId}`);
  const canViewPayments = management || role === "STAFF" && query.state.status === "ready" && query.state.data.orderType !== "DELIVERY";
  const paymentQuery = useApiQuery(async signal => {
    const payments = canViewPayments ? await getOperationsApi().listOrderPayments(orderId, { signal }) : [];
    return management ? payments : payments.filter(payment => payment.method === "CASH_AT_COUNTER");
  }, `order-payments:${orderId}:${canViewPayments}`);
  function refresh() {
    setConfirmation(null);
    setReviewRequired(false);
    query.reload();
    paymentQuery.reload();
  }

  return <Page title="Order detail" onRefresh={refresh} refreshing={query.state.status === "loading"}>
    <MutationFeedback {...mutation} />
    {reviewRequired ? <Status tone="warning">Reload the latest order and payment records before reviewing another action. အော်ဒါနှင့် ငွေပေးချေမှု နောက်ဆုံးအခြေအနေကို ပြန်စစ်ဆေးပါ။</Status> : null}
    <QueryResult {...query}>{order => <>
      <Card title={order.orderNumber}><Body>{exactTimestamp(order.createdAt)}</Body>
        <OrderStatusBadge status={order.status} /><Body>{serviceLabel(order)}</Body>
        <Body>Subtotal: {operationalAmount(order.subtotal)} · Discount: {operationalAmount(order.discountAmount)}</Body>
        <Body>Delivery fee: {operationalAmount(order.deliveryFee)} · Total: {operationalAmount(order.totalAmount)}</Body>
        {management ? <Body>Created by: {order.createdByUserId ?? "Guest or unavailable"}</Body> : null}
        {order.tableId ? <Body>Table ID: {order.tableId}</Body> : null}
        {order.queueTicketId ? <WorkspaceLink href="/queue">View pickup queue</WorkspaceLink> : null}
        {order.orderChannel === "STAFF" && order.orderType !== "DELIVERY" && order.deliveryNote ? <Body>Order note: {order.deliveryNote}</Body> : null}
        {order.orderType === "DELIVERY" ? <>
          {order.deliveryDestination ? <OrderAddress destination={order.deliveryDestination} />
            : order.deliveryAddress ? <><Body>{order.deliveryName} · {order.deliveryPhone}</Body><Body>{order.deliveryAddress}</Body>
              <Body>Region / State: {order.deliveryCity ?? "Unavailable"} · Township: {order.deliveryTownship ?? "Unavailable"}</Body><Body>{order.deliveryNote}</Body></> : null}
          <WorkspaceLink href="/deliveries">{management ? "Manage delivery and cash on delivery" : "Open your assigned deliveries"}</WorkspaceLink>
        </> : null}
      </Card>
      {order.items.map(item => <Card key={item.id} title={item.productName}>
        <Body>Variant: {item.variantName ?? "Standard"} · Quantity: {item.quantity}</Body>
        <Body>Historical unit price: {operationalAmount(item.unitPrice)} · Line total: {operationalAmount(item.subtotal)}</Body>
        {item.specialInstruction ? <Body>Instruction: {item.specialInstruction}</Body> : null}
        {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity} · {operationalAmount(modifier.additionalPrice)}</Body>)}
      </Card>)}
      <Status tone="accent">Payment is separate · ငွေကောက်ခံမှုကို သီးခြား အတည်ပြုရပါမည်။ Completing preparation or handoff does not record cash received.</Status>
      {canViewPayments ? <Card title={management ? "Payments" : "Counter payment"}>
        <QueryResult {...paymentQuery}>{payments => <>
          <DataTable columns={["Method", "Status", "Amount", "Paid at (offset)"]} rows={payments.map(payment => ({ key: payment.id,
            cells: [payment.method, payment.status, operationalAmount(payment.amount), payment.paidAt ? exactTimestamp(payment.paidAt) : "Unpaid"] }))}
            emptyMessage="No payment records are available." />
          {payments.filter(payment => canCollectPayment(payment, order.status)).map(payment => <Action key={payment.id} title={`Confirm cash collected: ${operationalAmount(payment.amount)} · ငွေလက်ခံရရှိပြီး`} disabled={mutation.busy || reviewRequired}
            onPress={() => setConfirmation({ kind: "payment", paymentId: payment.id, orderStatus: order.status, message: `Confirm you physically received ${operationalAmount(payment.amount)} in cash for this order? ဤအော်ဒါအတွက် ငွေသား ${operationalAmount(payment.amount)} ကို အမှန်တကယ် လက်ခံရရှိပြီးပါသလား။` })} />)}
        </>}</QueryResult>
        {management ? <WorkspaceLink href="/sales-history">View refund and reversal records in Sales History</WorkspaceLink> : null}
      </Card> : null}
      <Card title="Order actions · ဆောင်ရွက်ရန်">
        {orderActions(order, role).some(action => action !== "CANCEL") ? <FormField label="Kitchen note (optional) · မီးဖိုချောင် မှတ်ချက်" value={note} onChangeText={setNote} maxLength={500} editable={!mutation.busy && !reviewRequired} multiline /> : null}
        {order.status === "READY" ? <Body>{order.orderType === "DELIVERY"
          ? "Kitchen work is complete. Physical pickup, delivery and COD confirmation remain in Deliveries."
          : order.queueTicketId ? "Kitchen work is complete. Call the pickup ticket and confirm physical collection from Queue." : "Review fulfillment before completing this order."}</Body> : null}
        {!orderActions(order, role).length ? <Body>{order.orderType === "DELIVERY" ? "Manage delivery progress from Deliveries." : "No order status action is available."}</Body> : null}
        {orderActions(order, role).map(status => <Action key={status} title={actionLabel[status]} danger={status === "CANCEL"} disabled={mutation.busy || reviewRequired}
          onPress={() => setConfirmation({
            kind: "status", status, note: note.trim() || null, orderStatus: order.status,
            message: status === "CANCEL" ? cancellationMessage(order) : status === "COMPLETE" ? completeMeaning(order) : "Accept this order after reviewing the items and delivery address? ပစ္စည်းနှင့် လိပ်စာကို စစ်ဆေးပြီး လက်ခံမည်လား။"
          })} />)}
      </Card>
      <Card title="Order status history"><DataTable columns={["Status", "Timestamp (offset)", "Actor", "Note"]} rows={order.statusHistory.map(event => ({ key: event.id,
        cells: [event.status, exactTimestamp(event.createdAt), event.changedByUserId ?? "Unavailable", event.note ?? "—"] }))} /></Card>
    </>}</QueryResult>
    <Action title="Refresh order" secondary disabled={mutation.busy} onPress={refresh} />
    <ConfirmDialog visible={confirmation !== null} title="Review order action · ဆောင်ရွက်ချက် စစ်ဆေးရန်" message={confirmation?.message ?? ""}
      confirmLabel={confirmation?.kind === "status" ? actionLabel[confirmation.status] : "Confirm cash received · ငွေလက်ခံရရှိပြီး"}
      danger={confirmation?.kind === "status" && confirmation.status === "CANCEL"} busy={mutation.busy}
      confirmDisabled={reviewRequired || confirmation?.kind === "status" && confirmation.status === "CANCEL" && !!cancellationReasonError(reason)}
      onCancel={() => setConfirmation(null)} onConfirm={() => {
      const pending = confirmation;
      setConfirmation(null);
      if (!pending || reviewRequired || query.state.status !== "ready" || pending.orderStatus !== query.state.data.status) return;
      const order = query.state.data;
      if (pending.kind === "status") {
        if (!orderActions(order, role).includes(pending.status)) return;
        if (pending.status === "CANCEL" && cancellationReasonError(reason)) return;
        void mutation.run(() => getOperationsApi().executeOrderAction(orderId, { action: pending.status, expectedStatus: pending.orderStatus, reason: pending.status === "CANCEL" ? reason.trim() : pending.note }),
          () => { setNote(""); setReason(""); refresh(); }, () => setReviewRequired(true));
      } else if (paymentQuery.state.status === "ready" && paymentQuery.state.data.some(payment =>
        payment.id === pending.paymentId && canCollectPayment(payment, order.status))) {
        void mutation.run(() => getOperationsApi().collectPayment(orderId, pending.paymentId), refresh, () => setReviewRequired(true));
      }
    }}>{confirmation?.kind === "status" && confirmation.status === "CANCEL" ? <CancellationReason value={reason} onChange={setReason} disabled={mutation.busy} /> : null}</ConfirmDialog>
  </Page>;
}
