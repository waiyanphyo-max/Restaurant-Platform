import type { RestaurantBranding } from "@restaurant-platform/shared-types";

export interface EmbeddedCustomerTenant {
  readonly restaurantId: string;
  readonly slug: string;
  readonly branding: Readonly<RestaurantBranding>;
  readonly apiBaseUrl: string;
  readonly environment: "development" | "staging" | "production";
  readonly phoneOtpRequested: boolean;
  readonly mapsConfigured: boolean;
  readonly notificationsEnabled: boolean;
  readonly initialMapRegion?: Readonly<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseEmbeddedTenant(extra: unknown): EmbeddedCustomerTenant {
  if (!record(extra) || extra.appKind !== "customer" || !record(extra.tenant)) throw new Error("Missing Customer build configuration");
  const item = extra.tenant;
  if (typeof item.restaurantId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.restaurantId) ||
      typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || !record(item.branding)) throw new Error("Invalid restaurant identity");
  const brand = item.branding;
  if (typeof brand.displayName !== "string" || !brand.displayName.trim() || typeof brand.primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(brand.primaryColor)) throw new Error("Invalid branding");
  if (!["development", "staging", "production"].includes(String(extra.mobileEnvironment)) || typeof extra.apiBaseUrl !== "string") throw new Error("Invalid API environment");
  const url = new URL(extra.apiBaseUrl);
  const local = extra.mobileEnvironment === "development" && url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Unsafe API origin");
  const branding: RestaurantBranding = { displayName: brand.displayName, primaryColor: brand.primaryColor };
  if (brand.logoUrl !== undefined) {
    if (typeof brand.logoUrl !== "string") throw new Error("Invalid logo");
    const logo = new URL(brand.logoUrl);
    if (logo.protocol !== "https:" || logo.username || logo.password || logo.search || logo.hash) throw new Error("Unsafe logo");
    branding.logoUrl = logo.href;
  }
  const point = extra.initialMapRegion;
  let initialMapRegion: EmbeddedCustomerTenant["initialMapRegion"];
  if (point !== undefined) {
    if (!record(point) || typeof point.latitude !== "number" || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
        typeof point.longitude !== "number" || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 ||
        typeof point.latitudeDelta !== "number" || !Number.isFinite(point.latitudeDelta) || point.latitudeDelta <= 0 || point.latitudeDelta > 180 ||
        typeof point.longitudeDelta !== "number" || !Number.isFinite(point.longitudeDelta) || point.longitudeDelta <= 0 || point.longitudeDelta > 360) throw new Error("Invalid initial map region");
    initialMapRegion = Object.freeze({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: point.latitudeDelta, longitudeDelta: point.longitudeDelta });
  }
  return Object.freeze({ restaurantId: item.restaurantId.toLowerCase(), slug: item.slug,
    branding: Object.freeze(branding), apiBaseUrl: url.origin, environment: extra.mobileEnvironment as EmbeddedCustomerTenant["environment"],
    phoneOtpRequested: record(extra.features) && extra.features.phoneOtpRequested === true,
    notificationsEnabled: record(extra.features) && extra.features.notificationsEnabled === true,
    mapsConfigured: extra.mapsConfigured === true, ...(initialMapRegion ? { initialMapRegion } : {}) });
}
