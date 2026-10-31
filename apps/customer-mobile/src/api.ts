import { createCustomerApiClient } from "@restaurant-platform/api-client";
import { getCustomerAuth } from "./auth/native";
import { readEmbeddedTenant } from "./tenant";

/** Customer delivery routes always use the restaurant embedded in this Android build. */
export function getCustomerApi() {
  const tenant = readEmbeddedTenant();
  const auth = getCustomerAuth();
  return createCustomerApiClient({
    baseUrl: tenant.apiBaseUrl,
    restaurantId: tenant.restaurantId,
    getAccessToken: () => auth.getAccessToken()
  });
}
