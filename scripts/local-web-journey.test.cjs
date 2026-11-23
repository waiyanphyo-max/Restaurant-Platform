"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { Headers } = globalThis;
const { validateManifest, cookieJar, createAuthCookieJar, postGuest, discardGuestResponse, runWebJourney } = require("./local-web-journey.cjs");

function tenants() {
  return [1, 2].map(index => ({ id: `00000000-0000-4000-8000-00000000000${index}`,
    slug: `uxi13b-${index}`, host: `uxi13b-${index}.localhost`,
    productId: `10000000-0000-4000-8000-00000000000${index}` }));
}
function manifest(origin = "http://127.0.0.1:39999") {
  return { apiOrigin: origin, adminOrigin: origin, guestOrigin: origin, tenants: tenants() };
}

test("local HTTP runner refuses hosted origins, credential URLs and ambiguous tenant bindings", () => {
  for (const apiOrigin of ["https://project.supabase.co", "http://192.168.1.5:8080", "http://user:private@localhost:8080", "http://localhost:8080/path"]) {
    assert.throws(() => validateManifest({ ...manifest(), apiOrigin }), /INVALID_LOCAL_ORIGIN/);
  }
  const duplicate = manifest(); duplicate.tenants[1].id = duplicate.tenants[0].id;
  assert.throws(() => validateManifest(duplicate), /DISTINCT_TENANTS/);
  const hosted = manifest(); hosted.tenants[0].host = "real-restaurant.example.com";
  assert.throws(() => validateManifest(hosted), /INVALID_SYNTHETIC_TENANT/);
});

test("Auth cookie jar keeps refreshed/chunked cookies in memory and applies expiry", () => {
  const jar = cookieJar();
  jar.setAll([{ name: "sb-test-auth-token.0", value: "private-first" }, { name: "sb-test-auth-token.1", value: "private-second" }]);
  assert.match(jar.header(), /sb-test-auth-token\.0=private-first; sb-test-auth-token\.1=private-second/);
  const headers = new Headers();
  headers.append("set-cookie", "sb-test-auth-token.0=refreshed; Path=/; SameSite=Lax");
  headers.append("set-cookie", "sb-test-auth-token.1=; Max-Age=0; Path=/");
  jar.ingest(headers);
  assert.equal(jar.header(), "sb-test-auth-token.0=refreshed");
});

test("Auth cookie setup cannot contact a hosted provider or accept a server credential", async () => {
  await assert.rejects(createAuthCookieJar({ url: "https://project.supabase.co" }), /INVALID_LOCAL_ORIGIN/);
  await assert.rejects(createAuthCookieJar({ url: "http://127.0.0.1:54321", publishableKey: "sb_secret_do_not_accept" }), /LOCAL_AUTH_SESSION_REQUIRED/);
});

