import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  assertInstalledMobileApplication, parseEmbeddedMobileTenant, resolveMobileSystemPath
} from "@restaurant-platform/restaurant-config/mobile-runtime";

describe("generated A/B configurations at the Android runtime boundary", () => {
  const load = createRequire(import.meta.url);
  const configs = {
    customer: load("../../app.config.js"),
    operations: load("../../../operations-mobile/app.config.js")
  };

  it.each(["development", "staging", "production"])("accepts both fixture brands in the %s profile", environment => {
    for (const kind of ["customer", "operations"]) {
      const fixtures = ["restaurant-a", "restaurant-b"].map(slug => configs[kind].inspect({
        RESTAURANT_SLUG: slug, MOBILE_ENV: environment
      }, { inspectFixtureProfiles: true }));
      const [first, second] = fixtures.map(fixture => {
        const tenant = parseEmbeddedMobileTenant(fixture.extra, kind);
        expect(tenant.branding.logoDataUri).toMatch(/^data:image\/png;base64,/);
        expect(() => assertInstalledMobileApplication(fixture.extra, fixture.android.package)).not.toThrow();
        return tenant;
      });

      expect(first.restaurantId).not.toBe(second.restaurantId);
      expect(first.branding.displayName).not.toBe(second.branding.displayName);
      expect(first.guestBaseUrl).not.toBe(second.guestBaseUrl);
      expect(first.routing.scheme).not.toBe(second.routing.scheme);
      expect(() => assertInstalledMobileApplication(fixtures[1].extra, fixtures[0].android.package)).toThrow();
      expect(resolveMobileSystemPath(`${first.routing.scheme}://menu`, kind, first.routing))
        .toBe("/open?destination=%2Fmenu");
      expect(resolveMobileSystemPath(`${second.routing.scheme}://menu`, kind, first.routing)).toBeNull();
      if (environment !== "development") {
        expect(first.apiBaseUrl).not.toBe(second.apiBaseUrl);
        expect(resolveMobileSystemPath(`${first.guestBaseUrl}/app/${kind}/menu`, kind, first.routing))
          .toBe("/open?destination=%2Fmenu");
        expect(resolveMobileSystemPath(`${second.guestBaseUrl}/app/${kind}/menu`, kind, first.routing)).toBeNull();
      }
    }
  });
});
