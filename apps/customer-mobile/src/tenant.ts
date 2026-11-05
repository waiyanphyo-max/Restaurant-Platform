import Constants from "expo-constants";
import { parseEmbeddedTenant, type EmbeddedCustomerTenant } from "./config/embedded";

export type { EmbeddedCustomerTenant } from "./config/embedded";
let tenant: EmbeddedCustomerTenant | undefined;
/** Captured once from native build metadata. No route, account or form can select another restaurant. */
export function readEmbeddedTenant(): EmbeddedCustomerTenant {
  tenant ??= parseEmbeddedTenant(Constants.expoConfig?.extra);
  return tenant;
}
