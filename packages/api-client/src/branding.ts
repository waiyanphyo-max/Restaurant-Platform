import type {
  RestaurantBrandingResponse, RuntimeBrandingPalette, UpdateRestaurantBrandingRequest
} from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError } from "./errors.js";

const isColor = (value: unknown): value is string =>
  typeof value === "string" && value.length === 7 && /^#[0-9a-fA-F]{6}$/.test(value);

function palette(value: unknown): RuntimeBrandingPalette | null {
  if (!value || typeof value !== "object") return null;
  const colors = value as Record<string, unknown>;
  if (!isColor(colors.primaryColor) || !isColor(colors.secondaryColor) || !isColor(colors.backgroundColor)) return null;
  return { primaryColor: colors.primaryColor, secondaryColor: colors.secondaryColor, backgroundColor: colors.backgroundColor };
}

function safeLogo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || !/^https:\/\//i.test(value) ||
      Array.from(value).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || value.includes("#") ||
      value.slice(8).split(/[/?#]/, 1)[0].includes("@")) return null;
  const queryStart = value.indexOf("?");
  // The Spring upload's UUID cachebuster is public; legacy signed/token queries are not.
  if (queryStart !== -1 && !/^v=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.slice(queryStart + 1))) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.hash ? value : null;
  } catch { return null; }
}

/**
 * Validate each response against this client's fixed tenant. No mutable/global cache is kept.
 * Invalid/missing palette data deliberately becomes null for resolveThemeTokens' fallback;
 * identity or revision failures reject the response and must retain the caller's safe state.
 */
export function checkedBrandingResponse(value: unknown, expectedRestaurantId: string): RestaurantBrandingResponse {
  if (!value || typeof value !== "object") throw new ApiProtocolError();
  const brand = value as Record<string, unknown>;
  if (typeof brand.restaurantId !== "string" || brand.restaurantId.toLowerCase() !== expectedRestaurantId ||
      typeof brand.displayName !== "string" || !brand.displayName.trim() ||
      !Number.isSafeInteger(brand.revision) || (brand.revision as number) < 0) throw new ApiProtocolError();
  // Project the public DTO instead of retaining arbitrary response properties or shared references.
  return {
    restaurantId: expectedRestaurantId,
    displayName: brand.displayName,
    logoUrl: safeLogo(brand.logoUrl),
    palette: palette(brand.palette),
    revision: brand.revision as number
  };
}

/** No actor, tenant, logo URL or deployment metadata can be forwarded by a palette write. */
export function checkedBrandingUpdate(value: UpdateRestaurantBrandingRequest): UpdateRestaurantBrandingRequest {
  const colors = palette(value?.palette);
  if (!Number.isSafeInteger(value?.expectedRevision) || value.expectedRevision < 0 || !colors) {
    throw new ApiConfigurationError("Branding requires a nonnegative safe revision and three six-digit hex colors");
  }
  return { expectedRevision: value.expectedRevision, palette: colors };
}
