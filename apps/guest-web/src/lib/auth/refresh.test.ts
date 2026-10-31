import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { refreshGuestAuthSession } from "./refresh";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Guest auth session refresh", () => {
  it("keeps an Auth outage from redirecting the guest auth landing route", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.createServerClient.mockReturnValue({ auth: { getClaims: async () => { throw new Error("Auth unavailable"); } } });
    const response = await refreshGuestAuthSession(new NextRequest("https://guest.example.test/auth/callback"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
