import { describe, expect, it } from "vitest";
import type { PlatformRestaurantConfigurationRequest } from "@restaurant-platform/shared-types";
import { validateRestaurantConfiguration } from "./configuration";

function valid(): PlatformRestaurantConfigurationRequest {
  return {
    name: "Example Kitchen", slug: "example-kitchen", logoUrl: "https://images.example.test/kitchen.png",
    configuration: {
      primaryColor: "#24563b", secondaryColor: null,
      guestDomains: { staging: ["staging.example.test"], production: ["example.test"] },
      android: {
        operations: { displayName: "Example operations", stagingApplicationId: "com.example.operations.staging", productionApplicationId: "com.example.operations", iconPath: "assets/operations/icon.png" },
        customer: { displayName: null, stagingApplicationId: "com.example.customer.staging", productionApplicationId: "com.example.customer", iconPath: null },
      },
    },
  };
}

describe("restaurant configuration validation", () => {
  it("accepts valid branding, optional metadata and distinct deployment identifiers without changing the request", () => {
    const request = valid();
    const before = structuredClone(request);
    expect(validateRestaurantConfiguration(request)).toEqual({});
    expect(request).toEqual(before);
    request.logoUrl = null;
    request.configuration.primaryColor = " ";
    request.configuration.guestDomains = { staging: [], production: [] };
    expect(validateRestaurantConfiguration(request)).toEqual({});
  });

  it("rejects missing names, malformed slugs and malformed theme colors", () => {
    const request = valid();
    request.name = "  "; request.slug = "Example--Kitchen";
    request.configuration.primaryColor = "red"; request.configuration.secondaryColor = "#fff";
    expect(validateRestaurantConfiguration(request)).toMatchObject({ name: expect.any(String), slug: expect.any(String), primaryColor: expect.any(String), secondaryColor: expect.any(String) });
    request.name = "x".repeat(151); request.slug = "x".repeat(101);
    expect(validateRestaurantConfiguration(request)).toHaveProperty("name");
    expect(validateRestaurantConfiguration(request)).toHaveProperty("slug");
  });

  it.each(["http://images.example.test/logo.png", "https://user:secret@images.example.test/logo.png", "https://images.example.test/logo.png?token=secret", "https://images.example.test/logo.png#secret", "https://images.example.test/logo.png?", "https://images.example.test/logo.png#", "javascript:alert(1)", "https://images.example.test/bad logo.png"])("rejects unsafe logo URL %s", logoUrl => {
    expect(validateRestaurantConfiguration({ ...valid(), logoUrl })).toHaveProperty("logoUrl");
  });

  it.each(["https://example.test", "example.test/path", "example.test?secret=x", "example.test#secret", "127.0.0.1", "localhost", "bad_host.example", "-bad.example", "example.test.", `${"x".repeat(64)}.test`])("rejects malformed domain %s", domain => {
    const request = valid(); request.configuration.guestDomains.production = [domain];
    expect(validateRestaurantConfiguration(request)).toHaveProperty("guestDomains.production");
  });

  it("rejects canonical duplicate domains across both environments and repeated domains within one list", () => {
    const request = valid();
    request.configuration.guestDomains.staging = [" Example.Test "];
    request.configuration.guestDomains.production = ["example.test"];
    expect(validateRestaurantConfiguration(request)).toHaveProperty("guestDomains.staging");
    expect(validateRestaurantConfiguration(request)).toHaveProperty("guestDomains.production");
    request.configuration.guestDomains.staging = [];
    request.configuration.guestDomains.production = ["example.test", "EXAMPLE.TEST"];
    expect(validateRestaurantConfiguration(request)).toHaveProperty("guestDomains.production");
  });

  it("recognizes equivalent internationalized domains and enforces domain-list limits", () => {
    const request = valid();
    request.configuration.guestDomains.production = ["bücher.example", "xn--bcher-kva.example"];
    expect(validateRestaurantConfiguration(request)).toHaveProperty("guestDomains.production");
    request.configuration.guestDomains.production = Array.from({ length: 21 }, (_, index) => `site${index}.example`);
    expect(validateRestaurantConfiguration(request)["guestDomains.production"]).toContain("20");
  });

  it("enforces unique application IDs across apps and environments", () => {
    const request = valid();
    request.configuration.android.customer.productionApplicationId = request.configuration.android.operations.stagingApplicationId;
    expect(validateRestaurantConfiguration(request)).toHaveProperty("android.operations.stagingApplicationId");
    expect(validateRestaurantConfiguration(request)).toHaveProperty("android.customer.productionApplicationId");
  });

  it.each(["Com.example.app", "com.123app", "one_segment", "com.example-app", `com.${"a".repeat(197)}`])("rejects malformed or oversized application ID %s", id => {
    const request = valid(); request.configuration.android.operations.productionApplicationId = id;
    expect(validateRestaurantConfiguration(request)).toHaveProperty("android.operations.productionApplicationId");
  });

  it.each(["../icon.png", "/assets/icon.png", "assets/../icon.png", "assets/icon.svg", "https://example.test/icon.png", `assets/${"x".repeat(490)}.png`])("rejects invalid icon path %s", path => {
    const request = valid(); request.configuration.android.customer.iconPath = path;
    expect(validateRestaurantConfiguration(request)).toHaveProperty("android.customer.iconPath");
  });

  it("limits application display names to the backend's 100-character maximum", () => {
    const request = valid(); request.configuration.android.operations.displayName = "x".repeat(101);
    expect(validateRestaurantConfiguration(request)).toHaveProperty("android.operations.displayName");
  });
});
