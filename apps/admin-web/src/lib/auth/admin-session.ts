import { ApiHttpError, createPlatformAdminApiClient } from "@restaurant-platform/api-client";
import type { PlatformOverviewResponse } from "@restaurant-platform/shared-types";
import { isValidAdminOrigin, parseAppStage } from "../deployment";
import { parsePublicSupabaseConfig } from "./public-config";
import { classifyAdminError } from "./route-policy";
import { createWebAuthSession, type WebAuthPort } from "./session";

export type AdminApi = ReturnType<typeof createPlatformAdminApiClient>;
export type AdminContext =
  | { state: "authorized"; userId: string; overview: PlatformOverviewResponse; api: AdminApi }
  | { state: "configuration"; issues: string[] }
  | { state: "signed-out" | "forbidden" | "unavailable" };

export interface AdminEnvironment {
  APP_STAGE?: string;
  ADMIN_WEB_ORIGIN?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
}

export function adminConfigurationIssues(environment: AdminEnvironment): string[] {
  const issues: string[] = [];
  if (!isValidAdminOrigin(environment.ADMIN_WEB_ORIGIN, parseAppStage(environment.APP_STAGE))) {
    issues.push("Set APP_STAGE and a valid ADMIN_WEB_ORIGIN for this environment.");
  }
  if (!parsePublicSupabaseConfig(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
    issues.push("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for sign-in.");
  }
  try {
    // Constructing the shared client validates its configured origin without sending a request.
    createPlatformAdminApiClient({ baseUrl: environment.NEXT_PUBLIC_API_BASE_URL ?? "", getAccessToken: () => null });
  } catch {
    issues.push("Set NEXT_PUBLIC_API_BASE_URL to the Spring API origin.");
  }
  return issues;
}

/** Authentication identifies a UUID. Only Spring's allowlist grants platform access. */
export async function resolveAdminContext(
  environment: AdminEnvironment,
  getAuth: () => Promise<WebAuthPort | null>,
  createApi: typeof createPlatformAdminApiClient = createPlatformAdminApiClient,
): Promise<AdminContext> {
  const issues = adminConfigurationIssues(environment);
  if (issues.length) return { state: "configuration", issues };
  try {
    const auth = await getAuth();
    if (!auth) return { state: "configuration", issues: ["Sign-in configuration is unavailable."] };
    const session = createWebAuthSession(auth);
    const userId = await session.restoreUserId();
    if (!userId) return { state: "signed-out" };
    const api = createApi({
      baseUrl: environment.NEXT_PUBLIC_API_BASE_URL ?? "",
      getAccessToken: session.getVerifiedAccessToken,
    });
    const overview = await api.getOverview();
    return { state: "authorized", userId, overview, api };
  } catch (error) {
    const state = classifyAdminError(error);
    if (state === "configuration") return {
      state,
      issues: [error instanceof ApiHttpError && error.code === "PLATFORM_ADMIN_NOT_CONFIGURED"
        ? "Configure PLATFORM_ADMIN_USER_IDS on the Spring backend with the approved Supabase user UUIDs."
        : "Check the configured Spring API origin."],
    };
    return { state: state === "not-found" ? "unavailable" : state };
  }
}
