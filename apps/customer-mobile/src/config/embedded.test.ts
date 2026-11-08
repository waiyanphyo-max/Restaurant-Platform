import { describe, expect, it } from "vitest";
import { resolveMobileSystemPath, safeMobileDestination } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { parseEmbeddedTenant } from "./embedded";
const base = { appKind: "customer", tenant: { restaurantId: "11111111-1111-4111-8111-111111111111", slug: "cafe-one", branding: { displayName: "Cafe One", primaryColor: "#225588" } }, mobileEnvironment: "development", apiBaseUrl: "http://10.0.2.2:8080", mapsConfigured: false };
describe("customer build boundary", () => {
  it("captures frozen restaurant and branding independent of mutable input", () => {
    const input = structuredClone(base); const tenant = parseEmbeddedTenant(input);
    input.tenant.restaurantId = "22222222-2222-4222-8222-222222222222";
    input.tenant.branding.displayName = "Other restaurant";
    expect(tenant.restaurantId).toBe(base.tenant.restaurantId);
    expect(tenant.branding.displayName).toBe("Cafe One");
    expect(Object.isFrozen(tenant)).toBe(true); expect(Object.isFrozen(tenant.branding)).toBe(true);
    expect(() => Object.assign(tenant, { restaurantId: input.tenant.restaurantId })).toThrow();
  });
  it("defaults Maps, phone and notifications off without readiness metadata", () => {
    expect(parseEmbeddedTenant(base)).toMatchObject({ mapsConfigured: false, phoneOtpRequested: false, notificationsEnabled: false });
  });
  it.each([
    { ...base, appKind: "operations" }, { ...base, tenant: { ...base.tenant, restaurantId: "route-selected" } },
    { ...base, mobileEnvironment: "production" }, { ...base, apiBaseUrl: "http://untrusted.example.test" },
    { ...base, apiBaseUrl: "https://api.example.test/path" }, { ...base, apiBaseUrl: "https://user:password@api.example.test" },
    { ...base, initialMapRegion: { latitude: 91, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 } }
  ])("rejects incompatible identity, environment or map configuration", value => { expect(() => parseEmbeddedTenant(value)).toThrow(); });
  it("accepts zero coordinates without implicitly selecting a pin", () => {
    const tenant = parseEmbeddedTenant({ ...base, initialMapRegion: { latitude: 0, longitude: 0, latitudeDelta: 0.01, longitudeDelta: 0.01 } });
    expect(tenant.initialMapRegion?.latitude).toBe(0);
    expect(Object.isFrozen(tenant.initialMapRegion)).toBe(true);
  });
});

describe("restaurant-branded Customer link routing", () => {
  const guestBaseUrl = "https://cafe-one.example.test";
  const scheme = "rp-cafe-one-customer-staging";
  const routing = { scheme, appLinkOrigin: guestBaseUrl, appLinkPathPrefix: "/app/customer/" };
  const stage = { ...base, mobileEnvironment: "staging", apiBaseUrl: "https://api.cafe-one.example.test", guestBaseUrl, routing };

  it("accepts the configured scheme and guest origin and removes arbitrary input parameters", () => {
    const tenant = parseEmbeddedTenant(stage);
    const open = (url: string) => resolveMobileSystemPath(url, "customer", tenant.routing);
    expect(open(`${scheme}://menu?restaurantId=foreign#fragment`)).toBe("/open?destination=%2Fmenu");
    expect(open(`${scheme}:///menu`)).toBe("/open?destination=%2Fmenu");
    expect(open(`${guestBaseUrl}/app/customer/product/${base.tenant.restaurantId}`))
      .toBe(`/open?destination=%2Fproduct%2F${base.tenant.restaurantId}`);
    expect(open(`${scheme}:///`)).toBe("/");
  });

  it("ignores foreign schemes, origins, app kinds, traversal and unknown route inputs", () => {
    const tenant = parseEmbeddedTenant(stage);
    for (const url of [
      "rp-cafe-two-customer-staging://menu", "https://cafe-two.example.test/app/customer/menu",
      "https://cafe-one.example.test.evil.test/app/customer/menu", `${guestBaseUrl}/app/operations/orders`,
      `${guestBaseUrl}/app/customer/../customer/menu`, `${scheme}://product/%2Forder`,
      `${scheme}://checkout`, `${scheme}://order/not-a-uuid`, `${scheme}://open?destination=/menu`
    ]) expect(resolveMobileSystemPath(url, "customer", tenant.routing)).toBeNull();
    expect(safeMobileDestination(["/menu", "/orders"], "customer")).toBeNull();
  });

  it("rejects an App Link association that differs from the embedded public website", () => {
    expect(() => parseEmbeddedTenant({ ...stage, routing: { ...routing, appLinkOrigin: "https://cafe-two.example.test" } })).toThrow();
    expect(() => parseEmbeddedTenant({ ...stage, routing: { ...routing, appLinkPathPrefix: "/app/operations/" } })).toThrow();
  });
});
