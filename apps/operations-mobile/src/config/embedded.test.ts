import { describe, expect, it } from "vitest";
import { resolveMobileSystemPath } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { parseEmbeddedTenant } from "./embedded";

const build = {
  appKind: "operations", mobileEnvironment: "development", apiBaseUrl: "http://10.0.2.2:8080",
  tenant: { restaurantId: "00000000-0000-4000-8000-000000000001", slug: "starter-fixture", branding: { displayName: "Starter", primaryColor: "#123456" } }
};

describe("embedded Operations configuration", () => {
  it("accepts emulator development and defaults the phone feature off", () => {
    expect(parseEmbeddedTenant(build)).toMatchObject({ restaurantId: build.tenant.restaurantId, environment: "development", phoneOtpRequested: false });
  });
  it("rejects unsafe API origins in production and staging", () => {
    for (const mobileEnvironment of ["staging", "production"]) {
      expect(() => parseEmbeddedTenant({ ...build, mobileEnvironment })).toThrow();
      expect(parseEmbeddedTenant({ ...build, mobileEnvironment, apiBaseUrl: "https://api.example.test" }).environment).toBe(mobileEnvironment);
    }
    for (const apiBaseUrl of ["http://attacker.test", "https://user:pass@example.test", "https://api.example.test/path", "https://api.example.test?restaurant=other"]) {
      expect(() => parseEmbeddedTenant({ ...build, apiBaseUrl })).toThrow();
    }
  });
  it("rejects malformed tenant identity, branding and other product builds", () => {
    expect(() => parseEmbeddedTenant({ ...build, appKind: "customer" })).toThrow();
    expect(() => parseEmbeddedTenant({ ...build, tenant: { ...build.tenant, restaurantId: "other" } })).toThrow();
    expect(() => parseEmbeddedTenant({ ...build, tenant: { ...build.tenant, branding: { displayName: "", primaryColor: "red" } } })).toThrow();
  });
  it("only permits safe configured guest origins and leaves unconfigured QR export unavailable", () => {
    expect(parseEmbeddedTenant(build).guestBaseUrl).toBeNull();
    expect(parseEmbeddedTenant({ ...build, guestBaseUrl: "http://10.0.2.2:3000" }).guestBaseUrl).toBe("http://10.0.2.2:3000");
    expect(parseEmbeddedTenant({ ...build, mobileEnvironment: "production", apiBaseUrl: "https://api.example.test", guestBaseUrl: "https://restaurant.example.test" }).guestBaseUrl).toBe("https://restaurant.example.test");
    for (const guestBaseUrl of ["http://evil.test", "https://user:pass@restaurant.test", "https://restaurant.test/path", "https://restaurant.test?token=bad", "https://restaurant.test#bad"]) {
      expect(() => parseEmbeddedTenant({ ...build, guestBaseUrl })).toThrow();
    }
  });
  it("uses the embedded brand and maps only matching Operations links", () => {
    const guestBaseUrl = "https://restaurant.example.test";
    const config = parseEmbeddedTenant({
      ...build,
      tenant: { ...build.tenant, branding: { ...build.tenant.branding,
        secondaryColor: "#ABCDEF", backgroundColor: "#FEFAF5", logoDataUri: "data:image/png;base64,iVBORw0KGgo=" } },
      mobileEnvironment: "production",
      apiBaseUrl: "https://api.restaurant.example.test",
      guestBaseUrl,
      routing: { scheme: "rp-starter-fixture-operations", appLinkOrigin: guestBaseUrl, appLinkPathPrefix: "/app/operations/" }
    });
    expect(config.branding).toMatchObject({ secondaryColor: "#ABCDEF", backgroundColor: "#FEFAF5", logoDataUri: "data:image/png;base64,iVBORw0KGgo=" });
    expect(Object.isFrozen(config)).toBe(true);
    expect(resolveMobileSystemPath(`${guestBaseUrl}/app/operations/dashboard?restaurantId=foreign`, "operations", config.routing))
      .toBe("/open?destination=%2Fdashboard");
    expect(resolveMobileSystemPath(`${guestBaseUrl}/app/customer/orders`, "operations", config.routing)).toBeNull();
    expect(resolveMobileSystemPath("rp-starter-fixture-customer://orders", "operations", config.routing)).toBeNull();
  });
});
