import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, Page } from "../../components/ui";
import { Choices, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { exactTimestamp } from "./format";

export function QueueScreen() {
  const [status, setStatus] = useState("ACTIVE");
  const [calling, setCalling] = useState<string | null>(null);
  const mutation = useApiMutation();
  const query = useApiQuery(signal => getOperationsApi().listQueue(status === "ACTIVE" ? undefined : status, { signal }), `queue:${status}`);
  return <Page title="Queue and pickup" subtitle="Current restaurant-local queue day" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Choices label="Ticket status" value={status} values={["ACTIVE", "WAITING", "READY", "CALLED", "COMPLETED", "CANCELLED"]} onChange={setStatus} />
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{tickets => <>{tickets.length ? tickets.map(ticket => <Card key={ticket.ticketId} title={ticket.displayCode}>
      <Body>{ticket.status} · Created {exactTimestamp(ticket.createdAt)}</Body>
      {ticket.readyAt ? <Body>Ready {exactTimestamp(ticket.readyAt)}</Body> : null}
      {ticket.calledAt ? <Body>Called {exactTimestamp(ticket.calledAt)}</Body> : null}
      {ticket.status === "READY" ? <Action title="Call for pickup" disabled={mutation.busy} onPress={() => setCalling(ticket.ticketId)} /> : null}
    </Card>) : <Card><Body>No tickets match this status today.</Body></Card>}
      <Body>Mark linked orders ready or completed from Orders. Calling a ready ticket sends the existing pickup notification.</Body>
    </>}</QueryResult>
    <Action title="Refresh queue" secondary onPress={query.reload} />
    <ConfirmDialog visible={calling !== null} title="Call for pickup" message="Notify this customer that their order is ready for pickup?" confirmLabel="Call customer" onCancel={() => setCalling(null)} onConfirm={() => {
      const id = calling; setCalling(null); if (id) void mutation.run(() => getOperationsApi().callQueueTicket(id), query.reload);
    }} />
  </Page>;
}
