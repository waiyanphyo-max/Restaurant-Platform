import { useRef, useState } from "react";
import type { DeliveryTaskDto } from "@restaurant-platform/shared-types";
import { DeliveryConfiguration } from "./DeliveryConfiguration";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { Choices, FormToggle, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { canAssignDelivery, DELIVERY_STATUSES, deliveryActions } from "./workflows";
import { exactTimestamp, operationalAmount } from "./format";
import { RouteAction } from "../../navigation/RouteAction";

export function DeliveriesScreen() {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("ALL");
  // Use the assigned-to-self endpoint for Staff as well as dedicated Drivers.
  const management = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const userId = state.status === "ready" ? state.userId : "";
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const filters = { page, size: 20, status: status === "ALL" ? undefined : status };
    if (management) return { kind: "management" as const, page: await api.listDeliveries(filters, { signal }) };
    const result = await api.listMyDeliveries(filters, { signal });
    const content = result.content.filter(delivery => delivery.driverUserId === userId)
      .map(({ id, orderNumber, orderStatus, status, assignedAt }) => ({ id, orderNumber, orderStatus, status, assignedAt }));
    return { kind: "assigned" as const, page: { ...result, content } };
  }, `deliveries:${management}:${page}:${status}`);
  return <Page title="Deliveries" subtitle={management ? "Restaurant delivery activity" : "Deliveries assigned to you"} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Body>ပို့ဆောင်မှုတာဝန်များ · {management ? "Assign and review restaurant deliveries" : "Your current assignments only"}</Body>
    <Card title={management ? "Delivery handoff" : "Assigned access"}>
      <Body>{management ? "Kitchen readiness, physical pickup, delivery and cash collection are separate steps." : "Open a task to verify your current assignment before viewing its destination. Reassigned tasks are unavailable."}</Body>
    </Card>
    <Choices label="Delivery status" value={status} values={["ALL", ...DELIVERY_STATUSES]} onChange={value => { setStatus(value); setPage(0); }} />
    <QueryResult {...query}>{data => <>
      {data.kind === "management"
        ? data.page.content.map(delivery => <ManagementDeliveryCard key={`${delivery.id}:${delivery.updatedAt}`} delivery={delivery} reload={query.reload} />)
        : data.page.content.map(delivery => <AssignedDeliverySummary key={delivery.id} delivery={delivery} />)}
      {!data.page.content.length ? <Card><Body>{data.kind === "assigned" && status === "ALL" ? "You have no deliveries assigned to you." : "No deliveries match this filter."}</Body>
        {status !== "ALL" ? <Action title="Clear delivery filter" secondary onPress={() => { setStatus("ALL"); setPage(0); }} /> : null}</Card> : null}
      <Body>Page {data.page.number + 1} of {Math.max(1, data.page.totalPages)} · {data.page.totalElements} deliveries</Body>
      <Action title="Previous page" secondary disabled={data.page.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.page.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh deliveries" secondary onPress={query.reload} />
    </>}</QueryResult>
    {management ? <DeliveryConfiguration /> : null}
  </Page>;
}

function AssignedDeliverySummary({ delivery }: {
  delivery: Pick<DeliveryTaskDto, "id" | "orderNumber" | "orderStatus" | "status" | "assignedAt">;
}) {
  return <Card title={delivery.orderNumber}>
    <Body>{delivery.status.replaceAll("_", " ")} · Order {delivery.orderStatus.replaceAll("_", " ")}</Body>
    {delivery.assignedAt ? <Body>Assigned {exactTimestamp(delivery.assignedAt)}</Body> : null}
    <AssignedDeliveryLink deliveryId={delivery.id} />
  </Card>;
}

function AssignedDeliveryLink({ deliveryId }: { deliveryId: string }) {
  return <RouteAction href={{ pathname: "/delivery/[deliveryId]", params: { deliveryId } }} title="Open assigned delivery" secondary />;
}

