import type { FeaturedProductResponse, UpdateFeaturedProductRequest } from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError } from "./errors.js";
import { requireUuid } from "./tenant.js";

export function checkedFeaturedResponse(value: unknown, restaurantId: string): FeaturedProductResponse {
  if (!value || typeof value !== "object") throw new ApiProtocolError();
  const row = value as Record<string, unknown>;
  if (typeof row.restaurantId !== "string" || row.restaurantId.toLowerCase() !== restaurantId ||
      !Number.isSafeInteger(row.revision) || (row.revision as number) < 0) throw new ApiProtocolError();
  const revision = row.revision as number;
  if (row.status === "NONE" && row.productId === null) {
    return { restaurantId, revision, productId: null, status: "NONE" };
  }
  if ((row.status !== "AVAILABLE" && row.status !== "UNAVAILABLE") || typeof row.productId !== "string" || revision === 0) {
    throw new ApiProtocolError();
  }
  let productId: string;
  try { productId = requireUuid(row.productId, "productId"); } catch { throw new ApiProtocolError(); }
  return { restaurantId, revision, productId, status: row.status };
}

/** Never forward actor/tenant IDs, media URLs or general product fields into an editorial write. */
export function checkedFeaturedUpdate(value: UpdateFeaturedProductRequest): UpdateFeaturedProductRequest {
  if (!Number.isSafeInteger(value?.expectedRevision) || value.expectedRevision < 0 || value.productId === undefined) {
    throw new ApiConfigurationError("Featured requires an explicit product UUID or null and a nonnegative safe revision");
  }
  return { productId: value.productId === null ? null : requireUuid(value.productId, "productId"), expectedRevision: value.expectedRevision };
}
