import type { RestaurantBranding } from "@restaurant-platform/shared-types";

type MobileAppKind = "operations" | "customer";
type MobileEnvironment = "development" | "staging" | "production";

interface MobileBranding extends RestaurantBranding {
  logoDataUri?: string;
}

interface MobileRouting {
  readonly scheme: string;
  readonly appLinkOrigin: string | null;
  readonly appLinkPathPrefix: string | null;
}

export interface EmbeddedMobileTenant {
  readonly restaurantId: string;
  readonly slug: string;
  readonly branding: Readonly<MobileBranding>;
  readonly apiBaseUrl: string;
  readonly guestBaseUrl: string | null;
  readonly environment: MobileEnvironment;
  readonly routing: MobileRouting;
  readonly phoneOtpRequested: boolean;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const color = /^#[0-9a-f]{6}$/i;
const pngDataUri = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function origin(value: unknown, environment: MobileEnvironment, guestSlug?: string): string {
  if (typeof value !== "string") throw new Error("Missing mobile origin");
  const url = new URL(value);
  const localHost = ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname) ||
    (guestSlug !== undefined && url.hostname === `${guestSlug}.localhost`);
  const local = environment === "development" && url.protocol === "http:" && localHost;
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Unsafe mobile origin");
  }
  return url.origin;
}

function parseBranding(value: unknown): Readonly<MobileBranding> {
  if (!isRecord(value) || typeof value.displayName !== "string" || !value.displayName.trim() ||
      typeof value.primaryColor !== "string" || !color.test(value.primaryColor)) {
    throw new Error("Invalid mobile branding");
  }
  const branding: MobileBranding = { displayName: value.displayName, primaryColor: value.primaryColor };
  for (const key of ["secondaryColor", "backgroundColor"] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !color.test(raw)) throw new Error("Invalid mobile branding color");
    branding[key] = raw;
  }
  if (value.logoUrl !== undefined) {
    if (typeof value.logoUrl !== "string") throw new Error("Invalid logo URL");
    const logo = new URL(value.logoUrl);
    if (logo.protocol !== "https:" || logo.username || logo.password || logo.search || logo.hash) {
      throw new Error("Unsafe logo URL");
    }
    branding.logoUrl = logo.href;
  }
  if (value.logoDataUri !== undefined) {
    if (typeof value.logoDataUri !== "string" || !pngDataUri.test(value.logoDataUri)) throw new Error("Invalid embedded logo");
    branding.logoDataUri = value.logoDataUri;
  }
  return Object.freeze(branding);
}

function parseRouting(
  value: unknown, kind: MobileAppKind, slug: string, environment: MobileEnvironment, guestBaseUrl: string | null
): MobileRouting {
  const legacyScheme = `rp-${slug}-${kind}`;
  if (value === undefined) {
    return Object.freeze({ scheme: legacyScheme, appLinkOrigin: null, appLinkPathPrefix: null });
  }
  const scheme = environment === "production" ? legacyScheme : `${legacyScheme}-${environment}`;
  if (!isRecord(value) || (value.scheme !== scheme && value.scheme !== legacyScheme)) {
    throw new Error("Invalid mobile deep link scheme");
  }
  if (value.appLinkOrigin == null && value.appLinkPathPrefix == null) {
    return Object.freeze({ scheme: value.scheme, appLinkOrigin: null, appLinkPathPrefix: null });
  }
  const appLinkPathPrefix = `/app/${kind}/`;
  const appLinkOrigin = origin(value.appLinkOrigin, "production");
  if (environment === "development" || appLinkOrigin !== guestBaseUrl || value.appLinkPathPrefix !== appLinkPathPrefix) {
    throw new Error("Invalid Android App Link association");
  }
  return Object.freeze({ scheme: value.scheme, appLinkOrigin, appLinkPathPrefix });
}

/** Reject a manifest for a different installed app, including on development clients. */
export function assertInstalledMobileApplication(extra: unknown, installedApplicationId: string | null): void {
  if (!installedApplicationId || !isRecord(extra) || !isRecord(extra.release) ||
      extra.release.applicationId !== installedApplicationId) {
    throw new Error("Mobile manifest does not match the installed Android application");
  }
}

/** Parse only public, build-time values. Every API request still requires server authorization. */
export function parseEmbeddedMobileTenant(extra: unknown, kind: MobileAppKind): EmbeddedMobileTenant {
  if (!isRecord(extra) || extra.appKind !== kind || !isRecord(extra.tenant)) throw new Error("Missing mobile build configuration");
  const { tenant, mobileEnvironment: environment } = extra;
  if (typeof tenant.restaurantId !== "string" || !uuid.test(tenant.restaurantId) ||
      typeof tenant.slug !== "string" || !slugPattern.test(tenant.slug)) throw new Error("Invalid restaurant identity");
  if (environment !== "development" && environment !== "staging" && environment !== "production") {
    throw new Error("Invalid mobile environment");
  }
  const guestBaseUrl = extra.guestBaseUrl == null ? null : origin(extra.guestBaseUrl, environment, tenant.slug);
  return Object.freeze({
    restaurantId: tenant.restaurantId.toLowerCase(),
    slug: tenant.slug,
    branding: parseBranding(tenant.branding),
    environment,
    apiBaseUrl: origin(extra.apiBaseUrl, environment),
    guestBaseUrl,
    routing: parseRouting(extra.routing, kind, tenant.slug, environment, guestBaseUrl),
    phoneOtpRequested: isRecord(extra.features) && extra.features.phoneOtpRequested === true
  });
}

const routes = {
  customer: { fixed: ["/home", "/menu", "/orders", "/profile"], detail: ["product", "order"] },
  operations: { fixed: ["/dashboard", "/orders", "/menu", "/deliveries", "/queue", "/notifications", "/profile"],
    detail: ["order", "delivery"] }
};

export function safeMobileDestination(path: unknown, kind: MobileAppKind): string | null {
  if (typeof path !== "string") return null;
  const { fixed, detail } = routes[kind];
  if (fixed.includes(path)) return path;
  const [root, resource, id, extra] = path.split("/");
  return root === "" && extra === undefined && detail.includes(resource) && uuid.test(id) ? path : null;
}

/** Accept only this build's scheme or verified origin and path prefix. Discard incoming query and fragment. */
export function resolveMobileSystemPath(path: string, kind: MobileAppKind, routing: MobileRouting): string | null {
  const customPrefix = `${routing.scheme}://`;
  let destination;
  if (path === "/") return "/";
  if (path.startsWith(customPrefix)) {
    const relative = path.slice(customPrefix.length).split(/[?#]/, 1)[0];
    destination = relative.startsWith("/") ? relative : `/${relative}`;
  } else {
    if (!routing.appLinkOrigin || !routing.appLinkPathPrefix) return null;
    const prefix = `${routing.appLinkOrigin}${routing.appLinkPathPrefix}`;
    if (!path.startsWith(prefix)) return null;
    destination = `/${path.slice(prefix.length).split(/[?#]/, 1)[0]}`;
  }
  if (destination === "/") return "/";
  const safe = safeMobileDestination(destination, kind);
  return safe ? `/open?destination=${encodeURIComponent(safe)}` : null;
}
