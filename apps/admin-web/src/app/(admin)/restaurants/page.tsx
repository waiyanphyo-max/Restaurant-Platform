import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Registry } from "@/components/Registry";
import { restaurantQuery, registryHref, type SearchParams } from "@/components/restaurant-query";
import { requireAdmin } from "@/lib/admin-context";

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = restaurantQuery(params);
  await requireAdmin(registryHref(query.page, query.search));
  return <><PageHeader title="Restaurants" description="Your restaurant network, organized. Review ownership, location and status." action={<Link className="button button-primary" href="/provisioning"><span aria-hidden="true">＋</span> Prepare restaurant</Link>} /><Registry params={params} /></>;
}
