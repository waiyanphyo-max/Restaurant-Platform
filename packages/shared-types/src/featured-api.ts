import type { Uuid } from "./api.js";

/** Editorial selection only; AVAILABLE follows the current server menu availability. */
export type FeaturedProductDto =
  | { productId: null; status: "NONE" }
  | { productId: Uuid; status: "AVAILABLE" | "UNAVAILABLE" };

export type FeaturedProductResponse = FeaturedProductDto & {
  restaurantId: Uuid;
  revision: number;
};

/** Explicit null clears the selection. Spring authorizes the verified restaurant Owner. */
export interface UpdateFeaturedProductRequest {
  productId: Uuid | null;
  expectedRevision: number;
}
