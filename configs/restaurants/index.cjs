"use strict";

const fs = require("node:fs");
const { Buffer } = require("node:buffer");
const { isIP } = require("node:net");
const path = require("node:path");

const CONFIG_DIR = __dirname;
const MOBILE_ENVIRONMENTS = ["development", "staging", "production"];
const MOBILE_KINDS = ["operations", "customer"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const APPLICATION_ID_PATTERN = /^(?:[a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label} has an unsupported field: ${key}`);
    }
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() !== value || !value || /[\r\n\t]/.test(value)) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
}

function requireSlug(value, label) {
  const slug = requireText(value, label);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`${label} must be a lowercase URL slug`);
  }
  return slug;
}

function requireHost(value, label) {
  const host = requireText(value, label);
  if (host !== host.toLowerCase() || host.includes(":") || host.includes("/") || host.includes("@")) {
    throw new Error(`${label} must be a lowercase hostname without a port or scheme`);
  }
  if (host === "localhost") return host;
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253 || labels.some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
    throw new Error(`${label} must be a valid hostname`);
  }
  return host;
}

function requireHostList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a nonempty hostname list`);
  }
  const hosts = value.map((item, index) => requireHost(item, `${label}[${index}]`));
  if (new Set(hosts).size !== hosts.length) {
    throw new Error(`${label} contains a duplicate hostname`);
  }
  return hosts;
}

function requirePngPath(value, label, { square = false, logo = false } = {}) {
  if (value === undefined) return undefined;
  const relative = requireText(value, label).replaceAll("\\", "/");
  if (!/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.png$/.test(relative)) {
    throw new Error(`${label} must be a PNG inside configs/restaurants/assets`);
  }
  const absolute = path.resolve(CONFIG_DIR, relative);
  const assets = path.resolve(CONFIG_DIR, "assets");
  const file = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!absolute.startsWith(assets + path.sep) || !file?.isFile()) {
    throw new Error(`${label} must refer to an existing PNG asset`);
  }
  if (fs.realpathSync(absolute) !== absolute) throw new Error(`${label} must not traverse a symlink`);
  if (logo && file.size > 96 * 1024) throw new Error(`${label} must be 96 KiB or smaller`);
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(absolute, "r");
  let bytesRead;
  try {
    bytesRead = fs.readSync(descriptor, header);
  } finally {
    fs.closeSync(descriptor);
  }
  if (file.size < 45 || bytesRead !== header.length || !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
      header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR" ||
      !header.readUInt32BE(16) || !header.readUInt32BE(20)) {
    throw new Error(`${label} must be a PNG image`);
  }
  if (square && header.readUInt32BE(16) !== header.readUInt32BE(20)) throw new Error(`${label} must be square`);
  return relative;
}

function validateAndroidApp(value, label, schemaVersion) {
  const app = requireObject(value, label);
  const legacyKeys = ["displayName", "stagingApplicationId", "productionApplicationId", "iconPath"];
  requireOnlyKeys(app, schemaVersion === 1 ? legacyKeys : [
    ...legacyKeys, "developmentApplicationId", "splashPath", "splashBackgroundColor", "release", "eas"
  ], label);
  const displayName = requireText(app.displayName, `${label}.displayName`);
  const stagingApplicationId = requireText(app.stagingApplicationId, `${label}.stagingApplicationId`);
  const productionApplicationId = requireText(app.productionApplicationId, `${label}.productionApplicationId`);
  const developmentApplicationId = schemaVersion === 2
    ? requireText(app.developmentApplicationId, `${label}.developmentApplicationId`)
    : `${stagingApplicationId}.dev`;
  for (const applicationId of [developmentApplicationId, stagingApplicationId, productionApplicationId]) {
    if (!APPLICATION_ID_PATTERN.test(applicationId)) {
      throw new Error(`${label} has an invalid Android application ID`);
    }
  }
  const iconPath = requirePngPath(app.iconPath, `${label}.iconPath`, { square: schemaVersion === 2 });
  const base = { displayName, stagingApplicationId, productionApplicationId, ...(iconPath ? { iconPath } : {}) };
  if (schemaVersion === 1) return base;

  const splashPath = requirePngPath(app.splashPath, `${label}.splashPath`);
  if (!iconPath || !splashPath) throw new Error(`${label} requires iconPath and splashPath`);
  const splashBackgroundColor = requireColor(app.splashBackgroundColor, `${label}.splashBackgroundColor`);
  const release = requireObject(app.release, `${label}.release`);
  requireOnlyKeys(release, ["versionName", "versionCode"], `${label}.release`);
  const versionName = requireText(release.versionName, `${label}.release.versionName`);
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(versionName)) {
    throw new Error(`${label}.release.versionName must be major.minor.patch`);
  }
  const versionCode = release.versionCode;
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
    throw new Error(`${label}.release.versionCode must be an integer from 1 to 2100000000`);
  }
  let eas;
  if (app.eas !== undefined) {
    const config = requireObject(app.eas, `${label}.eas`);
    requireOnlyKeys(config, ["owner", "projectId"], `${label}.eas`);
    const owner = requireSlug(config.owner, `${label}.eas.owner`);
    const projectId = requireUuid(config.projectId, `${label}.eas.projectId`);
    eas = { owner, projectId };
  }
  return { ...base, developmentApplicationId, splashPath, splashBackgroundColor, release: { versionName, versionCode },
    ...(eas ? { eas } : {}) };
}

