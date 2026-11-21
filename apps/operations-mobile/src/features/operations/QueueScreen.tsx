import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Badge, Body, Card, ConfirmDialog, Page, Status } from "../../components/ui";
import { Choices, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { exactTimestamp } from "./format";
import { WorkspaceLink } from "../../navigation/WorkspaceLink";

export function QueueScreen() {
  const [status, setStatus] = useState("ACTIVE");
  const [calling, setCalling] = useState<{ id: string; code: string; orderId?: string; collect?: boolean } | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const mutation = useApiMutation();
  const query = useApiQuery(signal => getOperationsApi().listQueue(status === "ACTIVE" ? undefined : status, { signal }), `queue:${status}`);
  function refresh() {
    setCalling(null);
    setReviewRequired(false);
    query.reload();
  }
  return <Page title="Pickup queue · ပါဆယ်တန်းစီစာရင်း" subtitle="Current restaurant-local queue day" onRefresh={refresh} refreshing={query.state.status === "loading"}>
    <Choices label="Ticket status" value={status} values={["ACTIVE", "WAITING", "READY", "CALLED", "COMPLETED", "CANCELLED"]} onChange={setStatus} />
    <MutationFeedback {...mutation} />
    {reviewRequired ? <Status tone="warning">Reload the current queue before reviewing another action. နောက်ဆုံးတန်းစီစာရင်းကို ပြန်လည်စစ်ဆေးပါ။</Status> : null}
    <Status tone="accent">Payment is independent · ငွေကောက်ခံမှု သီးခြားဖြစ်ပါသည်။ Calling or confirming physical pickup does not collect cash.</Status>
    <QueryResult {...query}>{tickets => <>{tickets.length ? tickets.map(ticket => <Card key={ticket.ticketId} title={ticket.displayCode}>
      <Badge tone={ticket.status === "READY" ? "success" : ticket.status === "CALLED" ? "accent" : ticket.status === "CANCELLED" ? "danger" : "neutral"}>{ticket.status}</Badge>
      <Body>Created {exactTimestamp(ticket.createdAt)}</Body>
      {ticket.readyAt ? <Body>Ready {exactTimestamp(ticket.readyAt)}</Body> : null}
      {ticket.calledAt ? <Body>Called {exactTimestamp(ticket.calledAt)}</Body> : null}
      {ticket.completedAt ? <Body>Completed {exactTimestamp(ticket.completedAt)}</Body> : null}
      {ticket.orderId ? <WorkspaceLink href={{ pathname: "/order/[orderId]", params: { orderId: ticket.orderId } }}>Open order for ticket {ticket.displayCode}</WorkspaceLink> : null}
      {ticket.status === "READY" ? <Action title="Call for pickup · လာယူရန် ခေါ်မည်" disabled={mutation.busy || reviewRequired} onPress={() => setCalling({ id: ticket.ticketId, code: ticket.displayCode })} /> : null}
      {ticket.orderId && ticket.status === "CALLED" ? <Action title="Confirm physical pickup · လက်ခံယူပြီးကြောင်း အတည်ပြုရန်" disabled={mutation.busy || reviewRequired}
        onPress={() => setCalling({ id: ticket.ticketId, code: ticket.displayCode, orderId: ticket.orderId ?? undefined, collect: true })} /> : null}
    </Card>) : <Card><Body>No tickets match this status today.</Body></Card>}
      <Body>Complete preparation from Orders. Call a ready ticket, then confirm physical pickup here. Payment collection remains separate.</Body>
    </>}</QueryResult>
    <Action title="Refresh queue" secondary disabled={mutation.busy} onPress={refresh} />
    <ConfirmDialog visible={calling !== null} title={calling?.collect ? "Confirm physical pickup" : "Call for pickup"} busy={mutation.busy} confirmDisabled={reviewRequired}
      message={calling ? calling.collect ? `Confirm the customer physically collected ticket ${calling.code}? Payment status stays unchanged. ${calling.code} ကို အမှန်တကယ် လက်ခံယူပြီးပါသလား။ ငွေပေးချေမှု မပြောင်းလဲပါ။` : `Notify the customer for ticket ${calling.code} that their order is ready for pickup? ${calling.code} ကို လာယူရန် အသိပေးမည်လား။` : ""}
      confirmLabel={calling?.collect ? "Confirm collected" : "Call customer"} onCancel={() => setCalling(null)} onConfirm={() => {
      const pending = calling;
      setCalling(null);
      if (pending && !reviewRequired && query.state.status === "ready" && query.state.data.some(ticket => ticket.ticketId === pending.id
        && (pending.collect ? ticket.status === "CALLED" && ticket.orderId === pending.orderId : ticket.status === "READY"))) {
        void mutation.run(async () => {
          if (pending.collect && pending.orderId) {
            // The legacy physical-pickup route has no expectedStatus field. Re-read the
            // linked authorized order; Spring still locks and validates the transition.
            const order = await getOperationsApi().getOrder(pending.orderId);
            if (order.queueTicketId !== pending.id || order.orderType !== "TAKEAWAY" || order.status !== "READY") {
              throw new FormValidationError("The linked order changed. Refresh the queue and review pickup again.");
            }
            await getOperationsApi().updateOrderStatus(pending.orderId, { status: "COMPLETED", note: "Physical pickup confirmed at collection counter." });
          } else {
            await getOperationsApi().callQueueTicket(pending.id);
          }
        }, refresh, () => setReviewRequired(true));
      }
    }} />
  </Page>;
}
