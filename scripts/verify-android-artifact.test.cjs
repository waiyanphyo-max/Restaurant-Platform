"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseStringPromise } = require("xml2js");
const { FINGERPRINT_META_DATA, parseApkLabel, verifyAndroidManifest, verifyEmbeddedExpoConfig } = require("./verify-android-artifact.cjs");

const expected = {
  applicationId: "dev.restaurantplatform.fixturea.customer",
  displayName: "Fixture A Customer",
  versionName: "1.0.2",
  versionCode: 3,
  fingerprint: `sha256:${"a".repeat(64)}`,
  scheme: "rp-fixture-a-customer",
  appLinks: [{ host: "fixture-a.example.invalid", pathPrefix: "/customer/" }]
};

const linkIntent = `
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>`;
const webData = '<data android:scheme="https" android:host="fixture-a.example.invalid" android:pathPrefix="/customer/"/>';
const nativeManifest = `
  <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${expected.applicationId}"
      android:versionName="${expected.versionName}" android:versionCode="${expected.versionCode}">
    <application android:label="@string/app_name">
      <meta-data android:name="${FINGERPRINT_META_DATA}" android:value="${expected.fingerprint}"/>
      <activity android:exported="true" android:name=".MainActivity">
        <intent-filter>${linkIntent}<data android:scheme="${expected.scheme}"/></intent-filter>
        <intent-filter android:autoVerify="true">${linkIntent}${webData}</intent-filter>
      </activity>
    </application>
  </manifest>`;

test("reads the literal launcher label from AAPT2 badging", () => {
  const badging = String.raw`application-label:'Moe's \"Tea\"  10% \\ Kitchen'`;
  assert.equal(parseApkLabel(badging), 'Moe\'s "Tea"  10% \\ Kitchen');
});

test("accepts the selected Android manifest and rejects mismatched release and restaurant identity", async () => {
  const { manifest } = await parseStringPromise(nativeManifest);
  assert.doesNotThrow(() => verifyAndroidManifest(manifest, expected.displayName, expected));
  assert.throws(() => verifyAndroidManifest(manifest, "Fixture B Customer", expected), /display name mismatch/);
  for (const [field, value, error] of [
    ["applicationId", "dev.restaurantplatform.fixtureb.customer", /package mismatch/],
    ["versionName", "1.1.0", /version name mismatch/],
    ["versionCode", 4, /version code mismatch/],
    ["fingerprint", `sha256:${"b".repeat(64)}`, /build fingerprint mismatch/],
    ["scheme", "rp-fixture-b-customer", /unexpected restaurant deep link scheme/],
    ["appLinks", [{ host: "fixture-b.example.invalid", pathPrefix: "/customer/" }], /verified App Links mismatch/]
  ]) {
    assert.throws(() => verifyAndroidManifest(manifest, expected.displayName, { ...expected, [field]: value }), error);
  }
});

test("rejects another restaurant's custom scheme even when the selected scheme is present", async () => {
  const customData = `<data android:scheme="${expected.scheme}"/>`;
  const variant = nativeManifest.replace(customData, `${customData}<data android:scheme="rp-fixture-b-customer"/>`);
  const { manifest } = await parseStringPromise(variant);
  assert.throws(() => verifyAndroidManifest(manifest, expected.displayName, expected), /unexpected restaurant deep link scheme/);
});

test("rejects broad, unverified, or combined web link filters", async () => {
  for (const variant of [
    nativeManifest.replace(' android:pathPrefix="/customer/"', ""),
    nativeManifest.replace('android:autoVerify="true"', 'android:autoVerify="false"'),
    nativeManifest.replace(webData, `${webData}<data android:host="fixture-b.example.invalid"/>`)
  ]) {
    const { manifest } = await parseStringPromise(variant);
    assert.throws(() => verifyAndroidManifest(manifest, expected.displayName, expected), /unexpected or unverified web link/);
  }
});

test("rejects a stale native build with a different embedded Expo tenant or API", () => {
  const release = {
    ...expected, restaurantId: "00000000-0000-4000-8000-000000000101", restaurantSlug: "restaurant-a",
    appKind: "customer", environment: "staging", apiBaseUrl: "https://api.restaurant-a.test", guestBaseUrl: "https://restaurant-a.test"
  };
  const config = {
    android: { package: release.applicationId },
    extra: {
      tenant: { restaurantId: release.restaurantId, slug: release.restaurantSlug },
      appKind: release.appKind, mobileEnvironment: release.environment,
      apiBaseUrl: release.apiBaseUrl, guestBaseUrl: release.guestBaseUrl, release,
      routing: { scheme: release.scheme, appLinkOrigin: release.guestBaseUrl, appLinkPathPrefix: release.appLinks[0].pathPrefix }
    }
  };
  assert.doesNotThrow(() => verifyEmbeddedExpoConfig(config, release));
  config.extra.apiBaseUrl = "https://api.restaurant-b.test";
  assert.throws(() => verifyEmbeddedExpoConfig(config, release), /embedded API origin mismatch/);
  config.extra.tenant.restaurantId = "00000000-0000-4000-8000-000000000102";
  assert.throws(() => verifyEmbeddedExpoConfig(config, release), /embedded restaurant UUID mismatch/);
});
