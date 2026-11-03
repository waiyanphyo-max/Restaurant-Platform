import { createSalesAccountingApiClient } from "@restaurant-platform/api-client";
import { getOperationsAuth } from "../../auth/native";
import { readEmbeddedTenant } from "../../tenant";

export function getSalesApi() {
  const tenant=readEmbeddedTenant();
  return createSalesAccountingApiClient({ baseUrl:tenant.apiBaseUrl,restaurantId:tenant.restaurantId,
    getAccessToken:()=>getOperationsAuth().getAccessToken() });
}
/** Formatting only: exact decimal strings never pass through binary floating point. */
export function salesAmount(value: string): string {
  return /^-?\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g,",") : "Amount unavailable";
}
