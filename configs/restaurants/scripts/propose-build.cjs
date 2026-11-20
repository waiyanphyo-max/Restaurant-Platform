"use strict";

const { createHash } = require("node:crypto");
const {
  getMobileBuildConfig,
  listMobileBuildConfigs,
  validateRestaurantConfig,
  validateRestaurantRegistry,
  validateReleaseEndpoints
} = require("../index.cjs");

const kinds = ["operations", "customer"];
const environments = ["development", "staging", "production"];
const idField = (environment) => `${environment}ApplicationId`;
const digest = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\r\n\t]/.test(value)) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
}

function identityRows(config) {
  return kinds.flatMap((appKind) => environments.map((environment) => ({
    applicationId: config.android[appKind][idField(environment)],
    restaurantId: config.restaurantId,
    appKind,
    environment
  })));
}

function reviewHistory(history, candidate) {
  if (history === undefined) return { status: "PENDING_EXTERNAL_IDENTITY_REVIEW" };
  if (!history || history.schemaVersion !== 1 || !Array.isArray(history.applications)) {
    throw new Error("identity history requires schemaVersion 1 and an applications array");
  }
  for (const key of Object.keys(history)) {
    if (!["schemaVersion", "reviewedBy", "reviewedAt", "evidence", "applications"].includes(key)) {
      throw new Error(`identity history has an unsupported field: ${key}`);
    }
  }
  const reviewedBy = text(history.reviewedBy, "identity history reviewedBy");
  const reviewedAt = text(history.reviewedAt, "identity history reviewedAt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt)) ||
      new Date(reviewedAt).toISOString().slice(0, 10) !== reviewedAt) {
    throw new Error("identity history reviewedAt must be a valid YYYY-MM-DD date");
  }
  text(history.evidence, "identity history evidence");
  const seen = new Set();
  for (const item of history.applications) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some((key) => !["applicationId", "restaurantId", "appKind", "environment", "status"].includes(key)) ||
        !/^(?:[a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/.test(item.applicationId ?? "") ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.restaurantId ?? "") ||
        !kinds.includes(item.appKind) || !environments.includes(item.environment) ||
        !["reserved", "distributed"].includes(item.status) || seen.has(item.applicationId)) {
      throw new Error("identity history contains an invalid or duplicate application binding");
    }
    seen.add(item.applicationId);
  }
  for (const row of identityRows(candidate)) {
    const historical = history.applications.filter((item) => item.applicationId === row.applicationId ||
      (item.restaurantId === row.restaurantId && item.appKind === row.appKind && item.environment === row.environment));
    if (historical.length !== 1 || Object.entries(row).some(([key, value]) => historical[0][key] !== value)) {
      throw new Error("identity history must cover every proposed ID without changing or reusing a reserved/distributed binding");
    }
  }
  return { status: "REVIEW_EVIDENCE_RECORDED", reviewedBy, reviewedAt, evidenceDigest: digest(history) };
}

// Pure proposal generation: no active registry file, asset or app source is saved.
function createBuildProposal(input, history, { configs = listMobileBuildConfigs(), sourceRevision = null } = {}) {
  const configuration = validateRestaurantConfig(input, input?.slug);
  if (configuration.schemaVersion !== 2) throw new Error("build proposals require schemaVersion 2");
  if (sourceRevision !== null && !/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error("proposal source revision must be a full Git commit SHA");
  }
  const existing = configs.find((item) => item.slug === configuration.slug);
  if (existing) {
    if (existing.restaurantId !== configuration.restaurantId || kinds.some((kind) =>
      environments.some((environment) =>
        (existing.android[kind][idField(environment)] ?? `${existing.android[kind].stagingApplicationId}.dev`) !==
        configuration.android[kind][idField(environment)]))) {
      throw new Error("proposal cannot change an existing restaurant UUID or Android application ID");
    }
  }
  const others = configs.filter((item) => item !== existing);
  validateRestaurantRegistry([...others, configuration]);
  const identityHistoryReview = reviewHistory(history, configuration);
  const registry = new Map([...others, configuration].map((item) => [item.slug, item]));
  const builds = kinds.flatMap((kind) => environments.map((environment) => {
    const selected = getMobileBuildConfig(kind, {
      RESTAURANT_SLUG: configuration.slug,
      MOBILE_ENV: environment
    }, { registry });
    return {
      appKind: kind, environment, restaurantId: configuration.restaurantId,
      applicationId: selected.applicationId, displayName: selected.displayName,
      apiBaseUrl: selected.apiBaseUrl, guestBaseUrl: selected.guestBaseUrl,
      scheme: selected.routing.scheme,
      appLinks: selected.routing.appLinkOrigin ? [{
        host: new URL(selected.routing.appLinkOrigin).hostname,
        pathPrefix: selected.routing.appLinkPathPrefix
      }] : [],
      release: selected.release
    };
  }));
  const endpointReview = Object.fromEntries(["staging", "production"].map((environment) => {
    try {
      validateReleaseEndpoints(configuration, environment);
      return [environment, "REQUIRES_DEPLOYMENT_AND_HOST_OWNERSHIP_REVIEW"];
    } catch (error) {
      return [environment, `BLOCKED: ${error.message}`];
    }
  }));
  return {
    proposalVersion: 1,
    status: "REVIEW_REQUIRED_NOT_A_RELEASE_PLAN",
    sourceRevision,
    configurationDigest: digest(configuration),
    existingRegistryFile: existing ? `configs/restaurants/${configuration.slug}.json` : null,
    identityHistoryReview,
    endpointReview,
    configuration,
    builds,
    requiredReviews: [
      "Independently verify external reserved/distributed identity history; recorded evidence is not proof of completeness.",
      "Confirm the exact provisioned UUID in each deployed API environment and guest host mapping.",
      "Approve local logo, launcher/splash artwork, dimensions, crop, transparency and fallback palette.",
      "Review version codes against distributed releases, signing and Expo project ownership.",
      "Review Firebase/Maps package and certificate restrictions, Auth inputs and real Digital Asset Links.",
      "Explicitly approve saving the configuration; this command never saves or overwrites a registry entry.",
      "After approval use mobile:build resolve with the actual provider inputs and source revision to review a release fingerprint."
    ]
  };
}

module.exports = { createBuildProposal };
