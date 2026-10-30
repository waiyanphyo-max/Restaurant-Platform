"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const configure = require("../app.config.js");

function withEnvironment(values, callback) {
  const names = ["MOBILE_ENV", "RESTAURANT_SLUG", "PUBLIC_API_BASE_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("operations fixture export embeds a fixed restaurant and operations application ID", () => {
  withEnvironment({ MOBILE_ENV: "development", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "http://10.0.2.2:8080" }, () => {
    const result = configure({ config: { extra: { serviceRoleKey: "must-not-export" } } });
    assert.equal(result.android.package, "dev.restaurantplatform.starter.operations.staging.dev");
    assert.equal(result.extra.tenant.restaurantId, "00000000-0000-4000-8000-000000000001");
    assert.equal(result.extra.appKind, "operations");
    assert.equal(result.extra.serviceRoleKey, undefined);
  });
});

test("operations production config fails closed without a real tenant file", () => {
  withEnvironment({ MOBILE_ENV: "production", RESTAURANT_SLUG: "starter-fixture", PUBLIC_API_BASE_URL: "https://api.example.test" }, () => {
    assert.throws(() => configure({ config: {} }), /no real restaurant config/);
  });
});
