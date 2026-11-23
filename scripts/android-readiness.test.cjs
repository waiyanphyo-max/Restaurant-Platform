"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inspectSdk, fixtureBindings, inspectProvider, appEnvironment } = require("./android-readiness.cjs");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uxi13b-android-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^uxi13b-android-/);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test("SDK readiness requires the selected native toolchain and accepts android-37.0", t => {
  assert.equal(inspectSdk(undefined).status, "BLOCKED");
  const directory = temporary(t);
  for (const entry of ["platforms/android-37.0", "build-tools/37.0.0", "ndk/27.1.12297006"]) {
    fs.mkdirSync(path.join(directory, entry), { recursive: true });
  }
  assert.equal(inspectSdk(directory).status, "PASS");
  assert.equal(inspectSdk(directory).systemImagePackagesPresent, false);
  fs.renameSync(path.join(directory, "build-tools/37.0.0"), path.join(directory, "build-tools/36.0.0"));
  assert.equal(inspectSdk(directory).status, "BLOCKED");
});

test("A/B bindings reuse exact UUIDs and IDs while explicitly separating emulator and device routing", () => {
  const bindings = fixtureBindings();
  assert.equal(bindings.length, 4);
  assert.equal(new Set(bindings.map(binding => binding.applicationId)).size, 4);
  assert.deepEqual([...new Set(bindings.map(binding => binding.restaurantId))], [
    "00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102"
  ]);
  assert(bindings.every(binding => binding.route === "ANDROID_EMULATOR_HOST" && binding.installedDeviceAcceptance === "NOT RUN"));
  assert(fixtureBindings({ MOBILE_DEVELOPMENT_API_BASE_URL: "http://127.0.0.1:8080" })
    .every(binding => binding.route === "ADB_REVERSE_REQUIRED_ON_DEVICE"));
  assert(fixtureBindings({ MOBILE_DEVELOPMENT_API_BASE_URL: "http://192.168.1.9:8080" })
    .every(binding => binding.route === "EXPLICIT_DEVICE_ORIGIN"));
  assert.throws(() => fixtureBindings({ MOBILE_DEVELOPMENT_API_BASE_URL: "https://user:secret@api.example.test" }));
});

test("provider facts preserve package mismatch without exposing file, key, project or arbitrary input", t => {
  const directory = temporary(t);
  const project = "private-project-sentinel";
  const key = "AIza" + "A".repeat(35);
  const file = path.join(directory, "private-client-sentinel.json");
  fs.writeFileSync(file, JSON.stringify({ project_info: { project_id: project, project_number: "123" },
    client: [{ client_info: { mobilesdk_app_id: "1:123:android:abc", android_client_info: { package_name: "dev.other.app" } }, api_key: [{ current_key: key }] }] }));
  const facts = inspectProvider("operations", directory, { OPERATIONS_NOTIFICATIONS_ENABLED: "true",
    OPERATIONS_GOOGLE_SERVICES_FILE: file, MOBILE_FIREBASE_PROJECT_ID: project, SECRET: "private-env-sentinel" });
  assert.equal(facts.firebase.status, "BLOCKED");
  assert.equal(facts.firebase.applicationId, "dev.restaurantplatform.starter.operations.staging.dev");
  assert.equal(facts.firebase.matchingAndroidClients, 0);
  assert.equal(facts.firebase.expectedProjectMatches, true);
  for (const secret of [project, key, file, "private-env-sentinel"]) assert.equal(JSON.stringify(facts).includes(secret), false);
});

test("disabled notifications and absent Maps remain unverified; local HTTP Auth is reported blocked", t => {
  const facts = inspectProvider("customer", temporary(t), { EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_syntheticlocalkey" });
  assert.equal(facts.firebase.status, "SKIPPED");
  assert.equal(facts.maps.status, "SKIPPED");
  assert.equal(facts.maps.fallback, "MANUAL_ADDRESS");
  assert.equal(facts.auth.status, "BLOCKED");
  assert.equal(facts.auth.urlType, "NON_HTTPS");
});

test("Expo dotenv selection matches ordinary export without mutating the process or printing values", t => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, ".env"), "MOBILE_FIREBASE_PROJECT_ID=base-sentinel\n");
  fs.writeFileSync(path.join(directory, ".env.production"), "MOBILE_FIREBASE_PROJECT_ID=production-sentinel\n");
  const before = process.env.MOBILE_FIREBASE_PROJECT_ID;
  assert.equal(appEnvironment(directory, {}).MOBILE_FIREBASE_PROJECT_ID, "production-sentinel");
  assert.equal(appEnvironment(directory, { MOBILE_FIREBASE_PROJECT_ID: "process-sentinel" }).MOBILE_FIREBASE_PROJECT_ID, "process-sentinel");
  assert.equal(appEnvironment(directory, { EXPO_NO_DOTENV: "1" }).MOBILE_FIREBASE_PROJECT_ID, undefined);
  assert.equal(process.env.MOBILE_FIREBASE_PROJECT_ID, before);
});
