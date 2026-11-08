import Constants from "expo-constants";
import { applicationId } from "expo-application";
import { assertInstalledMobileApplication } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { parseEmbeddedTenant, type EmbeddedCustomerTenant } from "./config/embedded";

export type { EmbeddedCustomerTenant } from "./config/embedded";
let tenant: EmbeddedCustomerTenant | undefined;
/** Captured once from native build metadata. No route, account or form can select another restaurant. */
export function readEmbeddedTenant(): EmbeddedCustomerTenant {
  if (!tenant) {
    const extra = Constants.expoConfig?.extra;
    assertInstalledMobileApplication(extra, applicationId);
    tenant = parseEmbeddedTenant(extra);
  }
  return tenant;
}
