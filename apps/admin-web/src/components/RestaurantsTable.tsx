import Link from "next/link";
import type { PlatformRestaurantSummaryResponse } from "@restaurant-platform/shared-types";
import { DataTable, EmptyState } from "./ui";
import { formatDate, registryHref } from "./restaurant-query";

export function RestaurantsTable({ rows, page, search }: { rows: PlatformRestaurantSummaryResponse[]; page: number; search: string }) {
  return <DataTable caption="Restaurant directory" rows={rows} rowKey={row => row.id} emptyState={<EmptyState title={search ? "No matching restaurants" : "Your directory is empty"} description={search ? "Try a different restaurant name, owner or location." : "Restaurants will appear here when they have been provisioned."} action={search ? <Link className="button button-secondary" href="/restaurants">Clear search</Link> : <Link className="button button-secondary" href="/provisioning">Review provisioning</Link>} />} columns={[
    { key: "name", label: "Restaurant", render: row => <div className="restaurant-cell"><span className="restaurant-avatar" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span><div><Link className="row-link" href={registryHref(page, search, row.id)}>{row.name}</Link><span className="cell-secondary">{row.slug ?? "No slug assigned"}</span></div></div> },
    { key: "owner", label: "Owner", render: row => <div><span>{row.ownerFullName ?? "Not recorded"}</span><span className="cell-secondary">{row.ownerEmail ?? "No email recorded"}</span></div> },
    { key: "location", label: "Location", render: row => [row.township, row.city].filter(Boolean).join(", ") || "Not recorded" },
    { key: "status", label: "Status", render: row => <span className={`badge ${row.active ? "badge-success" : "badge-neutral"}`}><span className="status-dot" />{row.active ? "Active" : "Inactive"}</span> },
    { key: "created", label: "Created", render: row => formatDate(row.createdAt) },
    { key: "actions", label: "Details", render: row => <Link className="table-action" aria-label={`View ${row.name} details`} href={registryHref(page, search, row.id)}>View <span aria-hidden="true">↗</span></Link> },
  ]} />;
}
