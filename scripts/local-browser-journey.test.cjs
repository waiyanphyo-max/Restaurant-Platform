"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { URLSearchParams } = globalThis;
const { requireLocalAuth, guestUrl, permittedBrowserUrl, connectCdp, removeOwnedProfile, runBrowserJourney, runAdminProvisioning, provisioningFields } = require("./local-browser-journey.cjs");

const tenant = { id: "11111111-1111-4111-8111-111111111111", slug: "synthetic-a", host: "synthetic-a.localhost" };
const manifest = { adminOrigin: "http://127.0.0.1:3001", guestOrigin: "http://127.0.0.1:3000", apiOrigin: "http://127.0.0.1:8080",
  tenants: [tenant, { id: "22222222-2222-4222-8222-222222222222", slug: "synthetic-b", host: "synthetic-b.localhost" }] };

test("browser entry points reject hosted Auth and keep QR capability exclusively in the fragment", () => {
  for (const value of ["https://project.supabase.co", "http://user:secret@localhost:54321", "http://localhost:54321/path", "http://localhost:54321#secret"]) {
    assert.throws(() => requireLocalAuth(value), /LOCAL_AUTH_ORIGIN_REQUIRED/);
  }
  assert.equal(requireLocalAuth("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
  const common = new URL(guestUrl(manifest, tenant, { restaurantId: tenant.id, kind: "COMMON_QR", qrToken: "private-token/&?" }));
  assert.equal(common.hostname, tenant.host); assert.equal(common.pathname, "/");
  assert.equal(common.searchParams.get("view"), "customer-pickup");
  assert.equal(common.search.includes("private-token"), false);
  assert.equal(new URLSearchParams(common.hash.slice(1)).get("qrToken"), "private-token/&?");
  const table = new URL(guestUrl(manifest, tenant, { restaurantId: tenant.id, kind: "TABLE_QR", qrToken: "private" }));
  assert.equal(table.pathname, "/workspace"); assert.equal(table.searchParams.get("view"), "table-order");
  assert.throws(() => guestUrl(manifest, tenant, { restaurantId: manifest.tenants[1].id, kind: "COMMON_QR", qrToken: "private" }));
});

test("browser request policy permits only the exact reviewed local origins", () => {
  const origins = new Set(["http://synthetic-a.localhost:3000", "http://127.0.0.1:54321"]);
  assert.equal(permittedBrowserUrl("http://synthetic-a.localhost:3000/menu", origins), true);
  for (const value of ["https://project.supabase.co/auth/v1", "http://synthetic-a.localhost.evil.test:3000", "http://127.0.0.1:8080", "file:///C:/private"]) {
    assert.equal(permittedBrowserUrl(value, origins), false);
  }
});

class FakeSocket {
  static instance;
  constructor() { this.events = new Map(); this.sent = []; FakeSocket.instance = this; globalThis.queueMicrotask(() => this.emit("open", {})); }
  addEventListener(name, handler) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(handler); }
  emit(name, event) { for (const handler of this.events.get(name) ?? []) handler(event); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.emit("close", {}); }
}

test("CDP correlates concurrent replies and session events without exposing protocol errors", async () => {
  const cdp = await connectCdp("ws://127.0.0.1:12345", { WebSocketImpl: FakeSocket, timeoutMs: 1000 });
  const socket = FakeSocket.instance;
  const first = cdp.send("Page.enable", {}, "own-session");
  const second = cdp.send("Runtime.evaluate", { expression: "private-secret" }, "own-session");
  socket.emit("message", { data: JSON.stringify({ id: socket.sent[1].id, error: { message: "private-secret" } }) });
  socket.emit("message", { data: JSON.stringify({ id: socket.sent[0].id, result: { safe: true } }) });
  await assert.rejects(second, error => error.message === "BROWSER_COMMAND_FAILED" && !error.message.includes("private-secret"));
  assert.deepEqual(await first, { safe: true });
  let observed;
  const off = cdp.on("Page.loadEventFired", (_params, session) => { observed = session; });
  socket.emit("message", { data: JSON.stringify({ method: "Page.loadEventFired", sessionId: "own-session" }) });
  assert.equal(observed, "own-session"); off(); cdp.close();
});

test("CDP rejects outstanding requests when its owned socket closes", async () => {
  const cdp = await connectCdp("ws://127.0.0.1:12345", { WebSocketImpl: FakeSocket });
  const pending = cdp.send("Runtime.evaluate", { expression: "private-secret" });
  cdp.close();
  await assert.rejects(pending, /BROWSER_CONNECTION_CLOSED/);
});

test("profile removal requires the exact task-owned path and ownership marker", t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "uxi13b-browser-test-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(workspace)), path.resolve(os.tmpdir()));
    assert.match(path.basename(workspace), /^uxi13b-browser-test-/);
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  const profile = fs.mkdtempSync(path.join(workspace, "browser-"));
  fs.writeFileSync(path.join(profile, "uxi13b-owner"), "owned");
  fs.writeFileSync(path.join(profile, "private-browser-data"), "private-secret");
  assert.throws(() => removeOwnedProfile(profile, workspace, "wrong-owner"), /OWNERSHIP_MISMATCH/);
  assert.equal(fs.existsSync(profile), true);
  removeOwnedProfile(profile, workspace, "owned");
  assert.equal(fs.existsSync(profile), false);
});