function requireColor(value, label) {
  const color = requireText(value, label);
  if (!COLOR_PATTERN.test(color)) throw new Error(`${label} must be a six-digit hex color`);
  return color.toUpperCase();
}

function requireUuid(value, label) {
  const id = requireText(value, label);
  if (!UUID_PATTERN.test(id)) throw new Error(`${label} must be a UUID`);
  return id.toLowerCase();
}

function getApplicationIds(app) {
  return {
    development: app.developmentApplicationId ?? `${app.stagingApplicationId}.dev`,
    staging: app.stagingApplicationId,
    production: app.productionApplicationId
  };
}

function validateMobileProfiles(value, slug) {
  const profiles = requireObject(value, "mobileProfiles");
  requireOnlyKeys(profiles, MOBILE_ENVIRONMENTS, "mobileProfiles");
  return Object.fromEntries(MOBILE_ENVIRONMENTS.map((environment) => {
    const label = `mobileProfiles.${environment}`;
    const profile = requireObject(profiles[environment], label);
    const development = environment === "development";
    requireOnlyKeys(profile, development ? ["apiBaseUrl", "guestBaseUrl"] : ["apiBaseUrl"], label);
    const apiBaseUrl = requireOrigin(profile.apiBaseUrl, environment, `${label}.apiBaseUrl`);
    const guestBaseUrl = development ? requireOrigin(profile.guestBaseUrl, environment, `${label}.guestBaseUrl`, slug) : undefined;
    return [environment, { apiBaseUrl, ...(guestBaseUrl ? { guestBaseUrl } : {}) }];
  }));
}

function validateRestaurantConfig(value, expectedSlug, options = {}) {
  const item = requireObject(value, "restaurant config");
  const { schemaVersion } = item;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error("restaurant config schemaVersion must be 1 or 2");
  const keys = ["schemaVersion", "slug", "restaurantId", "branding", "guestDomains", "android", "fixture"];
  requireOnlyKeys(item, schemaVersion === 1 ? keys : [...keys, "mobileProfiles"], "restaurant config");
  if (item.fixture === true && options.allowFixture !== true) throw new Error("fixture config is not a real restaurant config");
  if (item.fixture !== undefined && item.fixture !== true) throw new Error("restaurant config fixture field must be true when present");
  const slug = requireSlug(item.slug, "restaurant config slug");
  if (expectedSlug !== undefined && slug !== requireSlug(expectedSlug, "expected restaurant slug")) {
    throw new Error("restaurant config slug does not match its filename");
  }
  const restaurantId = requireUuid(item.restaurantId, "restaurant config restaurantId");

  const branding = requireObject(item.branding, "restaurant config branding");
  const brandKeys = ["displayName", "primaryColor", "logoUrl"];
  requireOnlyKeys(branding, schemaVersion === 1 ? brandKeys : [...brandKeys, "secondaryColor", "backgroundColor", "logoPath"], "restaurant config branding");
  const displayName = requireText(branding.displayName, "restaurant config branding.displayName");
  const primaryColor = requireColor(branding.primaryColor, "restaurant config branding.primaryColor");
  const secondaryColor = schemaVersion === 2 ? requireColor(branding.secondaryColor, "restaurant config branding.secondaryColor") : undefined;
  const backgroundColor = schemaVersion === 2 ? requireColor(branding.backgroundColor, "restaurant config branding.backgroundColor") : undefined;
  const logoPath = requirePngPath(branding.logoPath, "restaurant config branding.logoPath", { logo: true });
  if (schemaVersion === 2 && !logoPath) throw new Error("restaurant config branding.logoPath is required");
  let logoUrl;
  if (branding.logoUrl !== undefined) {
    const value = requireText(branding.logoUrl, "restaurant config branding.logoUrl");
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("restaurant config branding.logoUrl must be an HTTPS URL"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("restaurant config branding.logoUrl must be a public HTTPS URL without credentials, query, or fragment");
    }
    logoUrl = value;
  }

  const guestDomains = requireObject(item.guestDomains, "restaurant config guestDomains");
  requireOnlyKeys(guestDomains, ["staging", "production"], "restaurant config guestDomains");
  const staging = requireHostList(guestDomains.staging, "restaurant config guestDomains.staging");
  const production = requireHostList(guestDomains.production, "restaurant config guestDomains.production");
  if (schemaVersion === 2 && [...staging, ...production].some((host) => host === "localhost" || host.endsWith(".localhost") || isIP(host))) {
    throw new Error("staging and production guest domains must use DNS hostnames for Android App Links");
  }

  const android = requireObject(item.android, "restaurant config android");
  requireOnlyKeys(android, ["operations", "customer"], "restaurant config android");
  const operations = validateAndroidApp(android.operations, "restaurant config android.operations", schemaVersion);
  const customer = validateAndroidApp(android.customer, "restaurant config android.customer", schemaVersion);
  const ids = [operations, customer].flatMap((app) => Object.values(getApplicationIds(app)));
  if (new Set(ids).size !== ids.length) throw new Error("Android application IDs must differ across apps and profiles");
  if ((item.fixture !== true && !logoUrl) || (schemaVersion === 1 && item.fixture !== true && (!operations.iconPath || !customer.iconPath))) {
    throw new Error("real restaurant configs require a public logo URL and both Android icon paths");
  }
  const mobileProfiles = schemaVersion === 2 ? validateMobileProfiles(item.mobileProfiles, slug) : undefined;

  return {
    schemaVersion,
    slug,
    restaurantId,
    branding: { displayName, primaryColor, ...(logoUrl ? { logoUrl } : {}),
      ...(logoPath ? { logoPath, secondaryColor, backgroundColor } : {}) },
    guestDomains: { staging, production },
    android: { operations, customer },
    ...(mobileProfiles ? { mobileProfiles } : {}),
    ...(item.fixture === true ? { fixture: true } : {})
  };
}

