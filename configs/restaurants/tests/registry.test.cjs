"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const {
  getMobileBuildConfig,
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
  assert.deepEqual(listRestaurantConfigs(), []);
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
