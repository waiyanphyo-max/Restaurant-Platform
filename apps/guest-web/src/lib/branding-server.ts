import { cache } from "react";
import { ApiProtocolError, createPublicRestaurantApiClient } from "@restaurant-platform/api-client";
import type { RestaurantBranding, RestaurantBrandingResponse, RestaurantConfig } from "@restaurant-platform/shared-types";
import { safeImageUrl } from "./menu";

export interface GuestBrandingPresentation {
  restaurantId: string;
  branding: RestaurantBranding;
  /** Null is a failed read, while zero truthfully describes an uninitialized palette. */
  revision: number | null;
  source: "runtime" | "uninitialized" | "fallback";
}

interface BrandingOptions { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }

async function readBranding(restaurantId: string, baseUrl: string, fetchImpl?: typeof fetch, timeoutMs = 8_000): Promise<RestaurantBrandingResponse> {
  const value = await createPublicRestaurantApiClient({ restaurantId, baseUrl, fetchImpl, timeoutMs }).getBranding();
  // The shared parser deliberately turns corrupt palettes into null. A persisted
  // palette must be complete; only revision zero legitimately has no palette.
  if ((value.palette === null) !== (value.revision === 0)) throw new ApiProtocolError();
  return value;
}

// React cache deduplicates only within an SSR request, keyed by the exact UUID and
// API environment. It is not a process-wide, browser or persistent branding cache.
const readRequestBranding = cache((restaurantId: string, baseUrl: string) => readBranding(restaurantId, baseUrl));

/** Call only with the existing server-resolved tenant, never a browser UUID. */
export async function loadGuestBranding(restaurant: Pick<RestaurantConfig, "restaurantId" | "branding">, options: BrandingOptions = {}): Promise<GuestBrandingPresentation> {
  const restaurantId = restaurant.restaurantId.toLowerCase();
  const fallback: GuestBrandingPresentation = {
    restaurantId, revision: null, source: "fallback",
    branding: { ...restaurant.branding, logoUrl: safeImageUrl(restaurant.branding.logoUrl) },
  };
  const baseUrl = options.baseUrl ?? process.env.GUEST_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) return fallback;
  try {
    const value = options.fetchImpl || options.timeoutMs !== undefined
      ? await readBranding(restaurantId, baseUrl, options.fetchImpl, options.timeoutMs)
      : await readRequestBranding(restaurantId, baseUrl);
    return {
      restaurantId, revision: value.revision, source: value.palette ? "runtime" : "uninitialized",
      branding: {
        ...restaurant.branding, ...value.palette,
        displayName: value.displayName,
        // A valid canonical null logo removes an old registry logo. The shared
        // parser has already checked the upload's public ?v=UUID cachebuster.
        logoUrl: value.logoUrl ?? undefined,
      },
    };
  } catch {
    // Never log or serialize upstream bodies/URLs or keep a foreign snapshot.
    return fallback;
  }
}
