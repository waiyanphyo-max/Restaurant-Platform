import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { assertInstalledMobileApplication, parseEmbeddedMobileTenant } from "@restaurant-platform/restaurant-config/mobile-runtime";

const load = createRequire(import.meta.url);
const apps = { operations: load("../../../operations-mobile/app.config.js"), customer: load("../../app.config.js") };

describe("installed release binding for both apps and all A/B environments", () => {
  for (const kind of ["operations", "customer"]) {
    for (const environment of ["development", "staging", "production"]) {
      it(`${kind} ${environment} rejects inconsistent valid identity and environment data`, () => {
        const a = apps[kind].inspect({ RESTAURANT_SLUG: "restaurant-a", MOBILE_ENV: environment }, { inspectFixtureProfiles: true });
        const b = apps[kind].inspect({ RESTAURANT_SLUG: "restaurant-b", MOBILE_ENV: environment }, { inspectFixtureProfiles: true });
        const check = extra => assertInstalledMobileApplication(extra, a.android.package);
        expect(() => check(a.extra)).not.toThrow();
        for (const mutate of [
          extra => { extra.tenant.restaurantId = b.extra.tenant.restaurantId; },
          extra => { extra.tenant.slug = b.extra.tenant.slug; },
          extra => { extra.apiBaseUrl = "https://foreign-api.example.test"; },
          extra => { extra.mobileEnvironment = "unknown"; },
          extra => { extra.appKind = kind === "operations" ? "customer" : "operations"; },
          extra => { delete extra.release; },
          extra => { extra.release.fingerprint = "not-reviewed"; },
          extra => { extra.tenant.branding.primaryColor = "red"; }
        ]) {
          const extra = structuredClone(a.extra);
          mutate(extra);
          expect(() => check(extra)).toThrow();
        }
        expect(() => assertInstalledMobileApplication(a.extra, b.android.package)).toThrow();
        expect(() => assertInstalledMobileApplication(a.extra, null)).toThrow();
        if (environment !== "development") {
          expect(() => check({ ...a.extra, mobileEnvironment: environment === "staging" ? "production" : "staging" })).toThrow();
        }
      });
    }
  }

  it.each(["operations", "customer"])("%s rejects HTTP and HTTPS private release origins despite development flags", kind => {
    for (const environment of ["staging", "production"]) {
      const build = apps[kind].inspect({ RESTAURANT_SLUG: "restaurant-a", MOBILE_ENV: environment }, { inspectFixtureProfiles: true });
      for (const apiBaseUrl of [
        "http://192.168.1.25:8080", "https://192.168.1.25", "https://127.0.0.1", "https://10.0.2.2",
        "https://[::1]", "https://localhost", "https://api.localhost", "https://api.local", "https://api.internal", "https://backend",
        "https://localhost.", "https://api.local.", "https://api.internal."
      ]) {
        expect(() => parseEmbeddedMobileTenant({ ...build.extra, apiBaseUrl, allowPrivateLanHttp: true }, kind)).toThrow();
        expect(() => parseEmbeddedMobileTenant({ ...build.extra, guestBaseUrl: apiBaseUrl }, kind)).toThrow();
      }
    }
  });
});
