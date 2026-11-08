"use strict";

const { execFileSync } = require("node:child_process");
const { statSync } = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { parseStringPromise } = require("xml2js");

const FINGERPRINT_META_DATA = "com.restaurantplatform.BUILD_FINGERPRINT";
const ANDROID_NAMESPACE = "http://schemas.android.com/apk/res/android";

function runTool(command, args, description) {
  try {
    return execFileSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  } catch (error) {
    const detail = error.code === "ENOENT" ? `Executable not found: ${command}` : error.stderr?.trim() || error.message;
    throw new Error(`${description} failed. ${detail}`, { cause: error });
  }
}

// Convert AAPT2's indented binary XML dump to the same shape as bundletool's parsed XML.
function parseApkManifest(output) {
  const document = Object.create(null);
  const stack = [{ indent: -1, element: document }];
  for (const line of output.split(/\r?\n/)) {
    const tag = /^(\s*)E: (\S+)/.exec(line);
    if (tag) {
      const [, spaces, name] = tag;
      const indent = spaces.length;
      while (stack.at(-1).indent >= indent) stack.pop();
      const element = Object.create(null);
      element.$ = Object.create(null);
      (stack.at(-1).element[name] ??= []).push(element);
      stack.push({ indent, element });
      continue;
    }
    const attribute = /^\s*A: ([^\s(=]+)(?:\(0x[\da-f]+\))?=(?:"((?:\\.|[^"\\])*)"|(\S+))/i.exec(line);
    if (attribute) {
      const [, key, quoted, scalar] = attribute;
      stack.at(-1).element.$[key.replace(`${ANDROID_NAMESPACE}:`, "android:")] = quoted ?? scalar;
    }
  }
  return document.manifest?.[0];
}

function parseApkLabel(badging) {
  const label = /^application-label:'([^\r\n]*)'\r?$/m.exec(badging)?.[1];
  return label === undefined ? undefined : JSON.parse(`"${label}"`);
}

function bundleLabel(dumpResources, label) {
  const reference = /^@?(?:(?:[\w.]+:)?(string\/\w+)|(0x[\da-f]+|\d+))$/i.exec(label ?? "");
  if (!reference) return label;
  const values = dumpResources(reference[1] ?? reference[2]);
  const defaults = [...values.matchAll(/^\s*\(default\) - \[STR\] (".*")\r?$/gm)];
  if (defaults.length !== 1) throw new Error(`Bundle has no unambiguous default string for its application label ${label}`);
  return JSON.parse(defaults[0][1]);
}

function assertEqual(field, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`Android artifact ${field} mismatch. Expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`);
  }
}

function verifyLinks(application, expected) {
  let customSchemeFound = false;
  const webLinks = new Set();
  const components = [...(application.activity ?? []), ...(application["activity-alias"] ?? [])];
  for (const component of components) {
    if (component.$?.["android:exported"] !== "true" || component.$?.["android:enabled"] === "false") continue;
    for (const filter of component["intent-filter"] ?? []) {
      const actions = (filter.action ?? []).map((item) => item.$?.["android:name"]);
      const categories = (filter.category ?? []).map((item) => item.$?.["android:name"]);
      if (!actions.includes("android.intent.action.VIEW") || !categories.includes("android.intent.category.BROWSABLE")) continue;
      const hasDefault = categories.includes("android.intent.category.DEFAULT");
      const hasRelativeGroup = Boolean(filter["uri-relative-filter-group"]?.length);
      const data = (filter.data ?? []).map((item) => item.$ ?? {});
      const schemes = data.map((entry) => entry["android:scheme"]);
      if (schemes.some((scheme) => scheme?.startsWith("rp-") && scheme !== expected.scheme)) {
        throw new Error("Android artifact contains an unexpected restaurant deep link scheme.");
      }
      if (hasDefault && !hasRelativeGroup && data.every((entry) => Object.keys(entry).length === 1) &&
          schemes.includes(expected.scheme)) {
        customSchemeFound = true;
      }
      if (!schemes.some((scheme) => scheme === "http" || scheme === "https")) continue;
      const link = data[0];
      // Android combines data attributes across elements in the same filter. An exact
      // scheme/host/path triple in its own filter avoids unintended combinations.
      if (!hasDefault || hasRelativeGroup || filter.$?.["android:autoVerify"] !== "true" || data.length !== 1 ||
          link["android:scheme"] !== "https" || !link["android:host"] || !link["android:pathPrefix"] ||
          Object.keys(link).length !== 3) {
        throw new Error("Android artifact contains an unexpected or unverified web link intent filter.");
      }
      webLinks.add(`https://${link["android:host"]}${link["android:pathPrefix"]}`);
    }
  }
  assertEqual("custom deep link scheme", customSchemeFound ? expected.scheme : undefined, expected.scheme);
  const expectedLinks = expected.appLinks.map(({ host, pathPrefix }) => `https://${host}${pathPrefix}`).sort();
  assertEqual("verified App Links", [...webLinks].sort(), expectedLinks);
}

