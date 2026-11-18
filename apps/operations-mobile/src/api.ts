import { createPublicRestaurantApiClient, createRestaurantMemberApiClient, createFinancialReportsApiClient, createProcurementApiClient, createExpenseCashApiClient } from "@restaurant-platform/api-client";
import { getOperationsAuth } from "./auth/native";
import { readEmbeddedTenant } from "./tenant";
import { scopedOperationsToken, type OperationsRequestAccess } from "./auth/workspace";

/** The configured tenant and token provider cannot be replaced by a runtime selector. */
export function getOperationsApi(expectedAccess?: OperationsRequestAccess) {
  const tenant = readEmbeddedTenant();
  const auth = getOperationsAuth();
  const publicOptions = {
    baseUrl: tenant.apiBaseUrl,
    allowPrivateLanHttp: tenant.allowPrivateLanHttp,
    restaurantId: tenant.restaurantId
  };
  const options = {
    ...publicOptions,
    getAccessToken: expectedAccess ? scopedOperationsToken(auth, expectedAccess) : () => auth.getAccessToken()
  };
  return { ...createRestaurantMemberApiClient(options), ...createFinancialReportsApiClient(options),
    ...createProcurementApiClient(options), ...createExpenseCashApiClient(options),
    getPublicMenu: createPublicRestaurantApiClient(publicOptions).getPublicMenu };
}
