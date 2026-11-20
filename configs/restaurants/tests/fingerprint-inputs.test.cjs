"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const operations = require("../../../apps/operations-mobile/app.config.js");
const customer = require("../../../apps/customer-mobile/app.config.js");
const { listDevelopmentFixtures, validateRestaurantConfig } = require("../index.cjs");

test("EAS staging/production evaluation rejects placeholder/tunnel endpoints and unreviewed fingerprints", () => {
  for (const [kind, configure] of [["operations", operations], ["customer", customer]]) {
    const candidate = structuredClone(listDevelopmentFixtures()[1]);
    delete candidate.fixture;
    candidate.branding.logoUrl = "https://restaurant-a.test/logo.png";
    candidate.android[kind].eas = { owner: "fixture-owner", projectId: "00000000-0000-4000-8000-000000000901" };
    for (const environment of ["staging", "production"]) {
      const env = { RESTAURANT_SLUG: candidate.slug, MOBILE_ENV: environment, EAS_BUILD: "true" };
      const options = { registry: new Map([[candidate.slug, validateRestaurantConfig(candidate)]]) };
      assert.throws(() => configure.inspect(env, options), /placeholder, reserved, or temporary/);
      for (const host of ["example.com", "api.example.invalid", "sandbox.trycloudflare.com", "sandbox.ngrok-free.app"]) {
        const blocked = structuredClone(candidate);
        blocked.mobileProfiles[environment].apiBaseUrl = `https://${host}`;
        assert.throws(() => configure.inspect(env, { registry: new Map([[blocked.slug, blocked]]) }), /placeholder, reserved, or temporary/);
      }
      // Fictional syntactic origins: evaluating a config never verifies DNS/ownership.
      candidate.mobileProfiles[environment].apiBaseUrl = "https://api.fixture-restaurant.org";
      candidate.guestDomains[environment] = [`${environment}.fixture-restaurant.org`];
      const reviewed = { registry: new Map([[candidate.slug, candidate]]) };
      assert.throws(() => configure.inspect(env, reviewed), /approved release fingerprint/);
      const inputs = { ...env, EAS_BUILD: "false", MOBILE_SOURCE_REVISION: "a".repeat(40),
        EXPO_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture123" };
      const fingerprint = configure.inspect(inputs, reviewed).extra.release.fingerprint;
      assert.equal(configure.inspect({ ...inputs, EAS_BUILD: "true", MOBILE_EXPECTED_FINGERPRINT: fingerprint }, reviewed).extra.release.fingerprint, fingerprint);
      assert.throws(() => configure.inspect({ ...inputs, EAS_BUILD: "true", MOBILE_EXPECTED_FINGERPRINT: "sha256:" + "0".repeat(64) }, reviewed), /MOBILE_EXPECTED_FINGERPRINT/);
    }
  }
});

test("all twelve A/B app/environment identities, schemes and App Link associations are distinct", () => {
  const builds = [];
  for (const slug of ["restaurant-a", "restaurant-b"]) {
    for (const configure of [operations, customer]) {
      for (const MOBILE_ENV of ["development", "staging", "production"]) {
        builds.push(configure.inspect({ RESTAURANT_SLUG: slug, MOBILE_ENV }, { inspectFixtureProfiles: true }));
      }
    }
  }
  assert.equal(new Set(builds.map(build => build.android.package)).size, 12);
  assert.equal(new Set(builds.map(build => build.scheme)).size, 12);
  const associations = builds.flatMap(build => build.extra.release.appLinks.map(link => `${link.host}${link.pathPrefix}`));
  assert.equal(new Set(associations).size, 8);
  for (const build of builds) {
    assert.equal(build.updates.enabled, false);
    const { tenant, release } = build.extra;
    assert.equal(tenant.restaurantId, release.restaurantId);
    assert.equal(release.applicationId, build.android.package);
    assert.equal(tenant.branding.primaryColor, tenant.slug === "restaurant-a" ? "#8A3C25" : "#195954");
  }
  const aLogo = builds[0].extra.tenant.branding.logoDataUri;
  assert.notEqual(aLogo, builds[6].extra.tenant.branding.logoDataUri);
});

test("review fingerprints bind source, auth, Firebase/Maps/features, assets, registry, tooling and locked profiles", () => {
  // All mutations occur in a disposable copied fixture tree, never in the checkout.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uxi06-fingerprint-"));
  try {
    const registry = path.join(root, "configs", "restaurants");
    fs.mkdirSync(path.dirname(registry), { recursive: true });
    fs.cpSync(path.resolve(__dirname, ".."), registry, { recursive: true });
    const app = path.join(root, "apps", "customer-mobile");
    fs.mkdirSync(app, { recursive: true });
    for (const file of ["app.config.js", "eas.json"]) {
      fs.copyFileSync(path.resolve(__dirname, "../../../apps/customer-mobile", file), path.join(app, file));
    }
    fs.copyFileSync(path.resolve(__dirname, "../../../package-lock.json"), path.join(root, "package-lock.json"));
    const { createAndroidExpoConfig } = require(path.join(registry, "expo.cjs"));
    const configure = createAndroidExpoConfig("customer", app, (_selected, env) => ({
      plugins: env.MAPS_KEY ? [["react-native-maps", { androidGoogleMapsApiKey: env.MAPS_KEY }]] : [],
      extra: { features: { phoneOtpRequested: env.PHONE === "true" } }
    }));
    const env = { RESTAURANT_SLUG: "restaurant-a", MOBILE_ENV: "development", MOBILE_SOURCE_REVISION: "a".repeat(40) };
    const fingerprint = values => configure.inspect(values).extra.release.fingerprint;
    const baseline = fingerprint(env);
    assert.equal(fingerprint(env), baseline);
    for (const addition of [
      { MOBILE_SOURCE_REVISION: "b".repeat(40) },
      { EXPO_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture123" },
      { MAPS_KEY: "AIza" + "A".repeat(35) }, { PHONE: "true" },
      { MOBILE_DEVELOPMENT_API_BASE_URL: "http://192.168.1.25:8080" }
    ]) assert.notEqual(fingerprint({ ...env, ...addition }), baseline);

    const firebase = path.join(app, "synthetic-client.json");
    fs.writeFileSync(firebase, JSON.stringify({
      project_info: { project_id: "fixture-project", project_number: "123" },
      client: [{ client_info: { mobilesdk_app_id: "1:123:android:aaa", android_client_info: {
        package_name: "dev.restaurantplatform.fixturea.customer.dev"
      } }, api_key: [{ current_key: "AIza" + "A".repeat(35) }] }]
    }));
    assert.notEqual(fingerprint({ ...env, MOBILE_FIREBASE_PROJECT_ID: "fixture-project",
      CUSTOMER_NOTIFICATIONS_ENABLED: "true", CUSTOMER_GOOGLE_SERVICES_FILE: firebase }), baseline);

    for (const file of [
      path.join(registry, "with-network-security.cjs"), path.join(registry, "with-app-label.cjs"),
      path.join(registry, "with-build-fingerprint.cjs"), path.join(app, "app.config.js"), path.join(app, "eas.json"),
      path.join(root, "package-lock.json"), path.join(registry, "assets/restaurant-a/logo.png"),
      path.join(registry, "assets/restaurant-a/customer-icon.png"), path.join(registry, "assets/restaurant-a/customer-splash.png")
    ]) {
      const original = fs.readFileSync(file);
      try {
        fs.appendFileSync(file, "\n");
        assert.notEqual(fingerprint(env), baseline, file);
        assert.throws(() => fingerprint({ ...env, MOBILE_EXPECTED_FINGERPRINT: baseline }), /MOBILE_EXPECTED_FINGERPRINT/);
      } finally { fs.writeFileSync(file, original); }
    }
    const fixtureFile = path.join(registry, "fixtures/restaurant-a.json");
    const fixture = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
    fixture.android.customer.eas = { owner: "reviewed-fixture", projectId: "00000000-0000-4000-8000-000000000901" };
    fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
    assert.notEqual(fingerprint(env), baseline);
    const projectFingerprint = fingerprint(env);
    fixture.android.customer.productionApplicationId += ".reserved";
    fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
    assert.notEqual(fingerprint(env), projectFingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