function ManagementDeliveryCard({ delivery, reload }: { delivery: DeliveryTaskDto; reload(): void }) {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const userId = state.status === "ready" ? state.userId : "";
  const canAssign = canAssignDelivery(delivery);
  const mutation = useApiMutation();
  const [expanded, setExpanded] = useState(false);
  const [driver, setDriver] = useState(delivery.driverUserId ?? "");
  const [failureReason, setFailureReason] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const blocked = useRef(false);
  const options = useApiQuery(signal => canAssign && expanded ? getOperationsApi().listDeliveryAssignmentOptions({ signal }) : Promise.resolve([]), `assignment:${canAssign}:${expanded}`);
  const actions = deliveryActions(delivery, role, userId);
  const payments = useApiQuery(signal => expanded && actions.includes("DELIVERED")
    ? getOperationsApi().listOrderPayments(delivery.orderId, { signal }) : Promise.resolve(null), `delivery-cash:${delivery.id}:${expanded}:${delivery.updatedAt}`);
  const pendingCash = payments.state.status === "ready" ? payments.state.data?.filter(payment => payment.method === "CASH_ON_DELIVERY" && payment.status === "PENDING") ?? null : null;
  const cashDue = pendingCash?.reduce((sum, payment) => sum + payment.amount, 0) ?? null;
  const cashKnown = cashDue !== null && Number.isSafeInteger(cashDue) && cashDue >= 0;
  async function applyDeliveryAction(action: string) {
    if (blocked.current) throw new FormValidationError("Refresh and review the latest delivery before another action.");
    const api = getOperationsApi();
    const fresh = await api.getDelivery(delivery.id);
    if (fresh.updatedAt !== delivery.updatedAt || fresh.orderStatus !== delivery.orderStatus) {
      throw new FormValidationError("The delivery changed. Refresh before applying an update.");
    }
    if (action === "ASSIGN" && canAssignDelivery(fresh)) {
      return api.assignDriver(delivery.id, { driverUserId: driver, expectedUpdatedAt: fresh.updatedAt });
    }
    if (!deliveryActions(fresh, role, userId).includes(action)) {
      throw new FormValidationError("This action is unavailable for the current delivery status.");
    }
    if (action === "DELIVERED") {
      const freshPayments = await api.listOrderPayments(delivery.orderId);
      const pending = freshPayments.filter(payment => payment.method === "CASH_ON_DELIVERY" && payment.status === "PENDING");
      const due = pending.reduce((sum, payment) => sum + payment.amount, 0);
      if (!cashKnown || due !== cashDue || !Number.isSafeInteger(due) || due < 0) {
        throw new FormValidationError("The payment changed. Refresh and review the cash due before completing delivery.");
      }
      if (pending.length && !cash) throw new FormValidationError("Confirm physical receipt of the cash due before completing delivery.");
    }
    return api.updateDeliveryStatus(delivery.id, { status: action, note: note.trim() || null,
      failureReason: action === "FAILED" ? failureReason.trim() : null, cashCollected: action === "DELIVERED" ? cash : null,
      expectedUpdatedAt: fresh.updatedAt });
  }
  return <Card title={delivery.orderNumber}>
    <Body>{delivery.status.replaceAll("_", " ")} · Order {delivery.orderStatus}</Body>
    <Body>{delivery.customerName ?? "Name unavailable"} · {delivery.customerPhone ?? "Phone unavailable"}</Body>
    <Body>{delivery.deliveryAddress ?? "Address unavailable"}</Body>
    <Body>City: {delivery.deliveryCity ?? "Unavailable"} · Township: {delivery.deliveryTownship ?? "Unavailable"}</Body>
    {delivery.driverUserId === userId ? <AssignedDeliveryLink deliveryId={delivery.id} /> : null}
    <Action title={expanded ? "Hide delivery details" : "Delivery details and actions"} secondary onPress={() => setExpanded(value => !value)} />
    {expanded ? <>
      <Body>{delivery.deliveryNote ?? "No delivery note"}</Body><Body>Order amount: {operationalAmount(delivery.totalAmount)} (payment state must be verified separately)</Body>
      <Body>Assigned user: {delivery.driverUserId ?? "Waiting for assignment"}</Body>
      {delivery.pickedUpAt ? <Body>Picked up: {exactTimestamp(delivery.pickedUpAt)}</Body> : null}
      {delivery.deliveredAt ? <Body>Delivered: {exactTimestamp(delivery.deliveredAt)}</Body> : null}
      {delivery.failureReason ? <Body>Failure: {delivery.failureReason}</Body> : null}
      <RouteAction href={{ pathname: "/order/[orderId]", params: { orderId: delivery.orderId } }} title="Open order and payments" secondary />
      <MutationFeedback {...mutation} />
      {needsReview ? <Card title="Review the current delivery">
        <Body>The action was not confirmed. Refresh and review the latest task and payment state before taking another action. လက်ရှိပို့ဆောင်မှုနှင့် ငွေပေးချေမှုကို ပြန်စစ်ပါ။</Body>
        <Action title="Refresh delivery for review" secondary disabled={mutation.busy} onPress={reload} />
      </Card> : null}
      {canAssign ? <QueryResult {...options}>{members => <>
        <Body>Select an eligible member of this restaurant</Body>
        {members.map(option => <Action key={option.userId}
          title={`${option.fullName ?? option.email ?? option.userId} · ${option.role.replaceAll("_", " ")}${option.userId === userId ? " · You" : ""}`}
          selected={driver === option.userId} secondary={driver !== option.userId} disabled={mutation.busy || needsReview} onPress={() => setDriver(option.userId)} />)}
        {!members.length ? <Body>No eligible restaurant members were found.</Body> : null}
        <Action title="Assign / reassign member" disabled={mutation.busy || needsReview || delivery.status === "ASSIGNED" && delivery.driverUserId === driver
          || !members.some(member => member.userId === driver)} onPress={() => setPending("ASSIGN")} />
      </>}</QueryResult> : null}
      {actions.length ? <FormField label="Delivery note for this update (optional)" value={note} onChangeText={setNote} maxLength={2000} editable={!mutation.busy} /> : null}
      {actions.includes("FAILED") ? <FormField label="Failure reason (required when marking failed)" value={failureReason}
        onChangeText={setFailureReason} maxLength={1000} editable={!mutation.busy} /> : null}
      {actions.includes("DELIVERED") ? <QueryResult {...payments}>{current => current ? <Card title="Cash review · ငွေလက်ခံမှုစစ်ဆေးရန်">
        <Body>{pendingCash?.length ? `Cash due ${operationalAmount(cashDue ?? NaN)}` : "No pending cash-on-delivery payment was returned."}</Body>
        {pendingCash?.length ? <FormToggle label="I physically collected any cash due on delivery" value={cash} onChange={setCash} disabled={mutation.busy || needsReview} /> : null}
        <Body>Delivery completion records COD only with this explicit confirmation. It does not make a separate payment request.</Body>
      </Card> : null}</QueryResult> : null}
      {actions.map(action => <Action key={action} title={`Mark ${action.toLowerCase().replaceAll("_", " ")}`} disabled={mutation.busy || needsReview || action === "FAILED" && !failureReason.trim()
        || action === "DELIVERED" && (!cashKnown || !!pendingCash?.length && !cash)}
        onPress={() => setPending(action)} />)}
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Confirm delivery action" message={pending === "DELIVERED" ? `Complete delivery? Cash collection: ${cash ? "confirmed" : "not confirmed"}. Confirm you received any cash due before completing delivery.` : pending === "ASSIGN" ? "Assign this delivery to the selected restaurant member?" : pending === "CANCELLED" ? "Cancel this delivery task? The order and its payment stay unchanged. Review the order separately." : `Change delivery status to ${pending ?? ""}?`} confirmLabel="Confirm" onCancel={() => setPending(null)} onConfirm={() => {
      const action = pending; setPending(null); if (!action) return;
      void mutation.run(() => applyDeliveryAction(action), reload, () => { blocked.current = true; setNeedsReview(true); reload(); });
    }} />
  </Card>;
}
