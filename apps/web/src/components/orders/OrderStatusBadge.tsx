import StatusBadge from "@/components/shared/StatusBadge";

export function OrderStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge status={status} fallback="Unknown" label="Order status" />;
}
