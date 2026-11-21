import type { OrderAction } from "@restaurant-platform/shared-types";
import { Badge, Body, FormField, type StatusTone } from "../../components/ui";
import { cancellationReasonError } from "./workflows";

const statuses: Record<string, { label: string; tone: StatusTone }> = {
  PENDING: { label: "New · အသစ်", tone: "warning" },
  ACCEPTED: { label: "Accepted · လက်ခံပြီး", tone: "accent" },
  PREPARING: { label: "Preparing · ပြင်ဆင်ဆဲ", tone: "accent" },
  READY: { label: "Ready for handoff · လွှဲပေးရန် အသင့်", tone: "success" },
  OUT_FOR_DELIVERY: { label: "Out for delivery · ပို့ဆောင်ဆဲ", tone: "accent" },
  COMPLETED: { label: "Completed · ပြီးဆုံး", tone: "success" },
  CANCELLED: { label: "Cancelled · ပယ်ဖျက်ပြီး", tone: "danger" }
};
export function OrderStatusBadge({ status }: { status: string }) {
  const presentation = statuses[status];
  return <Badge tone={presentation?.tone ?? "neutral"}>{presentation?.label ?? status}</Badge>;
}
export function serviceLabel(order: { orderType: string; orderChannel: string }) {
  const mode = order.orderType === "DINE_IN" ? "Dine in · ဆိုင်တွင်း" : order.orderType === "TAKEAWAY" ? "Takeaway · ပါဆယ်"
    : order.orderType === "DELIVERY" ? "Delivery · အိမ်အရောက်" : order.orderType;
  const channel: Record<string, string> = { STAFF: "Counter · ကောင်တာ", TABLE_QR: "Table QR", COMMON_QR: "Pickup QR", CUSTOMER_APP: "Customer app" };
  return `${mode} · ${channel[order.orderChannel] ?? order.orderChannel}`;
}
export const actionLabel: Record<OrderAction, string> = {
  ACCEPT: "Accept · လက်ခံမည်", COMPLETE: "Complete · ပြီးဆုံးမည်", CANCEL: "Cancel order · ပယ်ဖျက်မည်"
};
export function CancellationReason({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  return <>
    <FormField label="Cancellation reason (10–500 characters) · ပယ်ဖျက်ရသည့် အကြောင်းပြချက်" value={value}
      onChangeText={onChange} multiline maxLength={500} editable={!disabled} error={value ? cancellationReasonError(value) : undefined}
      accessibilityHint="A reason is required before cancellation. ပယ်ဖျက်ရန် အကြောင်းပြချက် လိုအပ်ပါသည်။" />
    <Body tone="muted">{value.trim().length}/500 · Cancellation does not issue a refund. ပယ်ဖျက်ခြင်းသည် ငွေပြန်အမ်းခြင်း မဟုတ်ပါ။</Body>
  </>;
}
