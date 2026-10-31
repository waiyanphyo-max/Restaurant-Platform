export type SearchParams = Record<string, string | string[] | undefined>;

export function restaurantQuery(params: SearchParams) {
  const raw = typeof params.page === "string" ? params.page : "0";
  return {
    page: /^\d{1,6}$/.test(raw) ? Number(raw) : 0,
    size: 20,
    search: typeof params.search === "string" ? params.search.trim().slice(0, 200) : "",
  };
}

export function registryHref(page: number, search: string, id?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page > 0) params.set("page", String(page));
  if (id) params.set("id", id);
  return `${id ? "/restaurant-details" : "/restaurants"}${params.size ? `?${params}` : ""}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