function checkUniqueConfigs(configs) {
  const slugs = new Set();
  const restaurantIds = new Set();
  const hosts = new Set();
  const applicationIds = new Set();
  const projectIds = new Set();
  for (const value of configs) {
    if (slugs.has(value.slug)) throw new Error("duplicate restaurant slug in registry");
    if (restaurantIds.has(value.restaurantId)) throw new Error("duplicate restaurant UUID in registry");
    slugs.add(value.slug);
    restaurantIds.add(value.restaurantId);
    for (const host of [...value.guestDomains.staging, ...value.guestDomains.production]) {
      if (hosts.has(host)) throw new Error("duplicate guest domain in registry");
      hosts.add(host);
    }
    for (const app of [value.android.operations, value.android.customer]) {
      for (const applicationId of Object.values(getApplicationIds(app))) {
        if (applicationIds.has(applicationId)) throw new Error("duplicate Android application ID in registry");
        applicationIds.add(applicationId);
      }
      if (app.eas) {
        if (projectIds.has(app.eas.projectId)) throw new Error("duplicate EAS project ID in registry");
        projectIds.add(app.eas.projectId);
      }
    }
  }
}

function validateRestaurantRegistry(configs) {
  checkUniqueConfigs(configs.map((config) => validateRestaurantConfig(config, config?.slug, { allowFixture: config?.fixture === true })));
}

function listRestaurantConfigs() {
  const files = fs.readdirSync(CONFIG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .filter((name) => !["package.json", "tsconfig.json"].includes(name) && !name.endsWith(".example.json"))
    .sort();
  const configs = files.map((name) => {
    const slug = name.slice(0, -5);
    requireSlug(slug, "restaurant config filename");
    const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf8"));
    return validateRestaurantConfig(raw, slug);
  });
  checkUniqueConfigs(configs);
  return configs;
}

function loadRestaurantConfig(slug) {
  const name = requireSlug(slug, "RESTAURANT_SLUG");
  const match = listRestaurantConfigs().find((item) => item.slug === name);
  if (!match) throw new Error("no real restaurant config found for RESTAURANT_SLUG");
  return match;
}

function normalizeRequestHost(value) {
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase().replace(/\.$/, "");
  if (!input || /[/?#@\\\s]/.test(input) || input.includes("://")) return null;
  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(input);
  if (!match) return null;
  if (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)) return null;
  try { return requireHost(match[1], "request host"); } catch { return null; }
}

function resolveRestaurantByHost(host, environment) {
  if (environment !== "staging" && environment !== "production") {
    throw new Error("guest environment must be staging or production");
  }
  const normalized = normalizeRequestHost(host);
  if (!normalized) return null;
  const matches = listRestaurantConfigs().filter((item) => item.guestDomains[environment].includes(normalized));
  if (matches.length > 1) throw new Error("ambiguous guest domain mapping");
  return matches[0] ?? null;
}

function listDevelopmentFixtures() {
  return ["starter-fixture", "restaurant-a", "restaurant-b"].map((slug) => {
    const filename = slug === "starter-fixture" ? "starter.json" : `${slug}.json`;
    const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "fixtures", filename), "utf8"));
    if (raw.fixture !== true) throw new Error(`${filename} is missing the fixture marker`);
    return validateRestaurantConfig(raw, slug, { allowFixture: true });
  });
}

