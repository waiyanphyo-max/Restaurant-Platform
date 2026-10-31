import type { PlatformOverviewResponse } from "@restaurant-platform/shared-types";
import { classifyAdminError } from "./route-policy";

export type PlatformAccess =
  | { state: "authorized"; overview: PlatformOverviewResponse }
  | { state: "signed-out" | "forbidden" | "configuration" | "unavailable" };

/** A verified Supabase session is identity; only Spring's response grants platform access. */
export async function loadPlatformAccess(
  getOverview: () => Promise<PlatformOverviewResponse>,
): Promise<PlatformAccess> {
  try {
    return { state: "authorized", overview: await getOverview() };
  } catch (error) {
    const state = classifyAdminError(error);
    return { state: state === "not-found" ? "unavailable" : state };
  }
}
