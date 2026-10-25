import StatusBadge from "@/components/shared/StatusBadge";

export function AvailabilityBadge({ available }: { available?: boolean | null }) {
  return <StatusBadge status={available === false ? "Unavailable" : "Available"} label="Product availability" />;
}
