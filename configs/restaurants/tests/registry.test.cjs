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
  validateRestaurantRegistry
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
