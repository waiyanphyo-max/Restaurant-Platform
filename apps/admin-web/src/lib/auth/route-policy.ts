import { ApiConfigurationError, ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const adminPath = new RegExp(`^/(?:restaurants(?:/${uuid})?|provisioning|restaurant-details|settings)?$`, "i");

/** Return targets are restricted to the application's protected routes. */
export function safeReturnTo(value: string | undefined | null): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || /[\\#\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://admin.invalid");
    if (url.origin !== "https://admin.invalid" || !adminPath.test(url.pathname)) return "/";
    const query = new URLSearchParams();
    // Do not forward arbitrary authentication parameters through sign-in.
    if (url.pathname === "/restaurants" || url.pathname === "/restaurant-details") {
      const search = url.searchParams.get("search");
      const page = url.searchParams.get("page");
      const id = url.searchParams.get("id");
      if (search) query.set("search", search.slice(0, 200));
      if (page && /^\d{1,6}$/.test(page)) query.set("page", page);
      if (url.pathname === "/restaurant-details" && id && new RegExp(`^${uuid}$`, "i").test(id)) query.set("id", id);
    }
    return `${url.pathname}${query.size ? `?${query}` : ""}`;
  } catch {
    return "/";
  }
}

export function loginPath(returnTo?: string | null, reason?: "expired"): string {
  const query = new URLSearchParams();
  const safe = safeReturnTo(returnTo);
  if (safe !== "/") query.set("returnTo", safe);
  if (reason) query.set("reason", reason);
  return `/login${query.size ? `?${query}` : ""}`;
}

export type AdminErrorState = "configuration" | "signed-out" | "forbidden" | "not-found" | "unavailable";

export function classifyAdminError(error: unknown): AdminErrorState {
  if (error instanceof ApiConfigurationError) return "configuration";
  if (error instanceof ApiHttpError && error.status === 503 && error.code === "PLATFORM_ADMIN_NOT_CONFIGURED") return "configuration";
  if (error instanceof MissingAccessTokenError || (error instanceof ApiHttpError && error.status === 401)) return "signed-out";
  if (error instanceof ApiHttpError && error.status === 403) return "forbidden";
  if (error instanceof ApiHttpError && error.status === 404) return "not-found";
  return "unavailable";
}

export function isPublicAdminPath(path: string): boolean {
  return path === "/login" || path === "/access" || path === "/auth/callback" || path === "/auth/accept-invite";
}
