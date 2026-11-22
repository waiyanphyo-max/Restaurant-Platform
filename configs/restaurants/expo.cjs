"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getMobileBuildConfig, validateReleaseEndpoints } = require("./index.cjs");
const { selectFirebaseAndroid } = require("./firebase-android.cjs");

function fromApp(appDirectory, relative) {
  return path.relative(appDirectory, path.resolve(__dirname, relative)).split(path.sep).join("/");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assetDigest(relative) {
  return relative ? digest(fs.readFileSync(path.resolve(__dirname, relative))) : null;
}

// Normalize text line endings so a reviewed Windows plan matches the EAS checkout.
// Bind local plugin implementations and the pinned worker/profile configuration,
// in addition to their options and the source revision already in the plan.
function configurationDigests(appDirectory) {
  const files = [
    "index.cjs", "expo.cjs", "firebase-android.cjs", "mobile-runtime.ts",
    "with-network-security.cjs", "with-app-label.cjs", "with-build-fingerprint.cjs"
  ];
  return {
    registryTooling: Object.fromEntries(files.map((file) => [file,
      digest(fs.readFileSync(path.join(__dirname, file), "utf8").replaceAll("\r\n", "\n"))])),
    appConfig: digest(fs.readFileSync(path.join(appDirectory, "app.config.js"), "utf8").replaceAll("\r\n", "\n")),
    easProfiles: digest(fs.readFileSync(path.join(appDirectory, "eas.json"), "utf8").replaceAll("\r\n", "\n"))
  };
}

function publicAuthInputs(env) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL || null;
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || null;
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("EXPO_PUBLIC_SUPABASE_URL must be a public HTTPS origin"); }
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) || parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_SUPABASE_URL must be a public HTTPS origin");
    }
  }
  if (key && !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) {
    throw new Error("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key");
  }
  return [url, key];
}

