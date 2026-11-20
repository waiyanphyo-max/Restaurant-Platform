import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { RestaurantBootstrap } from "@/components/RestaurantBootstrap";
import { EmptyState, Notice } from "@/components/ui";
import type { SearchParams } from "@/components/restaurant-query";
import { requireAdmin } from "@/lib/admin-context";
import { classifyAdminError, loginPath } from "@/lib/auth/route-policy";

export default async function RestaurantSetupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id.toLowerCase() : "";
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const href = valid ? `/restaurant-setup?id=${id}` : "/restaurant-setup";
  const { api } = await requireAdmin(href);
  if (!valid) return <section className="panel"><EmptyState title="Choose a provisioned restaurant" description="Open an existing restaurant from the registry to resume its initial setup." action={<Link href="/restaurants">Open restaurant registry</Link>} /></section>;
  try {
    const snapshot = await api.getBootstrap(id);
    return <><Link className="back-link" href={`/restaurant-details?id=${id}`}>← Restaurant details</Link><PageHeader title={`Initial setup · ${snapshot.branding.displayName}`} description="Review the runtime palette, approved catalog, media mappings and Owner Operations handoff." /><RestaurantBootstrap key={id} initial={snapshot} /></>;
  } catch (error) {
    const state = classifyAdminError(error);
    if (state === "signed-out") redirect(loginPath(href, "expired"));
    if (state === "forbidden" || state === "configuration") redirect("/access");
    return <Notice tone="error" title="Initial setup unavailable" action={<Link href={href}>Refresh setup</Link>}>The current setup could not be loaded. No setup changes were submitted.</Notice>;
  }
}
