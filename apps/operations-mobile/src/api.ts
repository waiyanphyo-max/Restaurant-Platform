import { createRestaurantMemberApiClient } from "@restaurant-platform/api-client";
import { getOperationsAuth } from "./auth/native";
import { readEmbeddedTenant } from "./tenant";

/** The configured tenant and token provider cannot be replaced by a runtime selector. */
export function getOperationsApi() {
  const tenant = readEmbeddedTenant();
  const auth = getOperationsAuth();
  return createRestaurantMemberApiClient({
    baseUrl: tenant.apiBaseUrl,
    restaurantId: tenant.restaurantId,
    getAccessToken: () => auth.getAccessToken()
  });
}
