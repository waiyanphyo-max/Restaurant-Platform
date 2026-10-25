import StatusBadge from "@/components/shared/StatusBadge";

export function QueueStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge status={status} fallback="Unknown" label="Queue ticket status" />;
}
