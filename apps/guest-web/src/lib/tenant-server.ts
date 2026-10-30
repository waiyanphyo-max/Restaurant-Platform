import { resolveRestaurantByHost } from "@restaurant-platform/restaurant-config";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { headers } from "next/headers";
import { parseGuestConfigEnvironment } from "./deployment";

export async function resolveGuestTenant(): Promise<RestaurantConfig | null> {
  const environment = parseGuestConfigEnvironment(process.env.GUEST_CONFIG_ENV);
  if (!environment) return null;

  const host = (await headers()).get("host");
  if (!host) return null;

  try {
    return resolveRestaurantByHost(host, environment);
  } catch {
    // Invalid or ambiguous tenant configuration must never select a fallback restaurant.
    return null;
  }
}
