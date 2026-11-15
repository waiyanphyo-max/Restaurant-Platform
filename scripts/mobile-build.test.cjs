"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const customerConfig = require("../apps/customer-mobile/app.config.js");

test("FCM CLI requires explicit USB reverse and preserves ordinary device origins", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mobile-fcm-preflight-"));
  const files = ["customer", "operations"].map((kind, index) => {
    const file = path.join(directory, kind + "-google-services.json");
    writeFileSync(file, JSON.stringify({
      project_info: { project_id: "test-project", project_number: "123" },
      client: [{
        client_info: {
          mobilesdk_app_id: "1:123:android:" + (index + 1) + "aaa",
          android_client_info: { package_name: "dev.restaurantplatform.fixturea." + kind + ".dev" }
        },
        api_key: [{ current_key: "AIza" + "A".repeat(35) }]
      }]
    }));
    return file;
  });
  try {
    const env = {
      ...process.env,
      MOBILE_ENV: "development",
      MOBILE_FIREBASE_PROJECT_ID: "test-project",
      EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic123",
      CUSTOMER_NOTIFICATIONS_ENABLED: "true",
      OPERATIONS_NOTIFICATIONS_ENABLED: "true",
      CUSTOMER_GOOGLE_SERVICES_FILE: files[0],
      OPERATIONS_GOOGLE_SERVICES_FILE: files[1]
    };
    for (const name of ["MOBILE_EXPECTED_FINGERPRINT", "MOBILE_SOURCE_REVISION", "EAS_BUILD",
      "EAS_BUILD_PROFILE", "EAS_BUILD_PROJECT_ID", "EAS_BUILD_GIT_COMMIT_HASH"]) delete env[name];
    const run = (origin, reverse = "") => spawnSync(process.execPath, [
      path.join(__dirname, "mobile-build.cjs"), "preflight-fcm", "restaurant-a", "--fixture"
    ], {
      env: { ...env, MOBILE_DEVELOPMENT_API_BASE_URL: origin, MOBILE_ADB_REVERSE_ENABLED: reverse },
      encoding: "utf8",
      windowsHide: true
    });
    const implicit = run("http://127.0.0.1:8080");
    assert.equal(implicit.status, 1);
    assert.match(implicit.stderr, /explicitly enable MOBILE_ADB_REVERSE_ENABLED=true/);

    const usb = run("http://127.0.0.1:8080", "true");
    assert.equal(usb.status, 0, usb.stderr);
    for (const plan of Object.values(JSON.parse(usb.stdout))) {
      assert.equal(plan.apiBaseUrl, "http://127.0.0.1:8080");
      assert.equal(plan.environment, "development");
    }
    for (const origin of ["http://localhost:8080", "http://127.0.0.1:8081"]) {
      const invalid = run(origin, "true");
      assert.equal(invalid.status, 1);
      assert.match(invalid.stderr, /requires the development API origin http:\/\/127.0.0.1:8080/);
    }
    for (const origin of ["http://192.168.1.25:8080", "https://api.example.test"]) {
      const regular = run(origin);
      assert.equal(regular.status, 0, regular.stderr);
    }
  } finally {
    files.forEach((file) => unlinkSync(file));
    rmdirSync(directory);
  }
});

test("USB reverse development origins leave production HTTPS and cleartext denial intact", () => {
  const env = {
    RESTAURANT_SLUG: "restaurant-a",
    MOBILE_DEVELOPMENT_API_BASE_URL: "http://127.0.0.1:8080",
    MOBILE_ADB_REVERSE_ENABLED: "true"
  };
  const development = customerConfig.inspect({ ...env, MOBILE_ENV: "development" });
  const production = customerConfig.inspect({ ...env, MOBILE_ENV: "production" }, { inspectFixtureProfiles: true });
  const network = (config) => config.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0].endsWith("/with-network-security.cjs"))[1];
  assert.equal(development.extra.apiBaseUrl, "http://127.0.0.1:8080");
  assert.ok(network(development).cleartextHosts.includes("127.0.0.1"));
  assert.equal(production.extra.apiBaseUrl, "https://api.restaurant-a.test");
  assert.deepEqual(network(production).cleartextHosts, []);
});
