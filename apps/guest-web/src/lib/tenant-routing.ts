import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import type { GuestConfigEnvironment } from "./deployment";

export const GUEST_ROUTE_SLUG_HEADER = "x-guest-route-slug";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse Host itself. Forwarded-host and URL/query restaurant IDs are never inputs. */
export function normalizeGuestHost(value: string | null): string | null {
  if (!value || value !== value.trim() || /[/?#@\\\s]/.test(value)) return null;
  const match = /^(\[::1\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) {
    return null;
  }
  const host = match[1].toLowerCase().replace(/\.$/, "");
  if (host === "[::1]") return host;
  if (host.length > 253 || host.split(".").some((label) =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return host;
}

export function guestRouteSlug(pathname: string): string | null {
  const match = /^\/r\/([^/]+)(?:\/|$)/.exec(pathname);
  return match && slugPattern.test(match[1]) ? match[1] : null;
}

export interface GuestTenantRequest {
  host: string | null;
  environment: GuestConfigEnvironment | null;
  slug?: string;
  localRouting?: string;
  nodeEnvironment?: string;
}

/** A selector can only select a reviewed registry record, never an arbitrary UUID. */
export function resolveGuestTenantRequest(
  request: GuestTenantRequest,
  restaurants: readonly RestaurantConfig[],
): RestaurantConfig | null {
  const host = normalizeGuestHost(request.host);
  if (!host || !request.environment) return null;
  if (request.slug !== undefined && !slugPattern.test(request.slug)) return null;
  const environment = request.environment;

  const hostMatches = restaurants.filter((restaurant) =>
    restaurant.guestDomains[environment].includes(host));
  if (hostMatches.length > 1) return null;

  // The path development router must never change a restaurant's configured domain.
  if (hostMatches.length === 1) return request.slug === undefined ? hostMatches[0] : null;

  if (request.localRouting !== "true" || request.nodeEnvironment === "production") return null;
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const subdomain = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.localhost$/.exec(host)?.[1];
  if (!loopback && !subdomain) return null;
  if (subdomain && request.slug !== undefined && request.slug !== subdomain) return null;
  const slug = request.slug ?? subdomain;
  if (!slug) return null;
  const matches = restaurants.filter((restaurant) => restaurant.slug === slug);
  return matches.length === 1 ? matches[0] : null;
}