function createAndroidExpoConfig(kind, appDirectory, appOptions) {
  function evaluate(config, env, options) {
    const selected = getMobileBuildConfig(kind, env, options);
    const { app, restaurant, routing, release, environment } = selected;
    if (env.EAS_BUILD === "true" && environment !== "development") validateReleaseEndpoints(restaurant, environment);
    const { logoPath, ...branding } = restaurant.branding;
    if (logoPath) branding.logoDataUri = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, logoPath)).toString("base64")}`;
    const icon = app.iconPath ? fromApp(appDirectory, app.iconPath) : undefined;
    const splashImage = app.splashPath ? fromApp(appDirectory, app.splashPath) : icon;
    const appLinks = routing.appLinkOrigin
      ? [{ host: new URL(routing.appLinkOrigin).hostname, pathPrefix: routing.appLinkPathPrefix }]
      : [];
    const { plugins = [], android = {}, extra = {} } = appOptions(selected, env);
    const notifications = selectFirebaseAndroid(kind, appDirectory, selected.applicationId, env, environment);
    const auth = publicAuthInputs(env);
    const allowPrivateLanHttp = environment === "development" && Boolean(env.MOBILE_DEVELOPMENT_API_BASE_URL) &&
      selected.apiBaseUrl.startsWith("http:");
    const cleartextHosts = environment === "development"
      ? [...new Set([
          // Local Metro via adb reverse remains available to the development client.
          "localhost", "127.0.0.1", "::1",
          ...[selected.apiBaseUrl, selected.guestBaseUrl].filter((origin) => origin?.startsWith("http:"))
            .map((origin) => new URL(origin).hostname.replace(/^\[|\]$/g, ""))
        ])]
      : [];
    const sourceRevision = env.MOBILE_SOURCE_REVISION || env.EAS_BUILD_GIT_COMMIT_HASH || null;
    if (sourceRevision && !/^[a-f0-9]{40}$/.test(sourceRevision)) {
      throw new Error("MOBILE_SOURCE_REVISION must be a full Git commit SHA");
    }
    if (env.EAS_BUILD_GIT_COMMIT_HASH && env.EAS_BUILD_GIT_COMMIT_HASH !== sourceRevision) {
      throw new Error("selected Android build does not match the EAS Git commit");
    }
    if (env.EAS_BUILD === "true" && environment !== "development" &&
        (!sourceRevision || !env.MOBILE_EXPECTED_FINGERPRINT || auth.some((value) => !value))) {
      throw new Error("EAS staging and production builds require an approved release fingerprint, Git commit, and public Auth configuration");
    }
    const intentFilters = appLinks.map(({ host, pathPrefix }) => ({
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: "https", host, pathPrefix }],
      category: ["BROWSABLE", "DEFAULT"]
    }));
    const splash = {
      backgroundColor: app.splashBackgroundColor ?? branding.primaryColor,
      ...(splashImage ? { image: splashImage, imageWidth: 160 } : {})
    };
    const build = {
      restaurantId: restaurant.restaurantId,
      restaurantSlug: restaurant.slug,
      fixture: restaurant.fixture === true,
      appKind: kind,
      environment,
      applicationId: selected.applicationId,
      displayName: selected.displayName,
      ...release,
      scheme: routing.scheme,
      appLinks,
      apiBaseUrl: selected.apiBaseUrl,
      guestBaseUrl: selected.guestBaseUrl,
      ...(allowPrivateLanHttp ? { allowPrivateLanHttp } : {}),
      easProjectId: app.eas?.projectId ?? null,
      ...(notifications ? { firebase: notifications.firebase } : {}),
      sourceRevision
    };
    const fingerprint = `sha256:${digest(JSON.stringify({
      build,
      registry: digest(JSON.stringify(restaurant)),
      configuration: configurationDigests(appDirectory),
      branding,
      icon: assetDigest(app.iconPath),
      splash: { ...splash, image: assetDigest(app.splashPath ?? app.iconPath) },
      plugins,
      android: { ...android, googleServicesFile: notifications ? assetDigest(path.resolve(appDirectory, notifications.file)) : null },
      extra,
      auth,
      cleartextHosts,
      lockfile: digest(fs.readFileSync(path.resolve(__dirname, "../../package-lock.json"), "utf8").replaceAll("\r\n", "\n"))
    }))}`;
    if (env.MOBILE_EXPECTED_FINGERPRINT && env.MOBILE_EXPECTED_FINGERPRINT !== fingerprint) {
      throw new Error("selected Android build inputs do not match MOBILE_EXPECTED_FINGERPRINT");
    }
    return {
      ...config,
      name: selected.displayName,
      slug: `${restaurant.slug}-${kind}`,
      scheme: routing.scheme,
      version: release.versionName,
      platforms: ["android"],
      orientation: "portrait",
      ...(app.eas ? { owner: app.eas.owner } : {}),
      updates: { enabled: false },
      plugins: [
        "expo-router",
        ["expo-dev-client", { addGeneratedScheme: false }],
        ["expo-secure-store", { configureAndroidBackup: true }],
        ["expo-build-properties", {
          android: {
            usesCleartextTraffic: environment === "development",
            ...(kind === "customer"
              ? {
                  extraProguardRules: [
                    "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
                    "-keep class * extends androidx.work.InputMerger { <init>(); }"
                  ].join("\n")
                }
              : {})
          }
        }],
        [fromApp(appDirectory, "with-network-security.cjs"), { cleartextHosts }],
        ["expo-splash-screen", splash],
        fromApp(appDirectory, "with-app-label.cjs"),
        [fromApp(appDirectory, "with-build-fingerprint.cjs"), { fingerprint }],
        ...plugins,
        ...(notifications ? [["expo-notifications", { defaultChannel: "default" }]] : [])
      ],
      android: {
        ...android,
        ...(notifications ? { googleServicesFile: notifications.file } : {}),
        package: selected.applicationId,
        versionCode: release.versionCode,
        ...(icon ? { icon } : {}),
        intentFilters
      },
      extra: {
        ...extra,
        features: { ...extra.features, notificationsEnabled: Boolean(notifications) },
        tenant: { restaurantId: restaurant.restaurantId, slug: restaurant.slug, branding },
        appKind: kind,
        mobileEnvironment: environment,
        apiBaseUrl: selected.apiBaseUrl,
        ...(allowPrivateLanHttp ? { allowPrivateLanHttp } : {}),
        ...(selected.guestBaseUrl ? { guestBaseUrl: selected.guestBaseUrl } : {}),
        routing: {
          scheme: routing.scheme,
          ...(routing.appLinkOrigin ? { appLinkOrigin: routing.appLinkOrigin, appLinkPathPrefix: routing.appLinkPathPrefix } : {})
        },
        release: { ...build, fingerprint },
        ...(app.eas ? { eas: { projectId: app.eas.projectId } } : {})
      }
    };
  }

  // CLI inspection uses the same Expo configuration with an explicit environment.
  const configure = ({ config }) => evaluate(config, process.env);
  configure.inspect = (env, options) => evaluate({}, env, options);
  return configure;
}

module.exports = { createAndroidExpoConfig };
