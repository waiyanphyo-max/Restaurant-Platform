import { useState } from "react";
import type { OrderAction, OrderSummaryDto } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { Action, Body, ConfirmDialog, Status } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { cancellationReasonError, orderActions } from "./workflows";
import { actionLabel, CancellationReason } from "./OrderPresentation";
import type { OrderActionCoordinator } from "./order-action-coordinator";

export const orderActionLabels: Record<OrderAction, string> = { ACCEPT: "Accept", COMPLETE: "Complete", CANCEL: "Cancel" };
export function completeMeaning(order: { orderType: string; queueTicketId?: string | null }) {
  return order.orderType === "DELIVERY"
    ? "Complete preparation and mark ready for delivery handoff? Pickup, physical delivery and COD collection remain in Deliveries. မီးဖိုချောင် ပြင်ဆင်မှုကိုသာ ပြီးဆုံးမည်။ ပို့ဆောင်ခြင်းနှင့် ငွေကောက်ခံခြင်းကို သီးခြား အတည်ပြုရပါမည်။"
    : order.queueTicketId
      ? "Complete preparation and notify the pickup queue that this order is ready? Record collection separately from the queue. Payment stays unchanged. ပြင်ဆင်ပြီး လာယူရန် အသင့်ဖြစ်ကြောင်း အသိပေးမည်။ အမှန်တကယ် လာယူခြင်းနှင့် ငွေလက်ခံခြင်းကို သီးခြား အတည်ပြုရပါမည်။"
      : "Complete restaurant fulfillment? Payment collection remains a separate action. အော်ဒါဆောင်ရွက်မှု ပြီးဆုံးမည်လား။ ငွေကောက်ခံမှုကို သီးခြား အတည်ပြုရပါမည်။";
}

export function OrderCardActions({ order, role, onChanged, coordinator }: { order: OrderSummaryDto; role: string; onChanged: () => void; coordinator?: OrderActionCoordinator }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<OrderAction | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const mutation = useApiMutation();
  const actions = orderActions(order, role);
  return <>
    <MutationFeedback {...mutation} />
    {reviewRequired ? <><Status tone="warning">Review the latest order before another action. နောက်တစ်ကြိမ် မလုပ်မီ နောက်ဆုံးအခြေအနေကို စစ်ဆေးပါ။</Status>
      <Action title="Reload latest order · ပြန်လည်စစ်ဆေးမည်" secondary onPress={onChanged} /></> : null}
    {actions.map(action => <Action key={action} title={actionLabel[action]} danger={action === "CANCEL"} secondary={action === "CANCEL"}
      disabled={mutation.busy || reviewRequired || coordinator?.isBlocked(order.id)}
      onPress={() => setPending(action)} />)}
    {!actions.length && order.status === "READY" ? <Body>Preparation complete. Handoff and collection use the separate delivery or pickup workflow.</Body> : null}
    <ConfirmDialog visible={pending !== null} title="Review order action · ဆောင်ရွက်ချက် စစ်ဆေးရန်" confirmLabel={pending ? actionLabel[pending] : "Confirm"}
      danger={pending === "CANCEL"} busy={mutation.busy} confirmDisabled={reviewRequired || coordinator?.isBlocked(order.id) || pending === "CANCEL" && !!cancellationReasonError(reason)}
      message={pending === "COMPLETE" ? completeMeaning(order) : pending === "CANCEL"
        ? "Cancel this order for the recorded reason? Staff may cancel only unpaid early orders. Collected payments require management review. ဤအကြောင်းပြချက်ဖြင့် ပယ်ဖျက်မည်လား။ ငွေလက်ခံပြီးပါက စီမံခန့်ခွဲသူ၏ စစ်ဆေးမှု လိုအပ်ပါသည်။"
        : "Accept this order after reviewing all items and the full delivery address? ပစ္စည်းနှင့် ပို့ဆောင်မည့် လိပ်စာကို စစ်ဆေးပြီး လက်ခံမည်လား။"}
      onCancel={() => setPending(null)} onConfirm={() => {
        const action = pending;
        setPending(null);
        if (!action || reviewRequired || coordinator?.isBlocked(order.id) || !actions.includes(action) || action === "CANCEL" && cancellationReasonError(reason)) return;
        void mutation.run(async () => {
          if (coordinator && !coordinator.begin(order.id)) throw new FormValidationError("An action is already pending. Reload and review the latest order.");
          try {
            return await getOperationsApi().executeOrderAction(order.id,
              { action, expectedStatus: order.status, reason: action === "CANCEL" ? reason.trim() : null });
          } finally {
            // This runs even after the card is filtered out and the hook discards
            // its stale callbacks. Keep the page lock until a fresh read completes.
            coordinator?.settle(order.id);
          }
        }, () => { setReason(""); if (!coordinator) onChanged(); }, () => {
          setReviewRequired(true); if (!coordinator) onChanged();
        });
      }}>{pending === "CANCEL" ? <CancellationReason value={reason} onChange={setReason} disabled={mutation.busy} /> : null}</ConfirmDialog>
  </>;
}
