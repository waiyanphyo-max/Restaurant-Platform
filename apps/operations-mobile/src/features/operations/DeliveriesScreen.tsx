import { useState } from "react";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Card, DataTable, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";

export function DeliveriesScreen() {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  // Use the assigned-to-self endpoint for Staff as well as dedicated Drivers.
  const management = state.status === "ready" && state.membership.role === "MANAGER";
  const query = useApiQuery(signal => management
    ? getOperationsApi().listDeliveries({ page, size: 20 }, { signal })
    : getOperationsApi().listMyDeliveries({ page, size: 20 }, { signal }), `deliveries:${management}:${page}`);
  return <Page title="Deliveries" subtitle={management ? "Restaurant delivery activity" : "Deliveries assigned to you"}>
    <QueryResult {...query}>{data => <>
      <Card><DataTable columns={["Order", "Delivery status", "Customer", "Address"]} rows={data.content.map(delivery => ({ key: delivery.id,
        cells: [delivery.orderNumber, delivery.status, delivery.customerName ?? "—", delivery.deliveryAddress ?? "—"] }))} /></Card>
      <Action title="Previous page" secondary disabled={data.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh deliveries" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}
