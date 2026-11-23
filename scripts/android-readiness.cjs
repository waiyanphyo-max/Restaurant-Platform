"use strict";

// Read-only UXI-13B inspection. This never installs tools, starts adb/emulators,
// generates native projects, changes provider inputs, or evaluates a release.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseProjectEnv } = require("@expo/env");
const { getMobileBuildConfig } = require("../configs/restaurants/index.cjs");
const { selectFirebaseAndroid } = require("../configs/restaurants/firebase-android.cjs");

const expected = Object.freeze({ javaMajor: 21, compileSdk: "37", buildTools: "37.0.0", ndk: "27.1.12297006", gradle: "9.4.1" });
const root = path.resolve(__dirname, "..");
const kinds = ["operations", "customer"];

function names(directory) {
  try { return fs.readdirSync(directory).sort(); } catch { return []; }
}

function contents(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

function runTool(file, args) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 512 * 1024 });
  return { ok: !result.error && result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function inspectSdk(sdkDirectory) {
  const present = Boolean(sdkDirectory) && fs.existsSync(sdkDirectory);
  const platforms = present ? names(path.join(sdkDirectory, "platforms")) : [];
  const buildTools = present ? names(path.join(sdkDirectory, "build-tools")) : [];
  const ndks = present ? names(path.join(sdkDirectory, "ndk")) : [];
  const systemImages = present ? names(path.join(sdkDirectory, "system-images")) : [];
  const compileSdkPresent = platforms.some(name => /^android-37(?:\.0)?$/.test(name));
  return { status: present && compileSdkPresent && buildTools.includes(expected.buildTools) && ndks.includes(expected.ndk) ? "PASS" : "BLOCKED",
    directoryPresent: present, compileSdkPresent, platforms: platforms.filter(name => /^android-\d+(?:\.\d+)?$/.test(name)),
    buildTools: buildTools.filter(name => /^\d+\.\d+\.\d+$/.test(name)),
    ndks: ndks.filter(name => /^\d+\.\d+\.\d+$/.test(name)), systemImagePackagesPresent: systemImages.length > 0 };
}

function fixtureBindings(env = {}) {
  const selectedEnv = env.MOBILE_DEVELOPMENT_API_BASE_URL ? { MOBILE_DEVELOPMENT_API_BASE_URL: env.MOBILE_DEVELOPMENT_API_BASE_URL } : {};
  return ["restaurant-a", "restaurant-b"].flatMap(slug => kinds.map(kind => {
    const selected = getMobileBuildConfig(kind, { ...selectedEnv, RESTAURANT_SLUG: slug, MOBILE_ENV: "development" });
    const hostname = new URL(selected.apiBaseUrl).hostname;
    return { status: "PASS", restaurantSlug: slug, restaurantId: selected.restaurant.restaurantId, appKind: kind,
      environment: selected.environment, applicationId: selected.applicationId, apiBaseUrl: selected.apiBaseUrl,
      guestBaseUrl: selected.guestBaseUrl, scheme: selected.routing.scheme,
      route: hostname === "10.0.2.2" ? "ANDROID_EMULATOR_HOST" : /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(hostname)
        ? "ADB_REVERSE_REQUIRED_ON_DEVICE" : "EXPLICIT_DEVICE_ORIGIN",
      runtimeBranding: "CANONICAL_API_WITH_SAME_TENANT_FALLBACK", installedDeviceAcceptance: "NOT RUN" };
  }));
}

function appEnvironment(appDirectory, env) {
  // Match the ordinary export's production dotenv selection without mutating
  // process.env or logging dotenv variable names, values, or paths.
  if (env.EXPO_NO_DOTENV === "1") return { ...env };
  const parsed = parseProjectEnv(appDirectory, { mode: "production", silent: true, systemEnv: env });
  return { ...parsed.env, ...env };
}

function inspectProvider(kind, appDirectory, env) {
  const applicationId = getMobileBuildConfig(kind, { MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture",
    PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" }).applicationId;
  const enabled = env[`${kind.toUpperCase()}_NOTIFICATIONS_ENABLED`] === "true";
  let firebase;
  try {
    const client = selectFirebaseAndroid(kind, appDirectory, applicationId, env, "development");
    firebase = client ? { status: "PASS", appKind: kind, environment: "development", applicationId,
      matchingAndroidClients: 1, expectedProjectMatches: true, clientMetadataValid: true, deviceAcceptance: "NOT RUN" }
      : { status: "SKIPPED", appKind: kind, environment: "development", applicationId,
        reason: "Notifications are not requested; provider readiness is not established." };
  } catch (error) {
    // This is an allowlisted structured diagnostic from the existing validator.
    // Do not serialize Error.message, provider metadata or arbitrary environment.
    const diagnostic = error.firebaseDiagnostic;
    firebase = diagnostic ? { ...diagnostic } : { status: "BLOCKED", appKind: kind, applicationId, reason: "Firebase configuration could not be inspected." };
  }
  let authProtocol = "UNCONFIGURED";
  try { authProtocol = new URL(env.EXPO_PUBLIC_SUPABASE_URL).protocol === "https:" ? "HTTPS" : "NON_HTTPS"; } catch { /* Report only facts. */ }
  return { appKind: kind, notificationsRequested: enabled, firebase,
    auth: { status: authProtocol === "HTTPS" && /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "") ? "PASS" : "BLOCKED",
      urlType: authProtocol, publishableKeyConfigured: Boolean(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      localHttpAuth: "BLOCKED: existing Expo public Auth validation requires HTTPS and a publishable key.",
      scope: "Configuration syntax only; no Auth connection or installed-device acceptance." },
    maps: kind === "customer" ? { status: /^AIza[A-Za-z0-9_-]{35}$/.test(env.CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY ?? "") ? "PASS" : "SKIPPED",
      scope: "Key syntax controls native plugin inclusion; package/signature restrictions and device operation remain NOT RUN.",
      fallback: "MANUAL_ADDRESS" } : { status: "SKIPPED", reason: "No native Customer Maps plugin in Operations." } };
}

function collectReadiness({ env = process.env, platform = process.platform, repository = root, run = runTool } = {}) {
  const executable = name => platform === "win32" ? `${name}.exe` : name;
  const javaCandidates = [
    ...(env.JAVA_HOME ? [{ file: path.join(env.JAVA_HOME, "bin", executable("java")), source: "JAVA_HOME" }] : []),
    { file: executable("java"), source: "PATH" },
    ...(platform === "win32" ? [{ file: "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe", source: "EXISTING_JDK21" }] : [])
  ];
  let java = { status: "BLOCKED", major: null, version: null, source: "UNAVAILABLE" };
  for (const candidate of javaCandidates) {
    const result = run(candidate.file, ["-version"]);
    const match = result.output.match(/(?:java|openjdk) version "(\d+(?:\.\d+){0,3})/);
    if (result.ok && match) {
      java = { status: Number(match[1].split(".")[0]) === expected.javaMajor ? "PASS" : "BLOCKED",
        major: Number(match[1].split(".")[0]), version: match[1], source: candidate.source };
      if (java.status === "PASS") break;
    }
  }
  const sdkCandidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT,
    env.USERPROFILE && path.join(env.USERPROFILE, "AppData", "Local", "Android", "Sdk"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Android", "Sdk"),
    env.HOME && path.join(env.HOME, "Android", "Sdk")].filter(Boolean);
  const sdkDirectory = sdkCandidates.find(candidate => fs.existsSync(path.join(candidate, "platform-tools", executable("adb"))));
  const sdk = inspectSdk(sdkDirectory);
  const adbResult = sdkDirectory ? run(path.join(sdkDirectory, "platform-tools", executable("adb")), ["version"]) : { ok: false, output: "" };
  const adbVersion = adbResult.output.match(/Version (\d+\.\d+\.\d+)/)?.[1] ?? null;
  const emulatorFile = sdkDirectory && path.join(sdkDirectory, "emulator", executable("emulator"));
  const emulatorResult = emulatorFile ? run(emulatorFile, ["-version"]) : { ok: false, output: "" };
  const emulatorVersion = emulatorResult.output.match(/Android emulator version (\d+(?:\.\d+){2,3})/)?.[1] ?? null;
  const avds = emulatorResult.ok ? run(emulatorFile, ["-list-avds"]) : { ok: false, output: "" };
  const avdCount = avds.ok ? avds.output.split(/\r?\n/).filter(line => /^[A-Za-z0-9_.-]+$/.test(line.trim())).length : 0;
  const acceleration = emulatorResult.ok ? run(emulatorFile, ["-accel-check"]) : { ok: false, output: "" };
  const accelCode = acceleration.output.match(/accel:\s*(\d+)/)?.[1] ?? null;
  const emulator = { status: emulatorResult.ok && avdCount > 0 && sdk.systemImagePackagesPresent && acceleration.ok ? "PASS" : "BLOCKED",
    version: emulatorVersion, avdCount, acceleration: { status: acceleration.ok ? "PASS" : "BLOCKED", code: accelCode,
      windowsHypervisorDetected: /Hyper-V detected and Windows Hypervisor Platform is available/.test(acceleration.output) },
    smoke: "NOT RUN", reason: "This read-only command never starts an emulator or adb server." };
  const nativeProjects = kinds.map(kind => {
    const native = path.join(repository, "apps", `${kind}-mobile`, "android");
    const wrapperVersion = contents(path.join(native, "gradle", "wrapper", "gradle-wrapper.properties"))
      .match(/gradle-(\d+\.\d+(?:\.\d+)?)-bin\.zip/)?.[1] ?? null;
    return { appKind: kind, directoryPresent: fs.existsSync(native), wrapperVersion,
      status: wrapperVersion === expected.gradle ? "PASS" : "BLOCKED", gradleExecution: "NOT RUN" };
  });
  const providers = kinds.map(kind => {
    const appDirectory = path.join(repository, "apps", `${kind}-mobile`);
    return inspectProvider(kind, appDirectory, appEnvironment(appDirectory, env));
  });
  const blocked = java.status !== "PASS" || sdk.status !== "PASS" || !adbResult.ok || emulator.status !== "PASS" ||
    nativeProjects.some(project => project.status !== "PASS") ||
    providers.some(provider => provider.firebase.status !== "PASS" || provider.auth.status !== "PASS");
  return { milestone: "UXI-13B", mode: "READ_ONLY", status: blocked ? "BLOCKED" : "PASS", expected,
    java, sdk, adb: { status: adbResult.ok ? "PASS" : "BLOCKED", version: adbVersion, deviceEnumeration: "NOT RUN" },
    emulator, nativeProjects, fixtureBindings: fixtureBindings(env), providers,
    installedDeviceAcceptance: "NOT RUN", productionReadiness: "NOT RUN" };
}

if (require.main === module) {
  if (process.argv.slice(2).some(argument => argument !== "--strict")) {
    console.error("Usage: node scripts/android-readiness.cjs [--strict]");
    process.exitCode = 1;
  } else {
    try {
      const result = collectReadiness();
      console.log(JSON.stringify(result, null, 2));
      if (process.argv.includes("--strict") && result.status !== "PASS") process.exitCode = 1;
    } catch {
      console.error("Android readiness inspection failed. Check existing local tool/configuration access; no provider values were printed.");
      process.exitCode = 1;
    }
  }
}

module.exports = { collectReadiness, inspectSdk, fixtureBindings, inspectProvider, appEnvironment };
