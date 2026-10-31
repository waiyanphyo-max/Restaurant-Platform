import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, Notice } from "@/components/ui";
import { formatDate, restaurantQuery, registryHref, type SearchParams } from "@/components/restaurant-query";
import { requireAdmin } from "@/lib/admin-context";
import { classifyAdminError, loginPath } from "@/lib/auth/route-policy";

export default async function RestaurantDetailsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = restaurantQuery(params);
  const id = typeof params.id === "string" ? params.id : "";
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { api } = await requireAdmin(validId ? registryHref(query.page, query.search, id) : "/restaurant-details");
  if (!validId) return <><PageHeader title="Restaurant details" description="A closer look at a restaurant in your platform." /><section className="panel"><EmptyState title="Choose a restaurant" description="Open a restaurant from the directory to review its profile, owner and activity totals." action={<Link className="button button-primary" href="/restaurants">Browse restaurants →</Link>} /></section></>;
  const result = await api.listRestaurants(query).then(data => ({ data }), error => ({ error }));
  if ("error" in result) {
    const state = classifyAdminError(result.error);
    if (state === "signed-out") redirect(loginPath(registryHref(query.page, query.search, id), "expired"));
    if (state === "forbidden" || state === "configuration") redirect("/access");
    return <Notice tone="error" title="Restaurant details unavailable" action={<Link className="button button-secondary" href={registryHref(query.page, query.search, id)}>Try again</Link>}>The directory could not be loaded. Please try again.</Notice>;
  }
  const restaurant = result.data.content.find(row => row.id.toLowerCase() === id.toLowerCase());
  if (!restaurant) return <><PageHeader title="Restaurant details" description="Find the current restaurant record in your directory." /><section className="panel"><EmptyState title="Restaurant selection is no longer available" description="The directory may have changed. Select the restaurant again to see its current summary." action={<Link className="button button-primary" href="/restaurants">Return to directory</Link>} /></section></>;
  const details = [
    ["Restaurant ID", restaurant.id], ["Slug", restaurant.slug ?? "Not recorded"],
    ["City", restaurant.city ?? "Not recorded"], ["Township", restaurant.township ?? "Not recorded"],
    ["Created (UTC)", formatDate(restaurant.createdAt)], ["Owner name", restaurant.ownerFullName ?? "Not recorded"],
    ["Owner email", restaurant.ownerEmail ?? "Not recorded"],
  ];
  return <><Link className="back-link" href={registryHref(query.page, query.search)}>← Restaurant directory</Link><PageHeader title={restaurant.name} description="Restaurant summary from the platform directory." action={<span className={`badge ${restaurant.active ? "badge-success" : "badge-neutral"}`}>{restaurant.active ? "Active" : "Inactive"}</span>} /><div className="detail-grid"><section className="panel"><h2>Restaurant profile</h2><dl className="detail-list">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="panel"><h2>Recorded activity</h2><div className="detail-stat"><span>Restaurant members</span><strong>{restaurant.memberCount.toLocaleString("en-US")}</strong></div><div className="detail-stat"><span>Total orders</span><strong>{restaurant.orderCount.toLocaleString("en-US")}</strong></div><p className="muted small">Totals across this restaurant’s recorded activity.</p></section></div><Notice title="Directory summary" tone="info">Detailed operational records and editing are not available in this workspace yet.</Notice></>;
}