function verifyAndroidManifest(manifest, displayName, expected) {
  if (!manifest?.$ || manifest.application?.length !== 1) throw new Error("Android artifact has no readable application manifest.");
  const application = manifest.application[0];
  assertEqual("package", manifest.$.package, expected.applicationId);
  assertEqual("version name", manifest.$["android:versionName"], expected.versionName);
  assertEqual("version code", manifest.$["android:versionCode"], String(expected.versionCode));
  assertEqual("version code major", manifest.$["android:versionCodeMajor"] ?? "0", "0");
  assertEqual("display name", displayName, expected.displayName);
  const metadata = (application["meta-data"] ?? []).filter((item) => item.$?.["android:name"] === FINGERPRINT_META_DATA);
  assertEqual("build fingerprint", metadata.length === 1 ? metadata[0].$["android:value"] : undefined, expected.fingerprint);
  verifyLinks(application, expected);
}

function verifyEmbeddedExpoConfig(config, expected) {
  const extra = config?.extra;
  assertEqual("embedded package", config?.android?.package, expected.applicationId);
  assertEqual("embedded restaurant UUID", extra?.tenant?.restaurantId, expected.restaurantId);
  assertEqual("embedded restaurant slug", extra?.tenant?.slug, expected.restaurantSlug);
  assertEqual("embedded app kind", extra?.appKind, expected.appKind);
  assertEqual("embedded environment", extra?.mobileEnvironment, expected.environment);
  assertEqual("embedded API origin", extra?.apiBaseUrl, expected.apiBaseUrl);
  assertEqual("embedded guest origin", extra?.guestBaseUrl ?? null, expected.guestBaseUrl);
  assertEqual("embedded routing", {
    scheme: extra?.routing?.scheme,
    appLinkOrigin: extra?.routing?.appLinkOrigin ?? null,
    appLinkPathPrefix: extra?.routing?.appLinkPathPrefix ?? null
  }, {
    scheme: expected.scheme,
    appLinkOrigin: expected.appLinks.length ? expected.guestBaseUrl : null,
    appLinkPathPrefix: expected.appLinks[0]?.pathPrefix ?? null
  });
  assertEqual("embedded release package", extra?.release?.applicationId, expected.applicationId);
  assertEqual("embedded build fingerprint", extra?.release?.fingerprint, expected.fingerprint);
}

function readEmbeddedExpoConfig(artifact, extension) {
  const entry = extension === ".apk" ? "assets/app.config" : "base/assets/app.config";
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const readAsset = [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "    entries = [entry for entry in archive.infolist() if entry.filename == sys.argv[2]]",
    "    if len(entries) != 1 or entries[0].file_size > 1024 * 1024:",
    "        sys.exit('Missing, duplicate, or oversized Expo app.config')",
    "    sys.stdout.buffer.write(archive.read(entries[0]))"
  ].join("\n");
  return JSON.parse(runTool(python, ["-c", readAsset, artifact, entry], "Embedded Expo config inspection"));
}

async function verifyAndroidArtifact(artifactPath, expected) {
  if (!/^sha256:[\da-f]{64}$/.test(expected.fingerprint)) throw new Error("Expected Android build fingerprint must be a prefixed SHA-256 hash.");
  const artifact = path.resolve(artifactPath);
  const extension = path.extname(artifact).toLowerCase();
  if (![".apk", ".aab"].includes(extension)) throw new Error("Android artifact must be an APK or AAB file.");
  if (!statSync(artifact, { throwIfNoEntry: false })?.isFile()) throw new Error(`Android artifact file not found: ${artifact}`);

  let manifest;
  let displayName;
  if (extension === ".apk") {
    const aapt2 = process.env.AAPT2 || "aapt2";
    manifest = parseApkManifest(runTool(aapt2, ["dump", "xmltree", artifact, "--file", "AndroidManifest.xml"], "AAPT2 manifest inspection"));
    displayName = parseApkLabel(runTool(aapt2, ["dump", "badging", artifact], "AAPT2 application label inspection"));
  } else {
    if (!process.env.BUNDLETOOL_JAR) throw new Error("Set BUNDLETOOL_JAR to the standalone bundletool JAR to verify an AAB.");
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
    const dump = (target, ...flags) => runTool(java, ["-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8",
      "-Dsun.stdout.encoding=UTF-8", "-jar", process.env.BUNDLETOOL_JAR,
      "dump", target, `--bundle=${artifact}`, ...flags], `bundletool ${target} inspection`);
    ({ manifest } = await parseStringPromise(dump("manifest")));
    displayName = bundleLabel((resource) => dump("resources", `--resource=${resource}`, "--values"),
      manifest?.application?.[0]?.$?.["android:label"]);
  }

  verifyAndroidManifest(manifest, displayName, expected);
  verifyEmbeddedExpoConfig(readEmbeddedExpoConfig(artifact, extension), expected);
  return { ...expected, artifact };
}

module.exports = { verifyAndroidArtifact, verifyAndroidManifest, verifyEmbeddedExpoConfig, parseApkLabel, FINGERPRINT_META_DATA };
