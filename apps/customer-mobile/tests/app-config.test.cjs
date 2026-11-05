"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const configure = require("../app.config.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function withEnvironment(values, callback) {
  const names = ["MOBILE_ENV", "RESTAURANT_SLUG", "PUBLIC_API_BASE_URL", "CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY", "CUSTOMER_PHONE_OTP_ENABLED", "CUSTOMER_NOTIFICATIONS_ENABLED", "CUSTOMER_GOOGLE_SERVICES_FILE", "CUSTOMER_MAP_INITIAL_LATITUDE", "CUSTOMER_MAP_INITIAL_LONGITUDE"];
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

test("customer fixture export embeds a fixed restaurant and customer application ID", () => {
  withEnvironment({ MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" }, () => {
    const result = configure({ config: { extra: { serviceRoleKey: "must-not-export" } } });
    assert.equal(result.android.package, "dev.restaurantplatform.starter.customer.staging.dev");
    assert.equal(result.extra.tenant.restaurantId, "00000000-0000-4000-8000-000000000001");
    assert.equal(result.extra.appKind, "customer");
    assert.equal(result.extra.serviceRoleKey, undefined);
  });
});

const development = { MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" };
test("customer native configuration supports a dev client and excludes background location", () => {
  withEnvironment(development, () => {
    const result = configure({ config: {} });
    assert(result.plugins.some(plugin => plugin === "expo-router"));
    assert.deepEqual(result.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-location")[1], {
      isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false
    });
    assert(result.android.blockedPermissions.includes("android.permission.ACCESS_BACKGROUND_LOCATION"));
    assert.equal(result.extra.features.notificationsEnabled, false);
    assert.equal(result.extra.features.phoneOtpRequested, false);
    assert.equal(result.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")[1].backgroundColor, "#2457A7");
  });
});
test("missing and malformed Google Maps keys retain manual address onboarding", () => {
  for (const key of [undefined, "replace-with-key", "", "AIzaINVALID"]) {
    withEnvironment({ ...development, CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY: key }, () => {
      const result = configure({ config: {} });
      assert.equal(result.extra.mapsConfigured, false);
      assert(!result.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === "react-native-maps"));
    });
  }
});
test("a syntactically valid restricted Android key configures the native Maps plugin", () => {
  // Synthetic format-only fixture; this is not a Google-issued key or live map evidence.
  const key = "AIza" + "A".repeat(35);
  withEnvironment({ ...development, CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY: key }, () => {
    const result = configure({ config: { android: { config: { googleMaps: { apiKey: "untrusted" } } } } });
    assert.equal(result.extra.mapsConfigured, true);
    assert.deepEqual(result.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "react-native-maps"), ["react-native-maps", { androidGoogleMapsApiKey: key }]);
    assert.equal(result.extra.mapKey, undefined);
    assert.equal(result.android.config, undefined);
  });
});
test("map region requires a finite complete coordinate pair and accepts zero", () => {
  withEnvironment({ ...development, CUSTOMER_MAP_INITIAL_LATITUDE: "0", CUSTOMER_MAP_INITIAL_LONGITUDE: "0" }, () => {
    assert.equal(configure({ config: {} }).extra.initialMapRegion.latitude, 0);
  });
  withEnvironment({ ...development, CUSTOMER_MAP_INITIAL_LATITUDE: "91", CUSTOMER_MAP_INITIAL_LONGITUDE: "0" }, () => {
    assert.equal(configure({ config: {} }).extra.initialMapRegion, undefined);
  });
});
test("phone and push require explicit configuration and cannot inherit arbitrary runtime state", () => {
  withEnvironment({ ...development, CUSTOMER_PHONE_OTP_ENABLED: "true", CUSTOMER_NOTIFICATIONS_ENABLED: "true", CUSTOMER_GOOGLE_SERVICES_FILE: "missing-google-services.json" }, () => {
    const result = configure({ config: { extra: { features: { notificationsEnabled: true }, tenant: { restaurantId: "other" } } } });
    assert.equal(result.extra.features.phoneOtpRequested, true);
    assert.equal(result.extra.features.notificationsEnabled, false);
    assert.equal(result.extra.tenant.restaurantId, "00000000-0000-4000-8000-000000000001");
  });
});

test("notification native configuration requires matching Android client JSON and rejects service accounts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m11-client-config-"));
  const file = path.join(directory, "google-services.json");
  const client = { project_info: { project_id: "test-project", project_number: "123" }, client: [{ client_info: { android_client_info: { package_name: "dev.restaurantplatform.starter.customer.staging.dev" } } }] };
  try {
    for (const [value, expected] of [[client, true], [{ ...client, type: "service_account", private_key: "synthetic-noncredential" }, false], [{ ...client, client: [{ client_info: { android_client_info: { package_name: "another.package" } } }] }, false]]) {
      fs.writeFileSync(file, JSON.stringify(value));
      withEnvironment({ ...development, CUSTOMER_NOTIFICATIONS_ENABLED: "true", CUSTOMER_GOOGLE_SERVICES_FILE: file }, () => {
        const result = configure({ config: {} });
        assert.equal(result.extra.features.notificationsEnabled, expected);
        assert.equal(result.android.googleServicesFile, expected ? file : undefined);
      });
    }
  } finally { fs.unlinkSync(file); fs.rmdirSync(directory); }
});

test("customer production config fails closed without a real tenant file", () => {
  withEnvironment({ MOBILE_ENV: "production", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "https://api.example.test" }, () => {
    assert.throws(() => configure({ config: {} }), /no real restaurant config/);
  });
});
