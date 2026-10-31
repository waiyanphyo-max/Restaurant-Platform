import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { refreshAdminSession } from "./refresh";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), getClaims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

interface CookieAdapter {
  setAll(cookies: { name: string; value: string; options: { path: string } }[], headers: Record<string, string>): void;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.getClaims.mockReset();
  mocks.createServerClient.mockReset();
  mocks.createServerClient.mockImplementation((...args: unknown[]) => {
    const { cookies } = args[2] as { cookies: CookieAdapter };
    return { auth: { getClaims: async () => {
      cookies.setAll([{ name: "sb-session", value: "refreshed-session", options: { path: "/" } }],
        { "Cache-Control": "private, no-store" });
      return mocks.getClaims();
    } } };
  });
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("Admin SSR session refresh", () => {
  it("propagates refreshed cookies and prevents shared caching", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } }, error: null });
    const response = await refreshAdminSession(new NextRequest("https://admin.example.test/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("sb-session=refreshed-session");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("redirects invalid claims to sign-in and retains refreshed cookie headers", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "untrusted-subject" } }, error: { message: "invalid" } });
    const response = await refreshAdminSession(new NextRequest("https://admin.example.test/?next=https://evil.example"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.example.test/login");
    expect(response.headers.get("set-cookie")).toContain("sb-session=refreshed-session");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("protects every nested admin route and preserves a safe return destination", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    for (const path of ["/restaurants", "/provisioning", "/restaurant-details", "/settings"]) {
      const response = await refreshAdminSession(new NextRequest(`https://admin.example.test${path}`));
      const location = new URL(response.headers.get("location")!);
      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("returnTo")).toBe(path);
    }
  });

  it("keeps the access status and login routes available without a session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    for (const path of ["/login", "/access", "/auth/callback", "/auth/accept-invite"]) {
      const response = await refreshAdminSession(new NextRequest(`https://admin.example.test${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("rejects a malformed subject even when Auth returned no error", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "admin@example.test" } }, error: null });
    expect((await refreshAdminSession(new NextRequest("https://admin.example.test/settings"))).status).toBe(307);
  });

  it("allows a missing configuration error to render while preventing shared caching", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await refreshAdminSession(new NextRequest("https://admin.example.test/settings"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("overwrites client-supplied return-path hints with the sanitized actual request path", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } }, error: null });
    const response = await refreshAdminSession(new NextRequest("https://admin.example.test/restaurants?search=Selected&page=2&token=discarded", {
      headers: { "x-admin-return-path": "https://evil.test" },
    }));
    expect(response.headers.get("x-middleware-request-x-admin-return-path")).toBe("/restaurants?search=Selected&page=2");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-session=refreshed-session");
  });

  it("sets a trusted request path even when missing configuration prevents refresh", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await refreshAdminSession(new NextRequest("https://admin.example.test/settings", {
      headers: { "x-admin-return-path": "//evil.test" },
    }));
    expect(response.headers.get("x-middleware-request-x-admin-return-path")).toBe("/settings");
  });
});
