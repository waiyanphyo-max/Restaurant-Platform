import { createPublicRestaurantApiClient, createRestaurantMemberApiClient, createFinancialReportsApiClient, createProcurementApiClient, createExpenseCashApiClient } from "@restaurant-platform/api-client";
import { getOperationsAuth } from "./auth/native";
import { readEmbeddedTenant } from "./tenant";

/** The configured tenant and token provider cannot be replaced by a runtime selector. */
export function getOperationsApi() {
  const tenant = readEmbeddedTenant();
  const auth = getOperationsAuth();
  const options = {
    baseUrl: tenant.apiBaseUrl,
    restaurantId: tenant.restaurantId,
    getAccessToken: () => auth.getAccessToken()
  };
  return { ...createRestaurantMemberApiClient(options), ...createFinancialReportsApiClient(options),
    ...createProcurementApiClient(options), ...createExpenseCashApiClient(options),
    getPublicMenu: createPublicRestaurantApiClient({ baseUrl: tenant.apiBaseUrl, restaurantId: tenant.restaurantId }).getPublicMenu };
}
