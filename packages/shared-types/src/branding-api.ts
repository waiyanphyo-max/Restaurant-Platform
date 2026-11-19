import type { Uuid } from "./api.js";

/** Persisted runtime colors; semantic/contrast tokens are resolved by ui-tokens. */
export interface RuntimeBrandingPalette {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

/** Safe public identity. Revision describes the palette, not profile/logo changes. */
export interface RestaurantBrandingResponse {
  restaurantId: Uuid;
  displayName: string;
  logoUrl: string | null;
  /** Missing/invalid runtime branding uses the fixed tenant's reviewed build fallback. */
  palette: RuntimeBrandingPalette | null;
  /** Nonnegative safe integer. Zero means no runtime palette has been initialized. */
  revision: number;
}

/** Owner/Manager writes and trusted initialize-once writes use the same authority. */
export interface UpdateRestaurantBrandingRequest {
  expectedRevision: number;
  palette: RuntimeBrandingPalette;
}