test("browser journey rejects non-synthetic identities before launching Chrome", async () => {
  await assert.rejects(runBrowserJourney({ manifest, adminIdentity: { email: "real@customer.com", password: "private" }, authOrigin: "http://127.0.0.1:54321" }), /SYNTHETIC_LOCAL_IDENTITY_REQUIRED/);
  await assert.rejects(runBrowserJourney({ manifest, privateFixtures: [{ restaurantId: tenant.id, kind: "OTHER", qrToken: "private" }], authOrigin: "http://127.0.0.1:54321" }), /INVALID_PRIVATE_FIXTURE/);
});

function provisioning() {
  return { ownerEmail: "uxi13b-owner@example.test", ownerUserId: tenant.id,
    restaurant: { name: "UXI-13B synthetic", slug: "uxi13b-synthetic-a", city: "Yangon", township: "Tamwe", currency: "MMK", timezone: "Asia/Yangon" } };
}

test("UI provisioning requires an exact synthetic existing Owner, so invite-only requests never launch", async () => {
  for (const request of [{ ...provisioning(), ownerUserId: null }, { ...provisioning(), ownerEmail: "real@example.com" },
    { ...provisioning(), restaurant: { ...provisioning().restaurant, slug: "real-restaurant" } }]) {
    assert.throws(() => provisioningFields(request), /EXACT_SYNTHETIC_OWNER_AND_RESTAURANT_REQUIRED/);
    await assert.rejects(runAdminProvisioning({ manifest, authOrigin: "http://127.0.0.1:54321",
      adminIdentity: { email: "uxi13b-admin@example.test", password: "private-password-sentinel" }, request }), /EXACT_SYNTHETIC_OWNER_AND_RESTAURANT_REQUIRED/);
  }
});

test("UI provisioning allowlists form fields and rejects invalid timezone before launch", () => {
  const request = provisioning();
  const fields = provisioningFields({ ...request, privateSentinel: "private-secret", restaurant: { ...request.restaurant, apiOrigin: "https://hosted.example.com" } });
  assert.deepEqual(fields, { ...request.restaurant, ownerEmail: request.ownerEmail, ownerUserId: request.ownerUserId });
  assert.equal(JSON.stringify(fields).includes("private-secret"), false);
  assert.equal(JSON.stringify(fields).includes("hosted.example.com"), false);
  assert.throws(() => provisioningFields({ ...request, restaurant: { ...request.restaurant, timezone: "invalid/timezone" } }), /SYNTHETIC_RESTAURANT_TIMEZONE_REQUIRED/);
});