function listMobileBuildConfigs() {
  const configs = [...listRestaurantConfigs(), ...listDevelopmentFixtures()];
  checkUniqueConfigs(configs);
  return configs;
}

function requireOrigin(value, environment, label, guestSlug) {
  const text = requireText(value, label);
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error(`${label} must be an absolute URL`); }
  if (!/^https?:\/\/[^/]+\/?$/.test(text) || /[\\?#\s]/.test(text) || parsed.username || parsed.password || parsed.pathname !== "/") {
    throw new Error(`${label} must be an origin without credentials, path, query, or fragment`);
  }
  const localHost = ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(parsed.hostname) ||
    (guestSlug !== undefined && parsed.hostname === `${guestSlug}.localhost`);
  if (parsed.protocol !== "https:" && !(environment === "development" && parsed.protocol === "http:" && localHost)) {
    throw new Error(`${label} must use HTTPS or a loopback development origin`);
  }
  return parsed.origin;
}

function getMobileBuildConfig(kind, environmentVariables = process.env, {
  inspectFixtureProfiles = false, registry
} = {}) {
  if (!MOBILE_KINDS.includes(kind)) throw new Error("mobile app kind must be operations or customer");
  const environment = requireText(environmentVariables.MOBILE_ENV, "MOBILE_ENV");
  if (!MOBILE_ENVIRONMENTS.includes(environment)) {
    throw new Error("MOBILE_ENV must be development, staging, or production");
  }
  if (environmentVariables.EAS_BUILD_PROFILE && environmentVariables.EAS_BUILD_PROFILE !== environment) {
    throw new Error("MOBILE_ENV does not match EAS_BUILD_PROFILE");
  }
  const slug = requireSlug(environmentVariables.RESTAURANT_SLUG, "RESTAURANT_SLUG");
  const restaurant = registry ? registry.get(slug) : listMobileBuildConfigs().find((item) => item.slug === slug);
  if (!restaurant || (restaurant.fixture && environment !== "development" && !inspectFixtureProfiles)) {
    throw new Error("no real restaurant config found for RESTAURANT_SLUG");
  }
  if (restaurant.schemaVersion === 1 && !restaurant.fixture) {
    throw new Error("Android builds require schemaVersion 2 for a provisioned restaurant");
  }
  const app = restaurant.android[kind];
  if (environmentVariables.EAS_BUILD === "true" && (!app.eas || restaurant.fixture)) {
    throw new Error("EAS builds require an approved project for a provisioned restaurant");
  }
  if (environmentVariables.EAS_BUILD_PROJECT_ID && environmentVariables.EAS_BUILD_PROJECT_ID !== app.eas?.projectId) {
    throw new Error("selected restaurant app does not match EAS_BUILD_PROJECT_ID");
  }
  const profile = restaurant.mobileProfiles?.[environment];
  const apiBaseUrl = profile?.apiBaseUrl ?? requireOrigin(environmentVariables.PUBLIC_API_BASE_URL, environment, "PUBLIC_API_BASE_URL");
  const appLinkOrigin = environment === "development" ? null : `https://${restaurant.guestDomains[environment][0]}`;
  const guestBaseUrl = appLinkOrigin ?? profile?.guestBaseUrl ??
    (environmentVariables.PUBLIC_GUEST_BASE_URL
      ? requireOrigin(environmentVariables.PUBLIC_GUEST_BASE_URL, environment, "PUBLIC_GUEST_BASE_URL", restaurant.slug) : null);
  const scheme = `rp-${restaurant.slug}-${kind}` + (restaurant.schemaVersion === 2 && environment !== "production" ? `-${environment}` : "");
  const applicationId = getApplicationIds(app)[environment];
  const displayName = environment === "production" ? app.displayName : `${app.displayName} (${environment})`;
  return {
    environment,
    kind,
    restaurant,
    app,
    applicationId,
    displayName,
    ...(app.iconPath ? { iconPath: path.resolve(CONFIG_DIR, app.iconPath) } : {}),
    release: app.release ?? { versionName: "0.1.0", versionCode: 1 },
    apiBaseUrl,
    guestBaseUrl,
    routing: { scheme, appLinkOrigin, appLinkPathPrefix: appLinkOrigin ? `/app/${kind}/` : null }
  };
}

module.exports = {
  validateRestaurantConfig,
  validateRestaurantRegistry,
  listRestaurantConfigs,
  listDevelopmentFixtures,
  listMobileBuildConfigs,
  loadRestaurantConfig,
  resolveRestaurantByHost,
  getMobileBuildConfig
};
