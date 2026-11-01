import { listRestaurantConfigs } from "@restaurant-platform/restaurant-config";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { headers } from "next/headers";
import { parseGuestConfigEnvironment } from "./deployment";
import { GUEST_ROUTE_SLUG_HEADER, resolveGuestTenantRequest } from "./tenant-routing";

export interface GuestTenantContext {
  restaurant: RestaurantConfig;
  basePath: string;
}

export async function resolveGuestTenantContext(slug?: string): Promise<GuestTenantContext | null> {
  const environment = parseGuestConfigEnvironment(process.env.GUEST_CONFIG_ENV);
  if (!environment) return null;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (!host) return null;
  const routeSlug = requestHeaders.get(GUEST_ROUTE_SLUG_HEADER) ?? undefined;
  if (slug !== undefined && routeSlug !== undefined && slug !== routeSlug) return null;
  const requestedSlug = slug ?? routeSlug;

  try {
    const restaurant = resolveGuestTenantRequest({
      host,
      environment,
      slug: requestedSlug,
      localRouting: process.env.GUEST_LOCAL_ROUTING,
      nodeEnvironment: process.env.NODE_ENV,
    }, listRestaurantConfigs());
    return restaurant ? { restaurant, basePath: requestedSlug ? `/r/${restaurant.slug}` : "" } : null;
  } catch {
    // Invalid or ambiguous tenant configuration must never select a fallback restaurant.
    return null;
  }
}

export async function resolveGuestTenant(slug?: string): Promise<RestaurantConfig | null> {
  return (await resolveGuestTenantContext(slug))?.restaurant ?? null;
}
