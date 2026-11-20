"use strict";

const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listDevelopmentFixtures, listRestaurantConfigs } = require("../index.cjs");
const { createBuildProposal } = require("../scripts/propose-build.cjs");

const [, a, b] = listDevelopmentFixtures();
const options = { configs: [a, b], sourceRevision: "a".repeat(40) };
function candidate() {
  const value = structuredClone(a);
  delete value.fixture;
  value.slug = "restaurant-c";
  value.restaurantId = "00000000-0000-4000-8000-000000000103";
  value.branding.logoUrl = "https://restaurant-c.test/logo.png";
  value.guestDomains = { staging: ["restaurant-c.staging.test"], production: ["restaurant-c.test"] };
  value.mobileProfiles.development.guestBaseUrl = "http://restaurant-c.localhost:3002";
  for (const environment of ["staging", "production"]) {
    value.mobileProfiles[environment].apiBaseUrl = `https://api.restaurant-c${environment === "staging" ? ".staging" : ""}.test`;
  }
  for (const app of Object.values(value.android)) {
    for (const environment of ["development", "staging", "production"]) {
      app[`${environment}ApplicationId`] = app[`${environment}ApplicationId`].replace("fixturea", "fixturec");
    }
  }
  return value;
}
function history(value) {
  return {
    schemaVersion: 1, reviewedBy: "Synthetic reviewer", reviewedAt: "2026-11-20",
    evidence: "Synthetic offline inventory only; not real distribution evidence",
    applications: Object.entries(value.android).flatMap(([appKind, app]) =>
      ["development", "staging", "production"].map((environment) => ({
        applicationId: app[`${environment}ApplicationId`], restaurantId: value.restaurantId,
        appKind, environment, status: "reserved"
      })))
  };
}

test("proposal deterministically reuses schema v2 with six immutable build bindings and pending reviews", () => {
  const value = candidate();
  const before = JSON.stringify(value);
  const proposal = createBuildProposal(value, undefined, options);
  assert.deepEqual(createBuildProposal(value, undefined, options), proposal);
  assert.equal(JSON.stringify(value), before);
  assert.equal(proposal.status, "REVIEW_REQUIRED_NOT_A_RELEASE_PLAN");
  assert.equal(proposal.identityHistoryReview.status, "PENDING_EXTERNAL_IDENTITY_REVIEW");
  assert.equal(proposal.builds.length, 6);
  assert.equal(new Set(proposal.builds.map((row) => row.applicationId)).size, 6);
  assert.equal(new Set(proposal.builds.map((row) => row.scheme)).size, 6);
  assert.ok(proposal.builds.every((row) => row.restaurantId === value.restaurantId));
  assert.match(proposal.endpointReview.production, /^BLOCKED:/);
  assert.equal(proposal.sourceRevision, options.sourceRevision);
  assert.match(proposal.configurationDigest, /^sha256:[a-f0-9]{64}$/);
});

test("proposal records independent history as evidence while retaining explicit release reviews", () => {
  const value = candidate();
  const proposal = createBuildProposal(value, history(value), options);
  assert.equal(proposal.identityHistoryReview.status, "REVIEW_EVIDENCE_RECORDED");
  assert.equal(proposal.status, "REVIEW_REQUIRED_NOT_A_RELEASE_PLAN");
  assert.ok(proposal.requiredReviews.some((item) => item.includes("not proof of completeness")));
  assert.ok(proposal.requiredReviews.some((item) => item.includes("never saves or overwrites")));
});

test("proposal rejects missing, malformed or secret-bearing schema-v2 input", () => {
  const value = candidate();
  assert.throws(() => createBuildProposal({}, undefined, options), /schemaVersion/);
  assert.throws(() => createBuildProposal({ ...value, restaurantId: "wrong" }, undefined, options), /UUID/);
  assert.throws(() => createBuildProposal({ ...value, serviceRoleKey: "synthetic" }, undefined, options), /unsupported field/);
  delete value.android.customer.splashPath;
  assert.throws(() => createBuildProposal(value, undefined, options), /splashPath/);
  assert.throws(() => createBuildProposal(candidate(), undefined, { ...options, sourceRevision: "short" }), /full Git/);
});

test("proposal rejects UUID, guest domain, application ID and Expo project conflicts", () => {
  for (const mutate of [
    (value) => { value.restaurantId = a.restaurantId; },
    (value) => { value.guestDomains.production = a.guestDomains.production; },
    (value) => { value.android.customer.productionApplicationId = a.android.operations.productionApplicationId; }
  ]) {
    const value = candidate();
    mutate(value);
    assert.throws(() => createBuildProposal(value, undefined, options), /duplicate/);
  }
  const existing = structuredClone(a);
  const value = candidate();
  const eas = { owner: "fixture-owner", projectId: "00000000-0000-4000-8000-000000000900" };
  existing.android.operations.eas = eas;
  value.android.customer.eas = eas;
  assert.throws(() => createBuildProposal(value, undefined, { ...options, configs: [existing, b] }), /duplicate EAS/);
});

test("proposal never renames existing registry UUIDs or reserved application IDs", () => {
  const existing = listRestaurantConfigs()[0];
  const value = structuredClone(existing);
  value.branding.primaryColor = "#A51D22";
  const result = createBuildProposal(value, undefined);
  assert.equal(result.existingRegistryFile, `configs/restaurants/${existing.slug}.json`);
  value.android.customer.productionApplicationId += ".renamed";
  assert.throws(() => createBuildProposal(value), /cannot change/);
  value.android.customer.productionApplicationId = existing.android.customer.productionApplicationId;
  value.restaurantId = candidate().restaurantId;
  assert.throws(() => createBuildProposal(value), /cannot change/);
});

test("history rejects foreign package reuse, changed bindings and omitted reserved identities", () => {
  const value = candidate();
  for (const mutate of [
    (review) => { review.applications.pop(); },
    (review) => { review.applications[0].restaurantId = b.restaurantId; },
    (review) => { review.applications[0].applicationId += ".renamed"; },
    (review) => { review.applications.push({ ...review.applications[0] }); },
    (review) => { review.applications[0].appKind = "other"; },
    (review) => { review.reviewedAt = "2026-02-30"; },
    (review) => { review.reviewedBy = ""; }
  ]) {
    const review = history(value);
    mutate(review);
    assert.throws(() => createBuildProposal(value, review, options), /identity history/);
  }
});

test("CLI emits a proposal without changing the input or active registry", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mobile-proposal-"));
  const file = path.join(directory, "candidate.json");
  const body = JSON.stringify(candidate());
  writeFileSync(file, body);
  const registryFile = path.join(__dirname, "..", "san-thaw-tar.json");
  const registryBefore = readFileSync(registryFile, "utf8");
  try {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, "../../../scripts/mobile-build.cjs"), "propose", file], {
      encoding: "utf8", windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "REVIEW_REQUIRED_NOT_A_RELEASE_PLAN");
    assert.equal(readFileSync(file, "utf8"), body);
    assert.equal(readFileSync(registryFile, "utf8"), registryBefore);
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
});
