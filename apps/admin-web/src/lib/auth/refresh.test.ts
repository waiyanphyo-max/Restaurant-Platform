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
});
