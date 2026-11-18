import { useState } from "react";
import type { OrderAction, OrderSummaryDto } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { Action, Body, ConfirmDialog, FormField } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { useApiMutation } from "../../hooks/useApiMutation";
import { orderActions } from "./workflows";

export const orderActionLabels: Record<OrderAction, string> = { ACCEPT: "Accept", COMPLETE: "Complete", CANCEL: "Cancel" };
export function completeMeaning(order: { orderType: string; queueTicketId?: string | null }) {
  return order.orderType === "DELIVERY"
    ? "Complete preparation and mark ready for delivery handoff? Pickup, physical delivery and COD collection remain in Deliveries."
    : order.queueTicketId
      ? "Complete preparation and notify the pickup queue that this order is ready? Record collection separately from the queue. Payment stays unchanged."
      : "Complete restaurant fulfillment? Payment collection remains a separate action.";
}

export function OrderCardActions({ order, role, onChanged }: { order: OrderSummaryDto; role: string; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<OrderAction | null>(null);
  const mutation = useApiMutation();
  const actions = orderActions(order, role);
  return <>
    <MutationFeedback {...mutation} />
    {actions.includes("CANCEL") ? <FormField label="Cancellation reason (required to cancel, 10–500 characters)" value={reason}
      onChangeText={setReason} maxLength={500} editable={!mutation.busy} multiline /> : null}
    {actions.map(action => <Action key={action} title={orderActionLabels[action]} disabled={mutation.busy || action === "CANCEL" && reason.trim().length < 10}
      onPress={() => setPending(action)} />)}
    {!actions.length && order.status === "READY" ? <Body>Preparation complete. Handoff and collection use the separate delivery or pickup workflow.</Body> : null}
    <ConfirmDialog visible={pending !== null} title="Confirm order action" confirmLabel={pending ? orderActionLabels[pending] : "Confirm"}
      message={pending === "COMPLETE" ? completeMeaning(order) : pending === "CANCEL"
        ? "Cancel this order for the recorded reason? Staff may cancel only unpaid early orders. Collected payments require management review."
        : "Accept this order after reviewing all items and the full delivery address?"}
      onCancel={() => setPending(null)} onConfirm={() => {
        const action = pending;
        setPending(null);
        if (!action || !actions.includes(action) || action === "CANCEL" && reason.trim().length < 10) return;
        void mutation.run(() => getOperationsApi().executeOrderAction(order.id,
          { action, expectedStatus: order.status, reason: action === "CANCEL" ? reason.trim() : null }),
        () => { setReason(""); onChanged(); }, onChanged);
      }} />
  </>;
}
