import type { RestaurantBranding } from "@restaurant-platform/shared-types";

export interface EmbeddedOperationsTenant {
  restaurantId: string;
  slug: string;
  branding: RestaurantBranding;
  apiBaseUrl: string;
  guestBaseUrl: string | null;
  environment: "development" | "staging" | "production";
  phoneOtpRequested: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate public build metadata again at runtime; it never grants membership. */
export function parseEmbeddedTenant(extra: unknown): EmbeddedOperationsTenant {
  if (!isRecord(extra) || extra.appKind !== "operations" || !isRecord(extra.tenant)) {
    throw new Error("Operations build is missing its restaurant configuration");
  }
  const { tenant } = extra;
  if (typeof tenant.restaurantId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant.restaurantId) ||
      typeof tenant.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant.slug) || !isRecord(tenant.branding)) {
    throw new Error("Operations build has invalid restaurant identity");
  }
  if (typeof tenant.branding.displayName !== "string" || !tenant.branding.displayName.trim() ||
      typeof tenant.branding.primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(tenant.branding.primaryColor)) {
    throw new Error("Operations build has invalid branding");
  }
  if (!["development", "staging", "production"].includes(String(extra.mobileEnvironment)) || typeof extra.apiBaseUrl !== "string") {
    throw new Error("Operations build has invalid API environment");
  }
  const url = new URL(extra.apiBaseUrl);
  const localHttp = extra.mobileEnvironment === "development" && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Operations build has an unsafe API origin");
  }
  const branding: RestaurantBranding = { displayName: tenant.branding.displayName, primaryColor: tenant.branding.primaryColor };
  let guestBaseUrl: string | null = null;
  if (extra.guestBaseUrl != null) {
    if (typeof extra.guestBaseUrl !== "string") throw new Error("Invalid guest origin");
    const guest = new URL(extra.guestBaseUrl);
    const localGuest = extra.mobileEnvironment === "development" && guest.protocol === "http:" &&
      ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(guest.hostname);
    if ((guest.protocol !== "https:" && !localGuest) || guest.username || guest.password || guest.pathname !== "/" || guest.search || guest.hash) throw new Error("Unsafe guest origin");
    guestBaseUrl = guest.origin;
  }
  if (typeof tenant.branding.logoUrl === "string") {
    const logo = new URL(tenant.branding.logoUrl);
    if (logo.protocol !== "https:" || logo.username || logo.password || logo.search || logo.hash) throw new Error("Unsafe restaurant logo URL");
    branding.logoUrl = logo.href;
  }
  return {
    restaurantId: tenant.restaurantId.toLowerCase(), slug: tenant.slug, branding,
    apiBaseUrl: url.origin, guestBaseUrl, environment: extra.mobileEnvironment as EmbeddedOperationsTenant["environment"],
    phoneOtpRequested: isRecord(extra.features) && extra.features.phoneOtpRequested === true
  };
}
