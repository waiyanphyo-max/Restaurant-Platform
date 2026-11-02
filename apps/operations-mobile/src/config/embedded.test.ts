import { describe, expect, it } from "vitest";
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
});
