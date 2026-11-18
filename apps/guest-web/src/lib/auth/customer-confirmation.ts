import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { stableConfirmationOrigin } from "@restaurant-platform/restaurant-config/customer-confirmation";
import { normalizeGuestHost } from "../tenant-routing";

export interface CustomerConfirmationContext {
  callbackUrl: string;
  nativeReturnUrl: string;
  displayName: string;
}

/** Host, tenant and deployment environment must agree; forwarded headers are not trusted. */
export function resolveCustomerConfirmationContext(
  hostHeader: string | null,
  deploymentEnvironment: string | undefined,
  environment: string,
  slug: string,
  restaurants: readonly RestaurantConfig[],
): CustomerConfirmationContext | null {
  if (deploymentEnvironment !== "staging" && deploymentEnvironment !== "production") return null;
  if (environment !== deploymentEnvironment && !(deploymentEnvironment === "staging" && environment === "development")) return null;
  const host = normalizeGuestHost(hostHeader);
  const origin = host && stableConfirmationOrigin(`https://${host}`);
  if (!origin || hostHeader?.toLowerCase() !== host) return null;
  const matches = restaurants.filter(restaurant => restaurant.guestDomains[deploymentEnvironment].includes(host));
  if (matches.length !== 1 || matches[0].slug !== slug) return null;
  const restaurant = matches[0];
  const scheme = `rp-${restaurant.slug}-customer` + (restaurant.schemaVersion === 2 && environment !== "production" ? `-${environment}` : "");
  return {
    callbackUrl: `${origin}/auth/customer-confirmation/${environment}/${restaurant.slug}`,
    nativeReturnUrl: `${scheme}://email-confirmation?result=returned`,
    displayName: restaurant.branding.displayName,
  };
}
