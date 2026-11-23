"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertStatus, privateJson, migrationInventory, serverEnvironment, webEnvironment, PROJECT } = require("./local-stack.cjs");

const status = { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:local-only@127.0.0.1:54322/postgres",
  PUBLISHABLE_KEY: "sb_publishable_fixture", SERVICE_ROLE_KEY: "private-server-key" };
test("invalid CLI or private state JSON cannot expose its credential-bearing parse input", () => {
  assert.throws(() => privateJson('{"key":"sb_secret_synthetic-private-value" trailing}'), error =>
    error.message.includes("Local private JSON is invalid") && !error.message.includes("sb_secret_") && !error.message.includes("synthetic-private-value"));
});
test("disposable endpoint validation refuses hosted, redirected and ambiguous database targets", () => {
  assert.equal(assertStatus(status), status);
  for (const API_URL of ["https://hosted.supabase.co", "http://127.0.0.1:54321/path", "http://user@127.0.0.1:54321", "http://localhost:54321"]) {
    assert.throws(() => assertStatus({ ...status, API_URL }));
  }
  for (const DB_URL of ["postgresql://db.supabase.co:54322/postgres", "postgresql://127.0.0.1:54322/existing", "postgresql://127.0.0.1:5432/postgres", "postgresql://127.0.0.1:54322/postgres?host=hosted"]) {
    assert.throws(() => assertStatus({ ...status, DB_URL }));
  }
});
test("Next process environments exclude privileged inherited and generated credentials", () => {
  const key = "SUPABASE_SERVICE_ROLE_KEY";
  const before = process.env[key];
  process.env[key] = "inherited-secret";
  try {
    const env = webEnvironment(status);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "sb_publishable_fixture");
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, status.API_URL);
    assert.equal(JSON.stringify(env).includes("inherited-secret"), false);
    assert.equal(JSON.stringify(env).includes("private-server-key"), false);
    assert.equal(Object.keys(env).some(name => /PASSWORD|SERVICE_ROLE|SECRET_KEY|JWT/.test(name)), false);
  } finally { if (before === undefined) delete process.env[key]; else process.env[key] = before; }
});
test("Spring uses real local Auth issuer/JWKS and trusted non-superuser role without changing production defaults", () => {
  const before = process.env.SPRING_DATASOURCE_URL;
  process.env.SPRING_DATASOURCE_URL = "jdbc:postgresql://hosted.invalid/real";
  let env;
  try { env = serverEnvironment(status, { password: "generated-password" }, "00000000-0000-4000-8000-000000000001", "persisted-local-key"); }
  finally { if (before === undefined) delete process.env.SPRING_DATASOURCE_URL; else process.env.SPRING_DATASOURCE_URL = before; }
  assert.equal(env.SUPABASE_AUTH_ISSUER, "http://127.0.0.1:54321/auth/v1");
  assert.equal(env.SUPABASE_JWKS_URL, "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json");
  assert.equal(env.SUPABASE_DB_USERNAME, "uxi13b_server");
  assert.equal(env.SPRING_DATASOURCE_URL, undefined);
  assert.equal(env.APP_IDEMPOTENCY_ENCRYPTION_KEY, "persisted-local-key");
  assert.equal(env.SUPABASE_ALLOW_LOCAL_IDENTITY_LOOKUP, "true");
  assert.equal(env.SUPABASE_INVITE_REDIRECT_URL, "");
  assert.equal(PROJECT, "restaurant-platform-uxi13b");
});
test("CLI source inventory remains all 35 exact ordered migrations", () => {
  const entries = migrationInventory();
  assert.equal(entries.length, 35);
  assert.equal(new Set(entries.map(entry => entry.name)).size, 35);
  assert.deepEqual(entries.map(entry => entry.name), entries.map(entry => entry.name).sort());
  assert.ok(entries.every(entry => /^[0-9a-f]{64}$/.test(entry.sha256)));
});
