import { describe, expect, it } from "vitest";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { guestRouteSlug, normalizeGuestHost, resolveGuestTenantRequest } from "./tenant-routing";

const restaurant = (slug: string, id: string): RestaurantConfig => ({
  schemaVersion: 1, slug, restaurantId: id,
  branding: { displayName: `${slug} kitchen`, primaryColor: slug === "garden" ? "#147D64" : "#974A16" },
  guestDomains: { staging: [`${slug}.staging.test`], production: [`${slug}.example.test`] },
  android: {
    operations: { displayName: slug, stagingApplicationId: `com.${slug}.ops.staging`, productionApplicationId: `com.${slug}.ops` },
    customer: { displayName: slug, stagingApplicationId: `com.${slug}.guest.staging`, productionApplicationId: `com.${slug}.guest` },
  },
});
const garden = restaurant("garden", "00000000-0000-4000-8000-000000000001");
const tea = restaurant("tea-house", "00000000-0000-4000-8000-000000000002");
const restaurants = [garden, tea];

describe("tenant request routing", () => {
  it("resolves each exact production domain to its own restaurant and brand", () => {
    expect(resolveGuestTenantRequest({ host: "garden.example.test", environment: "production" }, restaurants)).toEqual(garden);
    expect(resolveGuestTenantRequest({ host: "tea-house.example.test", environment: "production" }, restaurants)).toEqual(tea);
  });

  it("normalizes DNS case, a terminal dot, and a valid port", () => {
    expect(resolveGuestTenantRequest({ host: "GARDEN.EXAMPLE.TEST.:443", environment: "production" }, restaurants)).toEqual(garden);
  });

  it("does not use staging domains in production or a substring/suffix match", () => {
    for (const host of ["garden.staging.test", "example.test", "garden.example.test.attacker.test", "www.garden.example.test", "unknown.test"]) {
      expect(resolveGuestTenantRequest({ host, environment: "production" }, restaurants)).toBeNull();
    }
  });

  it("fails closed without an explicit environment or with an ambiguous mapping", () => {
    expect(resolveGuestTenantRequest({ host: "garden.example.test", environment: null }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ host: "garden.example.test", environment: "production" }, [garden, { ...tea, guestDomains: garden.guestDomains }])).toBeNull();
  });

  it("never lets a path slug override a registered restaurant host", () => {
    for (const slug of ["garden", "tea-house"]) {
      expect(resolveGuestTenantRequest({ host: "garden.example.test", environment: "production", slug, localRouting: "true", nodeEnvironment: "development" }, restaurants)).toBeNull();
    }
  });

  it.each(["localhost:3002", "127.0.0.1:3002", "[::1]:3002"])("supports opt-in path development on %s", (host) => {
    expect(resolveGuestTenantRequest({ host, environment: "staging", slug: "tea-house", localRouting: "true", nodeEnvironment: "development" }, restaurants)).toEqual(tea);
  });

  it("supports opt-in slug.localhost development without a path", () => {
    expect(resolveGuestTenantRequest({ host: "garden.localhost:3002", environment: "staging", localRouting: "true", nodeEnvironment: "development" }, restaurants)).toEqual(garden);
    expect(resolveGuestTenantRequest({ host: "garden.localhost:3002", environment: "staging", slug: "tea-house", localRouting: "true", nodeEnvironment: "development" }, restaurants)).toBeNull();
  });

  it("disables implicit local routing in a production build", () => {
    for (const host of ["localhost:3002", "garden.localhost:3002"]) {
      expect(resolveGuestTenantRequest({ host, environment: "staging", slug: "garden", localRouting: "true", nodeEnvironment: "production" }, restaurants)).toBeNull();
    }
  });

  it("requires the local flag, a known slug and an exact loopback host", () => {
    const local = { environment: "staging" as const, localRouting: "true", nodeEnvironment: "development", slug: "garden" };
    expect(resolveGuestTenantRequest({ ...local, host: "localhost", localRouting: undefined }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ ...local, host: "localhost", slug: "unknown" }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ ...local, host: "localhost", slug: undefined }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ ...local, host: "localhost.attacker.test" }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ ...local, host: "192.168.1.5" }, restaurants)).toBeNull();
    expect(resolveGuestTenantRequest({ ...local, host: "localhost", slug: "../tea-house" }, restaurants)).toBeNull();
  });

  it.each([null, "", " garden.example.test", "garden.example.test ", "https://garden.example.test", "garden.example.test/path", "garden.example.test@attacker.test", "garden.example.test,tea-house.example.test", "garden.example.test:0", "garden.example.test:65536", "garden.example.test..", "garden.example.test\\attacker.test"])("rejects malformed Host %s", (host) => {
    expect(normalizeGuestHost(host)).toBeNull();
  });
});

describe("middleware route slug extraction", () => {
  it("extracts a slug from nested local pages without reading credentials or queries", () => {
    expect(guestRouteSlug("/r/garden/menu/product-1")).toBe("garden");
    expect(guestRouteSlug("/r/tea-house")).toBe("tea-house");
  });

  it.each(["/", "/menu", "/r/", "/r/Garden", "/r/%2e%2e", "/r/garden?restaurantId=other"])("rejects noncanonical pathname %s", (path) => {
    expect(guestRouteSlug(path)).toBeNull();
  });
});
