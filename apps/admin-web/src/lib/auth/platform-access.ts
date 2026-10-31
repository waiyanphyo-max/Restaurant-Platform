import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { PlatformOverviewResponse } from "@restaurant-platform/shared-types";

export type PlatformAccess =
  | { state: "authorized"; overview: PlatformOverviewResponse }
  | { state: "signed-out" | "forbidden" | "unavailable" };

/** A verified Supabase session is identity; only Spring's response grants platform access. */
export async function loadPlatformAccess(
  getOverview: () => Promise<PlatformOverviewResponse>,
): Promise<PlatformAccess> {
  try {
    return { state: "authorized", overview: await getOverview() };
  } catch (error) {
    if (error instanceof MissingAccessTokenError || (error instanceof ApiHttpError && error.status === 401)) {
      return { state: "signed-out" };
    }
    if (error instanceof ApiHttpError && error.status === 403) return { state: "forbidden" };
    return { state: "unavailable" };
  }
}
