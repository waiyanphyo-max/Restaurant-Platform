"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_DIR = __dirname;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const APPLICATION_ID_PATTERN = /^(?:[a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/;

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
  if (typeof value !== "string" || value.trim() !== value || !value) {
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

function requireIconPath(value, label) {
  if (value === undefined) return undefined;
  const relative = requireText(value, label).replaceAll("\\", "/");
  if (!/^assets\/[a-zA-Z0-9/_-]+\.png$/.test(relative) || relative.split("/").includes("..")) {
    throw new Error(`${label} must be a PNG inside configs/restaurants/assets`);
  }
  const absolute = path.resolve(CONFIG_DIR, relative);
  const assets = path.resolve(CONFIG_DIR, "assets");
  if (!absolute.startsWith(assets + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`${label} must refer to an existing PNG asset`);
  }
  return relative;
}

function validateAndroidApp(value, label) {
  const app = requireObject(value, label);
  requireOnlyKeys(app, ["displayName", "stagingApplicationId", "productionApplicationId", "iconPath"], label);
  const displayName = requireText(app.displayName, `${label}.displayName`);
  const stagingApplicationId = requireText(app.stagingApplicationId, `${label}.stagingApplicationId`);
  const productionApplicationId = requireText(app.productionApplicationId, `${label}.productionApplicationId`);
  for (const applicationId of [stagingApplicationId, productionApplicationId]) {
    if (!APPLICATION_ID_PATTERN.test(applicationId)) {
      throw new Error(`${label} has an invalid Android application ID`);
    }
  }
  const iconPath = requireIconPath(app.iconPath, `${label}.iconPath`);
  return { displayName, stagingApplicationId, productionApplicationId, ...(iconPath ? { iconPath } : {}) };
}

function validateRestaurantConfig(value, expectedSlug, options = {}) {
  const item = requireObject(value, "restaurant config");
  requireOnlyKeys(item, ["schemaVersion", "slug", "restaurantId", "branding", "guestDomains", "android", "fixture"], "restaurant config");
  if (item.schemaVersion !== 1) throw new Error("restaurant config schemaVersion must be 1");
  if (item.fixture === true && options.allowFixture !== true) throw new Error("fixture config is not a real restaurant config");
  if (item.fixture !== undefined && item.fixture !== true) throw new Error("restaurant config fixture field must be true when present");
  const slug = requireSlug(item.slug, "restaurant config slug");
  if (expectedSlug !== undefined && slug !== requireSlug(expectedSlug, "expected restaurant slug")) {
    throw new Error("restaurant config slug does not match its filename");
  }
  const restaurantId = requireText(item.restaurantId, "restaurant config restaurantId");
  if (!UUID_PATTERN.test(restaurantId)) throw new Error("restaurant config restaurantId must be a UUID");

  const branding = requireObject(item.branding, "restaurant config branding");
  requireOnlyKeys(branding, ["displayName", "primaryColor", "logoUrl"], "restaurant config branding");
  const displayName = requireText(branding.displayName, "restaurant config branding.displayName");
  const primaryColor = requireText(branding.primaryColor, "restaurant config branding.primaryColor");
  if (!COLOR_PATTERN.test(primaryColor)) throw new Error("restaurant config branding.primaryColor must be a six-digit hex color");
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

  const android = requireObject(item.android, "restaurant config android");
  requireOnlyKeys(android, ["operations", "customer"], "restaurant config android");
  const operations = validateAndroidApp(android.operations, "restaurant config android.operations");
  const customer = validateAndroidApp(android.customer, "restaurant config android.customer");
  const ids = [operations.stagingApplicationId, operations.productionApplicationId, customer.stagingApplicationId, customer.productionApplicationId];
  if (new Set(ids).size !== ids.length) throw new Error("operations/customer and staging/production Android application IDs must differ");
  if (item.fixture !== true && (!logoUrl || !operations.iconPath || !customer.iconPath)) {
    throw new Error("real restaurant configs require a public logo URL and both Android icon paths");
  }

  return {
    schemaVersion: 1,
    slug,
    restaurantId: restaurantId.toLowerCase(),
    branding: { displayName, primaryColor: primaryColor.toUpperCase(), ...(logoUrl ? { logoUrl } : {}) },
    guestDomains: { staging, production },
    android: { operations, customer },
    ...(item.fixture === true ? { fixture: true } : {})
  };
}

function validateRestaurantRegistry(configs) {
  const slugs = new Set();
  const restaurantIds = new Set();
  const hosts = new Set();
  const applicationIds = new Set();
  for (const config of configs) {
    const value = validateRestaurantConfig(config, config.slug, { allowFixture: config.fixture === true });
    if (slugs.has(value.slug)) throw new Error("duplicate restaurant slug in registry");
    if (restaurantIds.has(value.restaurantId)) throw new Error("duplicate restaurant UUID in registry");
    slugs.add(value.slug);
    restaurantIds.add(value.restaurantId);
    for (const host of [...value.guestDomains.staging, ...value.guestDomains.production]) {
      if (hosts.has(host)) throw new Error("duplicate guest domain in registry");
      hosts.add(host);
    }
    for (const app of [value.android.operations, value.android.customer]) {
      for (const applicationId of [app.stagingApplicationId, app.productionApplicationId]) {
        if (applicationIds.has(applicationId)) throw new Error("duplicate Android application ID in registry");
        applicationIds.add(applicationId);
      }
    }
  }
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
  validateRestaurantRegistry(configs);
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

function loadDevelopmentFixture() {
  const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "fixtures", "starter.json"), "utf8"));
  if (raw.fixture !== true) throw new Error("development fixture marker is missing");
  return validateRestaurantConfig(raw, "starter-fixture", { allowFixture: true });
}

