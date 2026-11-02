import Constants from "expo-constants";
import { parseEmbeddedTenant } from "./config/embedded";
export type { EmbeddedOperationsTenant } from "./config/embedded";

/** The app never asks users to choose a restaurant; the Android build embeds it. */
export function readEmbeddedTenant() {
  return parseEmbeddedTenant(Constants.expoConfig?.extra);
}