// This server is an explicitly labelled unit fixture for the runner's assertions.
// The executable runner itself never starts or falls back to a fixture server.
async function assertionFixture(operation, { foreignCatalog = false, leak = "" } = {}) {
  const recorded = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk.toString();
    recorded.push({ path: req.url, host: req.headers.host, cookie: req.headers.cookie, authorization: req.headers.authorization, body: raw });
    res.setHeader("cache-control", "private, no-store");
    if (req.url === "/settings") { res.statusCode = 307; res.setHeader("location", "/login"); res.end(); return; }
    if (req.url === "/login") { res.end("Sign in to your administration workspace."); return; }
    const tenant = tenants().find(item => req.headers.host.startsWith(item.host + ":"));
    const apiTenant = tenants().find(item => req.url === `/api/v1/public/restaurants/${item.id}/menu`);
    if (apiTenant) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ restaurantId: apiTenant.id, categories: [{ products: [{ id: apiTenant.productId }] }] })); return; }
    if (req.url === "/api/guest" && tenant) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: { restaurantId: tenant.id, trackingToken: leak } })); return;
    }
    if (req.url === "/menu" && tenant) {
      res.end(`<main id="menu-dishes"><a href="/menu/${foreignCatalog ? tenants()[1].productId : tenant.productId}">Product</a></main>`); return;
    }
    // Correct Next notFound responses may still serialize the requested route ID.
    res.statusCode = 404; res.end(`Unavailable route ${req.url}`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await operation(manifest(`http://127.0.0.1:${server.address().port}`), recorded); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("runner retains exact missing Auth/browser boundaries and never emits private BFF payloads", async () => {
  const privateToken = "synthetic-private-qr-capability";
  await assertionFixture(async (input, recorded) => {
    const report = await runWebJourney(input, { guestChecks: [{ tenantId: input.tenants[0].id,
      body: { action: "validate", kind: "COMMON_QR", qrToken: privateToken },
      expected: { status: 200, ok: true, restaurantId: input.tenants[0].id } }] });
    assert.equal(report.status, "BLOCKED", JSON.stringify(report));
    assert.equal(report.acceptanceClass, "real-next-http");
    assert.equal(report.browser, "NOT RUN");
    assert.ok(report.checks.filter(item => item.status === "PASS").length >= 10);
    assert.ok(report.checks.some(item => item.name === "admin-authenticated-session-and-details" && item.status === "BLOCKED"));
    assert.equal(JSON.stringify(report).includes(privateToken), false);
    assert.ok(recorded.some(item => item.path === "/api/guest" && item.body.includes(privateToken)));
    assert.ok(recorded.every(item => !item.path.includes(privateToken) && !item.cookie && !item.authorization));
    const raw = await postGuest(input, input.tenants[0].id, { action: "status", ticketId: input.tenants[0].id, queueToken: privateToken });
    assert.equal(raw.data.data.trackingToken, privateToken);
  }, { leak: privateToken });
});

test("runner fails when actual Guest HTML contains the other shared product identity", async () => {
  await assertionFixture(async input => {
    const report = await runWebJourney(input);
    assert.equal(report.status, "FAIL");
    assert.equal(report.checks.find(item => item.name === "guest-tenant-1-real-menu").status, "FAIL");
    assert.equal(JSON.stringify(report).includes(input.tenants[1].productId), false);
  }, { foreignCatalog: true });
});

test("losing committed HTTP headers' body preserves one order across exact checkout retries", { timeout: 5000 }, async () => {
  const submitted = [], receipts = new Map();
  const orderId = "20000000-0000-4000-8000-000000000001";
  let originalClosed;
  const closed = new Promise(resolve => { originalClosed = resolve; });
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk.toString();
    const body = JSON.parse(raw); submitted.push(body);
    if (!receipts.has(body.idempotencyKey)) receipts.set(body.idempotencyKey, { orderId, trackingToken: "private-recovered-capability" });
    res.setHeader("content-type", "application/json");
    if (submitted.length === 1) {
      // Commit before response headers, then hold all body bytes. A correct
      // discard must close this response without ever receiving a receipt.
      res.on("close", originalClosed);
      res.flushHeaders();
      return;
    }
    res.end(JSON.stringify({ ok: true, data: receipts.get(body.idempotencyKey) }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const input = manifest(`http://127.0.0.1:${server.address().port}`);
    const payload = { action: "checkout", kind: "COMMON_QR", qrToken: "private-qr", items: [{ productId: input.tenants[0].productId, quantity: 1 }], idempotencyKey: "original-exact-key" };
    const discarded = await discardGuestResponse(input, input.tenants[0].id, payload, { timeoutMs: 1000 });
    assert.deepEqual(discarded, { status: 200, bodyDiscarded: true });
    await closed;
    const recovered = await postGuest(input, input.tenants[0].id, payload);
    const replay = await postGuest(input, input.tenants[0].id, payload);
    assert.equal(recovered.data.data.orderId, orderId);
    assert.deepEqual(recovered.data, replay.data);
    assert.equal(submitted.length, 3);
    assert.equal(receipts.size, 1);
    assert.deepEqual(submitted, [payload, payload, payload]);
    assert.equal(JSON.stringify(discarded).includes("private-recovered-capability"), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
