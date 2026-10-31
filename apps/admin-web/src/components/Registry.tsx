import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-context";
import { classifyAdminError, loginPath } from "@/lib/auth/route-policy";
import { Notice } from "./ui";
import { RestaurantsTable } from "./RestaurantsTable";
import { registryHref, restaurantQuery, type SearchParams } from "./restaurant-query";

export async function Registry({ params }: { params: SearchParams }) {
  const query = restaurantQuery(params);
  const href = registryHref(query.page, query.search);
  const { api } = await requireAdmin(href);
  const result = await api.listRestaurants(query).then(data => ({ data }), error => ({ error }));
  if ("error" in result) {
    const state = classifyAdminError(result.error);
    if (state === "signed-out") redirect(loginPath(href, "expired"));
    if (state === "forbidden" || state === "configuration") redirect("/access");
    return <Notice tone="error" title="Restaurant directory unavailable" action={<Link className="button button-secondary" href={href}>Try again</Link>}>We couldn’t retrieve the restaurant directory. Please try again.</Notice>;
  }
  const { data } = result;
  return <section className="panel directory-panel" aria-label="Restaurant directory">
    <div className="directory-toolbar"><div><h2>All restaurants <span className="count-badge">{data.totalElements.toLocaleString("en-US")}</span></h2><p>Search your platform’s restaurant records.</p></div><form action="/restaurants" className="search-form" role="search"><label htmlFor="restaurant-search" className="sr-only">Search restaurants</label><span aria-hidden="true" className="search-symbol">⌕</span><input id="restaurant-search" name="search" type="search" defaultValue={query.search} maxLength={200} placeholder="Search restaurants, owners, locations…" /><button className="button button-secondary" type="submit">Search</button></form></div>
    <RestaurantsTable rows={data.content} page={data.number} search={query.search} />
    <div className="pagination"><p>{data.totalElements === 0 ? "No restaurants" : `${data.number * data.size + 1}–${data.number * data.size + data.numberOfElements} of ${data.totalElements.toLocaleString("en-US")} restaurants`}</p><nav aria-label="Restaurant pagination">{data.first || data.totalElements === 0 ? <span className="button button-secondary" aria-disabled="true">← Previous</span> : <Link className="button button-secondary" href={registryHref(data.number - 1, query.search)}>← Previous</Link>}<span className="page-number">Page {data.totalPages === 0 ? 1 : data.number + 1} of {Math.max(1, data.totalPages)}</span>{data.last || data.totalElements === 0 ? <span className="button button-secondary" aria-disabled="true">Next →</span> : <Link className="button button-secondary" href={registryHref(data.number + 1, query.search)}>Next →</Link>}</nav></div>
  </section>;
}
