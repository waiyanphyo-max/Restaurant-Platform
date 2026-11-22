"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { selectFirebaseAndroid } = require("../firebase-android.cjs");
const operations = require("../../../apps/operations-mobile/app.config.js");

const applicationId = "dev.restaurantplatform.starter.operations.staging.dev";
const key = "AIza" + "A".repeat(35);
function config() {
  return {
    project_info: { project_id: "synthetic-project", project_number: "123" },
    client: [{ client_info: { mobilesdk_app_id: "1:123:android:aaa",
      android_client_info: { package_name: applicationId } }, api_key: [{ current_key: key }] }]
  };
}

function fixture(t, value = config()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uxi13a-firebase-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^uxi13a-firebase-/);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const filename = "synthetic-client.json";
  fs.writeFileSync(path.join(directory, filename), typeof value === "string" ? value : JSON.stringify(value));
  return { directory, env: { MOBILE_ENV: "development", MOBILE_FIREBASE_PROJECT_ID: "synthetic-project",
    OPERATIONS_NOTIFICATIONS_ENABLED: "true", OPERATIONS_GOOGLE_SERVICES_FILE: filename } };
}

function blocked(directory, env) {
  let failure;
  assert.throws(() => selectFirebaseAndroid("operations", directory, applicationId, env), error => {
    failure = error;
    assert.match(error.message, /status=BLOCKED; appKind=operations; environment=development/);
    assert.match(error.message, /Operator action:.*exact Android application ID/);
    assert.match(error.message, /Preserve the native application ID and notification settings/);
    for (const secret of [key, "synthetic-project", "wrong-project", "private-key-sentinel", directory, "synthetic-client.json"]) {
      assert.equal(error.message.includes(secret), false, `diagnostic leaked ${secret}`);
      assert.equal(JSON.stringify(error.firebaseDiagnostic).includes(secret), false);
    }
    return true;
  });
  return failure.firebaseDiagnostic;
}

test("valid Android client preserves selected Firebase metadata and file", t => {
  const { directory, env } = fixture(t);
  assert.deepEqual(selectFirebaseAndroid("operations", directory, applicationId, env), {
    file: env.OPERATIONS_GOOGLE_SERVICES_FILE,
    firebase: { projectId: "synthetic-project", senderId: "123", appId: "1:123:android:aaa" }
  });
  assert.equal(selectFirebaseAndroid("operations", directory, applicationId,
    { ...env, OPERATIONS_NOTIFICATIONS_ENABLED: "false" }), null);
});

test("package mismatch reports zero matching clients independently of project match", t => {
  const value = config();
  value.client[0].client_info.android_client_info.package_name = "dev.synthetic.other";
  const { directory, env } = fixture(t, value);
  const diagnostic = blocked(directory, env);
  assert.equal(diagnostic.applicationId, applicationId);
  assert.equal(diagnostic.matchingAndroidClients, 0);
  assert.equal(diagnostic.expectedProjectMatches, true);
});

test("project mismatch reports matching client and false project match without values", t => {
  const { directory, env } = fixture(t);
  const diagnostic = blocked(directory, { ...env, MOBILE_FIREBASE_PROJECT_ID: "wrong-project" });
  assert.equal(diagnostic.matchingAndroidClients, 1);
  assert.equal(diagnostic.expectedProjectMatches, false);
  assert.equal(diagnostic.clientMetadataValid, true);
});

test("duplicate matching clients fail closed with their count", t => {
  const value = config();
  value.client.push(structuredClone(value.client[0]));
  const { directory, env } = fixture(t, value);
  const diagnostic = blocked(directory, env);
  assert.equal(diagnostic.matchingAndroidClients, 2);
  assert.equal(diagnostic.clientMetadataValid, false);
});

test("unreadable, malformed and service-account files expose only validation facts", t => {
  for (const value of ["invalid-json private-key-sentinel", { type: "service_account", private_key: "private-key-sentinel" }]) {
    const { directory, env } = fixture(t, value);
    const diagnostic = blocked(directory, env);
    assert.equal(diagnostic.androidClientJson, false);
    assert.equal(diagnostic.expectedProjectMatches, null);
    assert.equal(diagnostic.matchingAndroidClients, 0);
  }
  const { directory, env } = fixture(t);
  fs.unlinkSync(path.join(directory, env.OPERATIONS_GOOGLE_SERVICES_FILE));
  assert.equal(blocked(directory, env).androidClientJson, false);
  assert.equal(blocked(directory, { ...env, OPERATIONS_GOOGLE_SERVICES_FILE: "" }).fileConfigured, false);
});

test("missing expected project and invalid sender/app/key metadata stay blocked", t => {
  const { directory, env } = fixture(t);
  const missing = blocked(directory, { ...env, MOBILE_FIREBASE_PROJECT_ID: "" });
  assert.equal(missing.expectedProjectConfigured, false);
  assert.equal(missing.expectedProjectMatches, null);
  for (const mutate of [
    value => { value.project_info.project_number = "invalid-sender"; },
    value => { value.client[0].client_info.mobilesdk_app_id = "1:456:android:aaa"; },
    value => { value.client[0].api_key[0].current_key = "invalid-key"; }
  ]) {
    const value = config();
    mutate(value);
    const candidate = fixture(t, value);
    assert.equal(blocked(candidate.directory, candidate.env).clientMetadataValid, false);
  }
});

test("normal Expo evaluation reports selected starter development identity and safe recovery", t => {
  const value = config();
  value.client[0].client_info.android_client_info.package_name = "dev.synthetic.other";
  const { directory, env } = fixture(t, value);
  assert.throws(() => operations.inspect({ ...env, RESTAURANT_SLUG: "starter-fixture",
    PUBLIC_API_BASE_URL: "http://10.0.2.2:8080",
    OPERATIONS_GOOGLE_SERVICES_FILE: path.join(directory, env.OPERATIONS_GOOGLE_SERVICES_FILE) }), error => {
    assert.equal(error.firebaseDiagnostic.environment, "development");
    assert.equal(error.firebaseDiagnostic.appKind, "operations");
    assert.equal(error.firebaseDiagnostic.applicationId, applicationId);
    assert.equal(error.firebaseDiagnostic.matchingAndroidClients, 0);
    return true;
  });
});
