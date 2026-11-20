"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const {
  getMobileBuildConfig,
  listDevelopmentFixtures,
  listRestaurantConfigs,
  resolveRestaurantByHost,
  validateRestaurantConfig,
  validateRestaurantRegistry,
  validateReleaseEndpoints
} = require("../index.cjs");

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "starter.json"), "utf8"));
const development = {
  MOBILE_ENV: "development",
  RESTAURANT_SLUG: "starter-fixture",
  PUBLIC_API_BASE_URL: "http://10.0.2.2:8080"
};

test("only real top-level restaurant configs enter the runtime registry", () => {
  const fixtures = new Set(listDevelopmentFixtures().map((item) => item.slug));
  assert.ok(listRestaurantConfigs().every((item) => !item.fixture && !fixtures.has(item.slug)));
  assert.equal(resolveRestaurantByHost("starter-staging.test:3000", "staging"), null);
  assert.throws(() => getMobileBuildConfig("customer", {
    ...development,
    MOBILE_ENV: "production",
    PUBLIC_API_BASE_URL: "https://api.example.test"
  }), /no real restaurant config/);
});

test("development fixture locks distinct operations and customer Android IDs", () => {
  const operations = getMobileBuildConfig("operations", development);
  const customer = getMobileBuildConfig("customer", development);
  assert.equal(operations.restaurant.restaurantId, customer.restaurant.restaurantId);
  assert.notEqual(operations.applicationId, customer.applicationId);
  assert.match(operations.applicationId, /\.dev$/);
  assert.equal(operations.apiBaseUrl, "http://10.0.2.2:8080");
});

test("mobile build rejects absent, insecure, or invalid environment selection", () => {
  assert.throws(() => getMobileBuildConfig("operations", {}), /MOBILE_ENV/);
  assert.throws(() => getMobileBuildConfig("operations", { ...development, RESTAURANT_SLUG: "../other" }), /RESTAURANT_SLUG/);
  assert.throws(() => getMobileBuildConfig("operations", { ...development, PUBLIC_API_BASE_URL: "https://user:pass@api.example.test" }), /credentials/);
  assert.throws(() => getMobileBuildConfig("operations", { ...development, PUBLIC_API_BASE_URL: "https://api.example.test/path" }), /origin/);
  assert.throws(() => getMobileBuildConfig("operations", { ...development, PUBLIC_API_BASE_URL: "http://api.example.test" }), /loopback/);
  assert.throws(() => getMobileBuildConfig("operations", { ...development, PUBLIC_GUEST_BASE_URL: "http://other.localhost:3000" }), /loopback/);
});

test("validator rejects invalid tenant metadata and accidental credentials", () => {
  assert.throws(() => validateRestaurantConfig(fixture, "starter-fixture"), /fixture config/);
  assert.throws(() => validateRestaurantConfig({ ...fixture, restaurantId: "not-a-uuid" }, "starter-fixture", { allowFixture: true }), /UUID/);
  assert.throws(() => validateRestaurantConfig({ ...fixture, branding: { ...fixture.branding, logoUrl: "http://example.test/logo.png" } }, "starter-fixture", { allowFixture: true }), /HTTPS/);
  assert.throws(() => validateRestaurantConfig({ ...fixture, serviceRoleKey: "do-not-bundle" }, "starter-fixture", { allowFixture: true }), /unsupported field/);
});

test("registry rejects duplicate UUIDs, hosts, and Android IDs", () => {
  const first = validateRestaurantConfig(fixture, "starter-fixture", { allowFixture: true });
  const second = structuredClone(first);
  second.slug = "another-fixture";
  assert.throws(() => validateRestaurantRegistry([first, second]), /duplicate restaurant UUID/);
  second.restaurantId = "00000000-0000-4000-8000-000000000002";
  assert.throws(() => validateRestaurantRegistry([first, second]), /duplicate guest domain/);
  second.guestDomains = { staging: ["another-staging.test"], production: ["another-production.test"] };
  assert.throws(() => validateRestaurantRegistry([first, second]), /duplicate Android application ID/);
});

test("v2 rejects duplicate development packages, incomplete branding and invalid releases", () => {
  const [, a, b] = listDevelopmentFixtures();
  const duplicate = structuredClone(b);
  duplicate.android.customer.developmentApplicationId = a.android.operations.developmentApplicationId;
  assert.throws(() => validateRestaurantRegistry([a, duplicate]), /duplicate Android application ID/);

  const incomplete = structuredClone(a);
  delete incomplete.android.operations.splashPath;
  assert.throws(() => validateRestaurantConfig(incomplete, a.slug, { allowFixture: true }), /requires iconPath and splashPath/);
  incomplete.android.operations.splashPath = a.android.operations.splashPath;
  incomplete.android.operations.release.versionCode = 0;
  assert.throws(() => validateRestaurantConfig(incomplete, a.slug, { allowFixture: true }), /versionCode/);
});

