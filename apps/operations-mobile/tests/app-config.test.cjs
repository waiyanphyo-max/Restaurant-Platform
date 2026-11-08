"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { getConfig } = require("expo/config");
const configure = require("../app.config.js");

function withEnvironment(values, callback) {
  const names = ["MOBILE_ENV", "RESTAURANT_SLUG", "PUBLIC_API_BASE_URL", "PUBLIC_GUEST_BASE_URL", "OPERATIONS_PHONE_OTP_ENABLED"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("operations fixture export embeds a fixed restaurant and operations application ID", () => {
  withEnvironment({ MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" }, () => {
    const result = configure({ config: { extra: { serviceRoleKey: "must-not-export" } } });
    assert.equal(result.android.package, "dev.restaurantplatform.starter.operations.staging.dev");
    assert.equal(result.extra.tenant.restaurantId, "00000000-0000-4000-8000-000000000001");
    assert.equal(result.extra.appKind, "operations");
    assert.equal(result.extra.serviceRoleKey, undefined);
    assert.equal(result.extra.features.phoneOtpRequested, false);
    assert.ok(result.plugins.includes("expo-router"));
    assert.deepEqual(result.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-secure-store"),
      ["expo-secure-store", { configureAndroidBackup: true }]);
    assert.equal(result.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-build-properties")[1].android.usesCleartextTraffic, true);
  });
});

test("phone build request cannot contain an implicit enabled default", () => {
  withEnvironment({ MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080", OPERATIONS_PHONE_OTP_ENABLED: "true" }, () => {
    const result = configure({ config: {} });
    assert.equal(result.extra.features.phoneOtpRequested, true);
  });
});

test("Expo public config omits development links without an HTTPS association", () => {
  withEnvironment({ MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" }, () => {
    const { exp } = getConfig(path.resolve(__dirname, ".."), { isPublicConfig: true });
    assert.deepEqual(exp.extra.routing, { scheme: "rp-starter-fixture-operations" });
    assert.equal(exp.extra.guestBaseUrl, undefined);
  });
});

test("operations production config fails closed without a real tenant file", () => {
  withEnvironment({ MOBILE_ENV: "production", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "https://api.example.test" }, () => {
    assert.throws(() => configure({ config: {} }), /no real restaurant config/);
  });
});

test("release fingerprint is reproducible and rejects mismatched or secret-bearing inputs", () => {
  const env = { MOBILE_ENV: "development", RESTAURANT_SLUG: "restaurant-a", MOBILE_SOURCE_REVISION: "a".repeat(40) };
  const release = configure.inspect(env).extra.release;
  assert.match(release.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(configure.inspect({ ...env, MOBILE_EXPECTED_FINGERPRINT: release.fingerprint }).extra.release, release);
  assert.throws(() => configure.inspect({
    ...env, RESTAURANT_SLUG: "restaurant-b", MOBILE_EXPECTED_FINGERPRINT: release.fingerprint
  }), /MOBILE_EXPECTED_FINGERPRINT/);
  assert.throws(() => configure.inspect({ ...env, EAS_BUILD_GIT_COMMIT_HASH: "b".repeat(40) }), /EAS Git commit/);
  assert.throws(() => configure.inspect({
    ...env, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic"
  }), /publishable key/);
});