function requireApiBaseUrl(value, environment) {
  const text = requireText(value, "PUBLIC_API_BASE_URL");
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error("PUBLIC_API_BASE_URL must be an absolute URL"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("PUBLIC_API_BASE_URL must be an origin without credentials, path, query, or fragment");
  }
  if (parsed.protocol !== "https:" && !(environment === "development" && parsed.protocol === "http:")) {
    throw new Error("PUBLIC_API_BASE_URL must use HTTPS outside development");
  }
  return parsed.origin;
}

function getMobileBuildConfig(kind, environmentVariables = process.env) {
  if (kind !== "operations" && kind !== "customer") throw new Error("mobile app kind must be operations or customer");
  const environment = requireText(environmentVariables.MOBILE_ENV, "MOBILE_ENV");
  if (!["development", "staging", "production"].includes(environment)) {
    throw new Error("MOBILE_ENV must be development, staging, or production");
  }
  const slug = requireSlug(environmentVariables.RESTAURANT_SLUG, "RESTAURANT_SLUG");
  const restaurant = environment === "development" && slug === "starter-fixture"
    ? loadDevelopmentFixture()
    : loadRestaurantConfig(slug);
  if (restaurant.fixture === true && environment !== "development") throw new Error("fixture cannot be used outside development");
  const apiBaseUrl = requireApiBaseUrl(environmentVariables.PUBLIC_API_BASE_URL, environment);
  const app = restaurant.android[kind];
  const applicationId = environment === "production"
    ? app.productionApplicationId
    : environment === "staging" ? app.stagingApplicationId : `${app.stagingApplicationId}.dev`;
  const displayName = environment === "production" ? app.displayName : `${app.displayName} (${environment})`;
  return {
    environment,
    restaurant,
    applicationId,
    displayName,
    ...(app.iconPath ? { iconPath: path.resolve(CONFIG_DIR, app.iconPath) } : {}),
    apiBaseUrl
  };
}

module.exports = {
  validateRestaurantConfig,
  validateRestaurantRegistry,
  listRestaurantConfigs,
  loadRestaurantConfig,
  resolveRestaurantByHost,
  getMobileBuildConfig
};
