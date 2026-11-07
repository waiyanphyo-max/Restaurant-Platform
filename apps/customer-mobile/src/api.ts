import { createCustomerApiClient, createPublicRestaurantApiClient } from "@restaurant-platform/api-client";
import { getCustomerAuth } from "./auth/native";
import { readEmbeddedTenant } from "./tenant";

/** Customer delivery routes always use the restaurant embedded in this Android build. */
export function getCustomerApi(expectedOwner?: string) {
  const tenant = readEmbeddedTenant();
  const auth = getCustomerAuth();
  const snapshot = auth.getSnapshot();
  const owner = expectedOwner ?? (snapshot.status === "signed_in" ? snapshot.userId : null);
  function isOwner() {
    const current = auth.getSnapshot();
    return owner !== null && current.status === "signed_in" && current.userId === owner;
  }
  return createCustomerApiClient({
    baseUrl: tenant.apiBaseUrl,
    restaurantId: tenant.restaurantId,
    async getAccessToken() {
      if (!isOwner()) return null;
      const token = await auth.getAccessToken();
      return isOwner() ? token : null;
    }
  });
}

export function getCustomerPublicApi() {
  const tenant = readEmbeddedTenant();
  return createPublicRestaurantApiClient({ baseUrl: tenant.apiBaseUrl, restaurantId: tenant.restaurantId });
}
