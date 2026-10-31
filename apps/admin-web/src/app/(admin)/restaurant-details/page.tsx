import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { RestaurantConfiguration } from "@/components/RestaurantConfiguration";
import { EmptyState, Notice } from "@/components/ui";
import { formatDate, restaurantQuery, registryHref, type SearchParams } from "@/components/restaurant-query";
import { requireAdmin } from "@/lib/admin-context";
import { classifyAdminError, loginPath } from "@/lib/auth/route-policy";
import { safeSetupUrl } from "@/lib/lifecycle";

export default async function RestaurantDetailsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = restaurantQuery(params);
  const id = typeof params.id === "string" ? params.id.toLowerCase() : "";
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const href = validId ? registryHref(query.page, query.search, id) : "/restaurant-details";
  const { api } = await requireAdmin(href);
  if (!validId) return <><PageHeader title="Restaurant details" description="Restaurant profile, onboarding and configuration." /><section className="panel"><EmptyState title="Choose a restaurant" description="Open a restaurant from the directory to review its profile, Owner and activity totals." action={<Link className="button button-primary" href="/restaurants">Browse restaurants →</Link>} /></section></>;
  const result = await api.getRestaurant(id).then(data => ({ data }), error => ({ error }));
  if ("error" in result) {
    const state = classifyAdminError(result.error);
    if (state === "signed-out") redirect(loginPath(href, "expired"));
    if (state === "forbidden" || state === "configuration") redirect("/access");
    if (state === "not-found") return <section className="panel"><EmptyState title="Restaurant not found" description="This restaurant is no longer available. Select a current record from the directory." action={<Link href="/restaurants">Return to directory</Link>} /></section>;
    return <Notice tone="error" title="Restaurant details unavailable" action={<Link className="button button-secondary" href={href}>Try again</Link>}>The restaurant could not be loaded. Please try again.</Notice>;
  }
  const detail = result.data;
  const { restaurant } = detail;
  const details = [
    ["Restaurant ID", restaurant.id], ["Public slug", restaurant.slug ?? "Not recorded"],
    ["Address", restaurant.address || "Not recorded"], ["City", restaurant.city ?? "Not recorded"],
    ["Township", restaurant.township ?? "Not recorded"], ["Contact phone", restaurant.phone || "Not recorded"],
    ["Timezone", detail.timezone ?? "Not configured"], ["Currency", detail.currency ?? "Not configured"], ["Created (UTC)", formatDate(restaurant.createdAt)],
  ];
  const statusLabels: Record<string, string> = { INVITED: "Invitation sent · awaiting acceptance", ACCEPTED: "Verified account", NOT_INVITED: "No invitation recorded", PROVIDER_UNAVAILABLE: "Auth provider unavailable · retry to check status" };
  const workspace = safeSetupUrl(detail.ownerWorkspaceUrl, restaurant.id);
  const qrSetup = safeSetupUrl(detail.qrSetupUrl, restaurant.id);
  return <><Link className="back-link" href={registryHref(query.page, query.search)}>← Restaurant directory</Link><PageHeader title={restaurant.name} description="Restaurant profile, Owner onboarding and application configuration." action={<span className={`badge ${restaurant.active ? "badge-success" : "badge-neutral"}`}>{restaurant.active ? "Active" : "Inactive"}</span>} />
    <div className="detail-grid"><section className="panel"><h2>Restaurant profile</h2><dl className="detail-list">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="panel"><h2>Recorded activity</h2><div className="detail-stat"><span>Restaurant members</span><strong>{detail.memberCount.toLocaleString("en-US")}</strong></div><div className="detail-stat"><span>Total orders</span><strong>{detail.orderCount.toLocaleString("en-US")}</strong></div><h3>Owner onboarding</h3>{detail.owners.length === 0 ? <Notice tone="warning" title="Owner not configured">No Owner membership is recorded for this restaurant.</Notice> : detail.owners.map(owner => <dl className="detail-list owner-details" key={owner.userId}><div><dt>Auth user ID</dt><dd>{owner.userId}</dd></div><div><dt>Owner name</dt><dd>{owner.fullName || "Not recorded"}</dd></div><div><dt>Auth account email</dt><dd>{owner.email || "Unavailable"}</dd></div><div><dt>Account status</dt><dd>{statusLabels[owner.invitationStatus]}</dd></div></dl>)}<Link className="text-link" href={href}>Refresh onboarding status →</Link></section></div>
    <RestaurantConfiguration key={restaurant.id + restaurant.updatedAt} detail={detail} />
    <section className="panel lifecycle-panel"><h2>Restaurant setup</h2><ol className="setup-list">{detail.setupInstructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ol><div className="setup-actions">{workspace && <a className="button button-secondary" href={workspace} target="_blank" rel="noopener noreferrer">Owner workspace ↗</a>}{qrSetup && <a className="button button-secondary" href={qrSetup} target="_blank" rel="noopener noreferrer">QR setup instructions ↗</a>}</div><p className="muted small">The Owner must sign in to configure QR ordering in Operations. Share the setup link with authorized operators.</p></section>
  </>;
}
