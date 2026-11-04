import { useState } from "react";
import { Link } from "expo-router";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, Page } from "../../components/ui";
import { Choices, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp } from "./format";

export function QueueScreen() {
  const [status, setStatus] = useState("ACTIVE");
  const [calling, setCalling] = useState<{ id: string; code: string } | null>(null);
  const mutation = useApiMutation();
  const query = useApiQuery(signal => getOperationsApi().listQueue(status === "ACTIVE" ? undefined : status, { signal }), `queue:${status}`);
  function refresh() {
    setCalling(null);
    query.reload();
  }
  return <Page title="Queue and pickup" subtitle="Current restaurant-local queue day" onRefresh={refresh} refreshing={query.state.status === "loading"}>
    <Choices label="Ticket status" value={status} values={["ACTIVE", "WAITING", "READY", "CALLED", "COMPLETED", "CANCELLED"]} onChange={setStatus} />
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{tickets => <>{tickets.length ? tickets.map(ticket => <Card key={ticket.ticketId} title={ticket.displayCode}>
      <Body>{ticket.status} · Created {exactTimestamp(ticket.createdAt)}</Body>
      {ticket.readyAt ? <Body>Ready {exactTimestamp(ticket.readyAt)}</Body> : null}
      {ticket.calledAt ? <Body>Called {exactTimestamp(ticket.calledAt)}</Body> : null}
      {ticket.completedAt ? <Body>Completed {exactTimestamp(ticket.completedAt)}</Body> : null}
      {ticket.orderId ? <Link href={{ pathname: "/order/[orderId]", params: { orderId: ticket.orderId } }}>Open order for ticket {ticket.displayCode}</Link> : null}
      {ticket.status === "READY" ? <Action title="Call for pickup" disabled={mutation.busy} onPress={() => setCalling({ id: ticket.ticketId, code: ticket.displayCode })} /> : null}
    </Card>) : <Card><Body>No tickets match this status today.</Body></Card>}
      <Body>Mark linked orders ready or completed from Orders. Calling a ready ticket sends the existing pickup notification.</Body>
    </>}</QueryResult>
    <Action title="Refresh queue" secondary disabled={mutation.busy} onPress={refresh} />
    <ConfirmDialog visible={calling !== null} title="Call for pickup"
      message={calling ? `Notify the customer for ticket ${calling.code} that their order is ready for pickup?` : ""}
      confirmLabel="Call customer" onCancel={() => setCalling(null)} onConfirm={() => {
      const pending = calling;
      setCalling(null);
      if (pending && query.state.status === "ready" && query.state.data.some(ticket => ticket.ticketId === pending.id && ticket.status === "READY")) {
        void mutation.run(() => getOperationsApi().callQueueTicket(pending.id), refresh, refresh);
      }
    }} />
  </Page>;
}
