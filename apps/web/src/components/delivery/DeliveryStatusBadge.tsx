import StatusBadge from "@/components/shared/StatusBadge";

export function DeliveryStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge status={status} fallback="Unknown" label="Delivery status" />;
}
