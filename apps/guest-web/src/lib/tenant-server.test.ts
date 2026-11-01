import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveGuestTenant, resolveGuestTenantContext } from "./tenant-server";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), listRestaurantConfigs: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@restaurant-platform/restaurant-config", () => ({ listRestaurantConfigs: mocks.listRestaurantConfigs }));

const garden = {
  slug: "garden", restaurantId: "00000000-0000-4000-8000-000000000001",
  branding: { displayName: "Garden", primaryColor: "#147D64" },
  guestDomains: { staging: ["garden.staging.test"], production: ["garden.example.test"] },
};

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("server tenant context", () => {
  it("uses Host rather than attacker supplied forwarded headers or restaurant IDs", async () => {
    vi.stubEnv("GUEST_CONFIG_ENV", "production");
    mocks.headers.mockResolvedValue(new Headers({ host: "garden.example.test", "x-forwarded-host": "tea.example.test", "x-restaurant-id": "other" }));
    mocks.listRestaurantConfigs.mockReturnValue([garden]);
    expect(await resolveGuestTenantContext()).toEqual({ restaurant: garden, basePath: "" });
  });

  it("never accepts a forwarded host if Host is absent or unconfigured", async () => {
    vi.stubEnv("GUEST_CONFIG_ENV", "production");
    mocks.listRestaurantConfigs.mockReturnValue([garden]);
    const headerSets: Record<string, string>[] = [{ "x-forwarded-host": "garden.example.test" }, { host: "unknown.test", "x-forwarded-host": "garden.example.test" }];
    for (const headers of headerSets) {
      mocks.headers.mockResolvedValue(new Headers(headers));
      expect(await resolveGuestTenant()).toBeNull();
    }
  });

  it("returns the local route base only for a resolved opt-in slug", async () => {
    vi.stubEnv("GUEST_CONFIG_ENV", "staging");
    vi.stubEnv("GUEST_LOCAL_ROUTING", "true");
    vi.stubEnv("NODE_ENV", "development");
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3002", "x-guest-route-slug": "garden" }));
    mocks.listRestaurantConfigs.mockReturnValue([garden]);
    expect(await resolveGuestTenantContext()).toEqual({ restaurant: garden, basePath: "/r/garden" });
    expect(await resolveGuestTenant("other")).toBeNull();
  });

  it("fails closed on malformed registry and missing environment", async () => {
    vi.stubEnv("GUEST_CONFIG_ENV", "staging");
    mocks.headers.mockResolvedValue(new Headers({ host: "garden.staging.test" }));
    mocks.listRestaurantConfigs.mockImplementation(() => { throw new Error("ambiguous registry"); });
    expect(await resolveGuestTenant()).toBeNull();
    vi.stubEnv("GUEST_CONFIG_ENV", "");
    expect(await resolveGuestTenant()).toBeNull();
  });
});
