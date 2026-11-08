import Constants from "expo-constants";
import { applicationId } from "expo-application";
import { assertInstalledMobileApplication } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { parseEmbeddedTenant, type EmbeddedOperationsTenant } from "./config/embedded";
export type { EmbeddedOperationsTenant } from "./config/embedded";

let tenant: EmbeddedOperationsTenant | undefined;
/** The app never asks users to choose a restaurant; the Android build embeds it. */
export function readEmbeddedTenant(): EmbeddedOperationsTenant {
  if (!tenant) {
    const extra = Constants.expoConfig?.extra;
    assertInstalledMobileApplication(extra, applicationId);
    tenant = parseEmbeddedTenant(extra);
  }
  return tenant;
}