test("fixture release profiles are inspection-only and branded origins come from the registry", () => {
  const env = {
    MOBILE_ENV: "staging", RESTAURANT_SLUG: "restaurant-a",
    PUBLIC_API_BASE_URL: "https://api.restaurant-b.staging.test",
    PUBLIC_GUEST_BASE_URL: "https://restaurant-b.staging.test"
  };
  assert.throws(() => getMobileBuildConfig("customer", env), /no real restaurant config/);
  const inspected = getMobileBuildConfig("customer", env, { inspectFixtureProfiles: true });
  assert.equal(inspected.apiBaseUrl, "https://api.restaurant-a.staging.test");
  assert.equal(inspected.guestBaseUrl, "https://restaurant-a.staging.test");
  assert.throws(() => getMobileBuildConfig("customer", { ...env, EAS_BUILD_PROFILE: "production" }), /EAS_BUILD_PROFILE/);
  assert.throws(() => getMobileBuildConfig("customer", { ...env, MOBILE_ENV: "development", EAS_BUILD: "true" }), /approved project/);
});

test("device-test API override permits explicit private-LAN HTTP only in development", () => {
  const env = { ...development, RESTAURANT_SLUG: "restaurant-a", MOBILE_DEVELOPMENT_API_BASE_URL: "http://192.168.1.25:8080" };
  assert.equal(getMobileBuildConfig("customer", env).apiBaseUrl, "http://192.168.1.25:8080");
  assert.equal(getMobileBuildConfig("customer", { ...env, MOBILE_ENV: "production" }, { inspectFixtureProfiles: true }).apiBaseUrl,
    "https://api.restaurant-a.test");
  assert.throws(() => getMobileBuildConfig("customer", { ...env, MOBILE_DEVELOPMENT_API_BASE_URL: "http://api.example.test" }), /private-LAN/);
});

test("staging and production reject HTTP and HTTPS local origins and local guest hosts", () => {
  const a = listDevelopmentFixtures()[1];
  for (const environment of ["staging", "production"]) {
    for (const origin of ["http://api.restaurant-a.test", "https://localhost", "https://127.0.0.1", "https://10.0.2.2",
      "https://192.168.1.2", "https://[::1]", "https://api.local", "https://api.internal", "https://database",
      "https://localhost.", "https://api.local.", "https://api.internal.", "https://exa_mple.com"]) {
      const invalid = structuredClone(a);
      invalid.mobileProfiles[environment].apiBaseUrl = origin;
      assert.throws(() => validateRestaurantConfig(invalid, a.slug, { allowFixture: true }), /HTTPS|public DNS/);
    }
    for (const host of ["localhost", "restaurant-a.localhost", "api.local", "api.internal", "10.0.2.2"]) {
      const invalid = structuredClone(a);
      invalid.guestDomains[environment] = [host];
      assert.throws(() => validateRestaurantConfig(invalid, a.slug, { allowFixture: true }), /DNS hostnames/);
    }
  }
});

test("release endpoint gate separates offline inspection from approved deployed origins", () => {
  const a = listDevelopmentFixtures()[1];
  assert.throws(() => validateReleaseEndpoints(a, "production"), /placeholder, reserved, or temporary/);
  for (const host of ["example.com", "api.example.invalid", "a.trycloudflare.com", "a.ngrok-free.app", "a.loca.lt"]) {
    const candidate = structuredClone(a);
    candidate.mobileProfiles.production.apiBaseUrl = `https://${host}`;
    assert.throws(() => validateReleaseEndpoints(candidate, "production"), /placeholder, reserved, or temporary/);
  }
  const candidate = structuredClone(a);
  candidate.mobileProfiles.production.apiBaseUrl = "https://api.reviewed-restaurant.com";
  candidate.guestDomains.production = ["menu.reviewed-restaurant.com"];
  assert.doesNotThrow(() => validateReleaseEndpoints(candidate, "production"));
  for (const origin of ["https://example.com.", "https://a.trycloudflare.com.", "https://database"]) {
    candidate.mobileProfiles.production.apiBaseUrl = origin;
    assert.throws(() => validateReleaseEndpoints(candidate, "production"), /public DNS/);
  }
});

test("registry rejects duplicate slugs, EAS project IDs and shared hosts across environments", () => {
  const [, a, b] = listDevelopmentFixtures();
  const duplicate = structuredClone(b);
  duplicate.slug = a.slug;
  duplicate.mobileProfiles.development.guestBaseUrl = a.mobileProfiles.development.guestBaseUrl;
  assert.throws(() => validateRestaurantRegistry([a, duplicate]), /duplicate restaurant slug/);
  const first = structuredClone(a);
  const second = structuredClone(b);
  first.android.operations.eas = { owner: "fixture-owner", projectId: "00000000-0000-4000-8000-000000000900" };
  second.android.customer.eas = first.android.operations.eas;
  assert.throws(() => validateRestaurantRegistry([first, second]), /duplicate EAS project ID/);
  second.android.customer.eas = undefined;
  second.guestDomains.production = first.guestDomains.staging;
  assert.throws(() => validateRestaurantRegistry([first, second]), /duplicate guest domain/);
});
