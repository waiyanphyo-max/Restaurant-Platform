"use strict";

const { readFileSync } = require("node:fs");
const path = require("node:path");
const { listMobileBuildConfigs } = require("../configs/restaurants/index.cjs");
const { verifyAndroidArtifact } = require("./verify-android-artifact.cjs");

const apps = {
  operations: require("../apps/operations-mobile/app.config.js"),
  customer: require("../apps/customer-mobile/app.config.js")
};
const profiles = ["development", "staging", "production"];
const usage = [
  "mobile:build -- validate",
  "mobile:build -- resolve <restaurant-slug> <operations|customer> <development|staging|production> [--fixture]",
  "mobile:build -- verify <release.json> <artifact.apk|artifact.aab>",
  "mobile:build -- assetlinks <release.json> <SHA-256 signing certificate fingerprint> [additional fingerprints]"
].join("\n");

function resolveBuild(slug, kind, profile, env, fixture, registry) {
  if (!Object.hasOwn(apps, kind) || !profiles.includes(profile)) throw new Error(usage);
  const config = apps[kind].inspect({ ...env, RESTAURANT_SLUG: slug, MOBILE_ENV: profile }, { inspectFixtureProfiles: fixture, registry });
  const { release, tenant } = config.extra;
  if (release.fixture !== fixture) throw new Error(fixture ? "--fixture requires a test restaurant" : "test restaurant requires --fixture");
  const { logoDataUri, ...branding } = tenant.branding;
  const splash = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")[1];
  return {
    ...release,
    artifactType: profile === "production" ? "aab" : "apk",
    branding: { ...branding, embeddedLogo: Boolean(logoDataUri) },
    icon: config.android.icon ?? null,
    splash
  };
}

function validateBuilds() {
  const operations = require("../apps/operations-mobile/eas.json");
  const customer = require("../apps/customer-mobile/eas.json");
  if (JSON.stringify(operations) !== JSON.stringify(customer)) throw new Error("mobile EAS profiles must match between workspaces");
  for (const profile of profiles) {
    const easProfile = operations.build[profile];
    if (easProfile?.env?.MOBILE_ENV !== profile ||
        easProfile?.android?.buildType !== (profile === "production" ? "app-bundle" : "apk")) {
      throw new Error(`invalid EAS Android profile ${profile}`);
    }
  }

  const restaurants = listMobileBuildConfigs();
  const registry = new Map(restaurants.map((restaurant) => [restaurant.slug, restaurant]));
  const branded = restaurants.filter((restaurant) => restaurant.schemaVersion === 2);
  const builds = branded.flatMap((restaurant) => Object.keys(apps).flatMap((kind) => profiles.map((profile) => {
    const result = resolveBuild(restaurant.slug, kind, profile, {}, restaurant.fixture === true, registry);
    const { restaurantSlug, appKind, environment, applicationId, displayName, apiBaseUrl, guestBaseUrl, scheme, appLinks } = result;
    return { restaurantSlug, appKind, environment, applicationId, displayName, apiBaseUrl, guestBaseUrl, scheme, appLinks };
  })));
  return { legacyGuestConfigs: restaurants.filter((restaurant) => restaurant.schemaVersion === 1 && !restaurant.fixture).length, validatedBuilds: builds };
}

function assetLinks(release, fingerprints) {
  const expected = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i;
  if (!fingerprints.length || fingerprints.some((value) => !expected.test(value))) {
    throw new Error("supply one or more colon-delimited SHA-256 signing certificate fingerprints");
  }
  if (!release.appLinks?.length) throw new Error("the selected build has no HTTPS App Links");
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: release.applicationId,
      sha256_cert_fingerprints: [...new Set(fingerprints.map((value) => value.toUpperCase()))].sort()
    }
  }];
}

async function main([command, ...args]) {
  if (command === "validate" && args.length === 0) return validateBuilds();
  if (command === "resolve" && (args.length === 3 || (args.length === 4 && args[3] === "--fixture"))) {
    return resolveBuild(args[0], args[1], args[2], process.env, args.length === 4);
  }
  if (command === "verify" && args.length === 2) {
    const release = JSON.parse(readFileSync(args[0], "utf8").replace(/^\uFEFF/, ""));
    if (!["apk", "aab"].includes(release.artifactType) || path.extname(args[1]).toLowerCase() !== `.${release.artifactType}`) {
      throw new Error("artifact format does not match the selected Android profile");
    }
    return verifyAndroidArtifact(args[1], release);
  }
  if (command === "assetlinks" && args.length >= 2) {
    const release = JSON.parse(readFileSync(args[0], "utf8").replace(/^\uFEFF/, ""));
    return assetLinks(release, args.slice(1));
  }
  throw new Error(usage);
}

main(process.argv.slice(2))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
