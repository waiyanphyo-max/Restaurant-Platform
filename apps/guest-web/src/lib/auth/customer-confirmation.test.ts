import { describe, expect, it } from "vitest";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { resolveCustomerConfirmationContext } from "./customer-confirmation";

const restaurant = {
  schemaVersion: 2, slug: "cafe-one", branding: { displayName: "Cafe One" },
  guestDomains: { staging: ["staging.cafeone.com"], production: ["www.cafeone.com"] },
} as RestaurantConfig;

describe("customer confirmation host/tenant policy", () => {
  it("selects the exact registered tenant and build's sign-in scheme", () => {
    expect(resolveCustomerConfirmationContext("staging.cafeone.com", "staging", "staging", "cafe-one", [restaurant])).toEqual({
      callbackUrl: "https://staging.cafeone.com/auth/customer-confirmation/staging/cafe-one",
      nativeReturnUrl: "rp-cafe-one-customer-staging://email-confirmation?result=returned", displayName: "Cafe One",
    });
    expect(resolveCustomerConfirmationContext("www.cafeone.com", "production", "production", "cafe-one", [restaurant])?.nativeReturnUrl)
      .toBe("rp-cafe-one-customer://email-confirmation?result=returned");
    expect(resolveCustomerConfirmationContext("staging.cafeone.com", "staging", "development", "cafe-one", [restaurant])?.nativeReturnUrl)
      .toBe("rp-cafe-one-customer-development://email-confirmation?result=returned");
  });
  it.each([
    ["attacker.net", "staging", "staging", "cafe-one"],
    ["staging.cafeone.com.attacker.net", "staging", "staging", "cafe-one"],
    ["staging.cafeone.com", "staging", "staging", "cafe-two"],
    ["www.cafeone.com", "production", "development", "cafe-one"],
    ["www.cafeone.com", "production", "staging", "cafe-one"],
    ["staging.cafeone.com:9999", "staging", "staging", "cafe-one"],
    ["staging.cafeone.com", "unknown", "staging", "cafe-one"],
  ])("rejects unauthorized host/deployment/tenant %s", (host, deployment, environment, slug) => {
    expect(resolveCustomerConfirmationContext(host, deployment, environment, slug, [restaurant])).toBeNull();
  });
  it("refuses ambiguous registry ownership and temporary tunnel hosts", () => {
    expect(resolveCustomerConfirmationContext("staging.cafeone.com", "staging", "staging", "cafe-one", [restaurant, restaurant])).toBeNull();
    const tunnel = { ...restaurant, guestDomains: { ...restaurant.guestDomains, staging: ["temporary.trycloudflare.com"] } };
    expect(resolveCustomerConfirmationContext("temporary.trycloudflare.com", "staging", "staging", "cafe-one", [tunnel])).toBeNull();
  });
});
