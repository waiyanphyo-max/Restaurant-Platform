import { afterEach, describe, expect, it, vi } from "vitest";
import { adminConfigurationIssues, resolveAdminContext, type AdminEnvironment } from "./admin-session";
import type { WebAuthPort } from "./session";

const userId = "00000000-0000-4000-8000-000000000001";
const environment: AdminEnvironment = {
  APP_STAGE: "local", ADMIN_WEB_ORIGIN: "http://localhost:3001",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:8080",
};
const overview = { totalRestaurants: 0, activeRestaurants: 0, inactiveRestaurants: 0, totalOrders: 0, totalRestaurantMembers: 0 };

function authPort(): WebAuthPort {
  return {
    signInWithPassword: vi.fn(), signOut: vi.fn(),
    getClaims: vi.fn(async () => ({ data: { claims: { sub: userId, email: "admin@example.test", role: "PLATFORM_ADMIN" } }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: { user: { id: userId }, access_token: "test-current-token" } }, error: null })),
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("server platform admin context", () => {
  it("fails closed before authentication or HTTP when frontend configuration is missing", async () => {
    const getAuth = vi.fn(async () => authPort());
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await resolveAdminContext({}, getAuth)).toEqual({ state: "configuration", issues: adminConfigurationIssues({}) });
    expect(getAuth).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(adminConfigurationIssues(environment)).toEqual([]);
    expect(adminConfigurationIssues({ ...environment, NEXT_PUBLIC_API_BASE_URL: "https://api.test/path" })).toHaveLength(1);
  });

  it("requires verified identity and never treats a stored session as authorization", async () => {
    const auth = authPort();
    auth.getClaims = vi.fn(async () => ({ data: null, error: { message: "expired" } }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await resolveAdminContext(environment, async () => auth)).toEqual({ state: "signed-out" });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the shared authenticated Spring client and only grants access after its response", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(overview), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const context = await resolveAdminContext(environment, async () => authPort());
    expect(context).toMatchObject({ state: "authorized", userId, overview });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://localhost:8080/api/v1/platform/overview");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-current-token");
    expect(options).toMatchObject({ cache: "no-store", credentials: "omit", redirect: "error" });
  });

  it.each([[401, "UNAUTHORIZED", "signed-out"], [403, "FORBIDDEN", "forbidden"], [500, "INTERNAL_ERROR", "unavailable"]])(
    "handles HTTP %s without granting access from email or metadata", async (status, code, state) => {
      const fetch = vi.fn(async () => new Response(JSON.stringify({ code }), { status: Number(status), headers: { "content-type": "application/json" } }));
      vi.stubGlobal("fetch", fetch);
      expect(await resolveAdminContext(environment, async () => authPort())).toEqual({ state });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("explains backend allowlist configuration separately from network failure", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: "PLATFORM_ADMIN_NOT_CONFIGURED" }),
      { status: 503, headers: { "content-type": "application/json", "retry-after": "60" } }));
    vi.stubGlobal("fetch", fetch);
    const context = await resolveAdminContext(environment, async () => authPort());
    expect(context.state).toBe("configuration");
    if (context.state === "configuration") expect(context.issues.join(" ")).toContain("PLATFORM_ADMIN_USER_IDS");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValueOnce(new TypeError("Network failed"));
    fetch.mockRejectedValueOnce(new TypeError("Network failed"));
    expect(await resolveAdminContext(environment, async () => authPort())).toEqual({ state: "unavailable" });
  });
});
