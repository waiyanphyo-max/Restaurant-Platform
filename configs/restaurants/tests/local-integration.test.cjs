"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { listRestaurantConfigs, getMobileBuildConfig } = require("../index.cjs");

function registry() {
  return { schemaVersion: 1, purpose: "UXI-13B disposable local integration", tenants: ["a", "b"].map((label, index) => {
    const app = kind => ({ displayName: `Local ${label} ${kind}`, stagingApplicationId: `dev.uxi13b.${label}.${kind}.staging`, productionApplicationId: `dev.uxi13b.${label}.${kind}` });
    return { schemaVersion: 1, fixture: true, slug: `uxi13b-${label}`, restaurantId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      branding: { displayName: `Local ${label}`, primaryColor: "#234D3C" },
      guestDomains: { staging: [`uxi13b-${label}.localhost`], production: [`uxi13b-${label}.invalid`] },
      android: { operations: app("operations"), customer: app("customer") } };
  }) };
}

function withRegistry(operation) {
  const root = path.resolve(__dirname, "../../../.local-integration");
  const createdRoot = !fs.existsSync(root);
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "registry-test-"));
  const filename = path.join(directory, "registry.json");
  const original = Object.fromEntries(["NODE_ENV", "GUEST_LOCAL_ROUTING", "GUEST_CONFIG_ENV", "GUEST_LOCAL_INTEGRATION_REGISTRY"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "development", GUEST_LOCAL_ROUTING: "true", GUEST_CONFIG_ENV: "staging", GUEST_LOCAL_INTEGRATION_REGISTRY: filename });
  const save = input => fs.writeFileSync(filename, JSON.stringify(input));
  save(registry());
  try { operation({ filename, save }); }
  finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.unlinkSync(filename); fs.rmdirSync(directory);
    if (createdRoot && fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  }
}

test("disposable Guest registry reuses UUID/domain validation without entering Android selection", () => withRegistry(() => {
  const configs = listRestaurantConfigs();
  assert.deepEqual(configs.map(item => item.slug), ["uxi13b-a", "uxi13b-b"]);
  assert.ok(configs.every(item => item.fixture));
  assert.throws(() => getMobileBuildConfig("operations", { MOBILE_ENV: "development", RESTAURANT_SLUG: "uxi13b-a", PUBLIC_API_BASE_URL: "http://localhost:8080" }), /no real restaurant config/);
}));

test("local registry override fails closed under production, absent local flags or unmarked records", () => withRegistry(({ save }) => {
  for (const key of ["NODE_ENV", "GUEST_LOCAL_ROUTING", "GUEST_CONFIG_ENV"]) {
    const before = process.env[key]; process.env[key] = "production";
    assert.throws(() => listRestaurantConfigs(), /requires development local Guest routing/);
    process.env[key] = before;
  }
  const unmarked = registry(); delete unmarked.purpose; save(unmarked);
  assert.throws(() => listRestaurantConfigs(), /disposable marker/);
  const hosted = registry(); hosted.tenants[0].guestDomains.staging = ["owner.example.com"]; save(hosted);
  assert.throws(() => listRestaurantConfigs(), /exact localhost and invalid/);
  const duplicate = registry(); duplicate.tenants[1].restaurantId = duplicate.tenants[0].restaurantId; save(duplicate);
  assert.throws(() => listRestaurantConfigs(), /duplicate restaurant UUID/);
}));

test("local registry cannot read a file outside the task directory", () => withRegistry(() => {
  process.env.GUEST_LOCAL_INTEGRATION_REGISTRY = path.resolve(__dirname, "../fixtures/starter.json");
  assert.throws(() => listRestaurantConfigs(), /within .local-integration/);
}));
