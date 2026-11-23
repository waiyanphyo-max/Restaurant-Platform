"use strict";

// HTTP evidence for the real Next entry points. This does not drive a browser,
// submit React server actions, manufacture Auth identities, or start a fixture API.
const { readFileSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { Buffer } = require("node:buffer");
const { randomUUID } = require("node:crypto");
const { Headers } = globalThis;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireLocalOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("INVALID_LOCAL_ORIGIN"); }
  if (!["http:", "https:"].includes(url.protocol)
      || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || value !== value.trim()) throw new Error("INVALID_LOCAL_ORIGIN");
  return url.origin;
}

function validateManifest(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.tenants) || input.tenants.length !== 2) {
    throw new Error("TWO_SYNTHETIC_TENANTS_REQUIRED");
  }
  const manifest = {
    apiOrigin: requireLocalOrigin(input.apiOrigin),
    adminOrigin: requireLocalOrigin(input.adminOrigin),
    guestOrigin: requireLocalOrigin(input.guestOrigin),
    tenants: input.tenants.map(tenant => {
      // Connect to guestOrigin and send a reviewed localhost Host. DNS/hosts-file
      // changes are unnecessary; Host remains the app's tenant authority.
      if (!tenant || !UUID.test(tenant.id) || !SLUG.test(tenant.slug)
          || tenant.host !== `${tenant.slug}.localhost`
          || (tenant.productId !== undefined && !UUID.test(tenant.productId))
          || (tenant.categoryId !== undefined && !UUID.test(tenant.categoryId))) {
        throw new Error("INVALID_SYNTHETIC_TENANT");
      }
      return { id: tenant.id.toLowerCase(), slug: tenant.slug, host: tenant.host,
        productId: tenant.productId?.toLowerCase(), categoryId: tenant.categoryId?.toLowerCase(),
        ...(typeof tenant.productName === "string" && tenant.productName.length > 0 ? { productName: tenant.productName } : {}) };
    }),
  };
  for (const key of ["id", "slug", "host"]) {
    if (new Set(manifest.tenants.map(tenant => tenant[key])).size !== 2) throw new Error("DISTINCT_TENANTS_REQUIRED");
  }
  return manifest;
}

function cookieJar(initial = []) {
  const values = new Map(initial.map(cookie => [cookie.name, cookie.value]));
  return {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll: cookies => cookies.forEach(cookie => cookie.options?.maxAge === 0
      ? values.delete(cookie.name) : values.set(cookie.name, cookie.value)),
    header: () => [...values].map(([name, value]) => `${name}=${value}`).join("; "),
    ingest(headers) {
      for (const line of headers.getSetCookie?.() ?? []) {
        const pair = line.split(";", 1)[0];
        const split = pair.indexOf("=");
        if (split < 1) continue;
        const name = pair.slice(0, split), value = pair.slice(split + 1);
        if (/;\s*max-age=0(?:;|$)/i.test(line)) values.delete(name);
        else values.set(name, value);
      }
    },
  };
}

/** Real SDK session validation; credentials and resulting cookies stay in memory. */
async function createAuthCookieJar({ url, publishableKey, session, expectedUserId }) {
  const authOrigin = requireLocalOrigin(url);
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? "")
      || !session?.access_token || !session?.refresh_token || !UUID.test(expectedUserId ?? "")) {
    throw new Error("LOCAL_AUTH_SESSION_REQUIRED");
  }
  const jar = cookieJar();
  const { createServerClient } = require("@supabase/ssr");
  const client = createServerClient(authOrigin, publishableKey, {
    cookieOptions: { path: "/", sameSite: "lax", secure: false }, cookies: jar,
  });
  const restored = await client.auth.setSession(session);
  const claims = await client.auth.getClaims();
  if (restored.error || restored.data.user?.id !== expectedUserId
      || claims.error || claims.data?.claims?.sub !== expectedUserId || !jar.header()) {
    throw new Error("LOCAL_AUTH_SESSION_REJECTED");
  }
  return jar;
}

function guestHeaders(manifest, tenant) {
  const origin = new URL(manifest.guestOrigin);
  const host = `${tenant.host}${origin.port ? `:${origin.port}` : ""}`;
  return { Host: host, Origin: `${origin.protocol}//${host}` };
}

function request(origin, pathname, { headers = {}, body, timeoutMs = 20000, discardSuccessfulBody = false } = {}) {
  const url = new URL(pathname, origin);
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  // Node's built-in fetch silently replaces a supplied Host header. Native HTTP
  // preserves the exact synthetic tenant host while connecting only to loopback.
  return new Promise((resolve, reject) => {
    const pending = (url.protocol === "https:" ? https : http).request(url, {
      method: encoded === undefined ? "GET" : "POST", headers: { ...headers,
        ...(encoded === undefined ? {} : { "Content-Length": Buffer.byteLength(encoded) }) },
    }, response => {
      const receivedHeaders = () => {
        const received = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          received.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
        }
        return received;
      };
      if (discardSuccessfulBody && response.statusCode >= 200 && response.statusCode < 300) {
        // A successful checkout's headers follow the committed upstream result.
        // Deliberately attach no data listener and parse no receipt. Destroy the
        // incoming response immediately, modelling a response lost to its caller.
        const result = { status: response.statusCode, headers: receivedHeaders(), bodyDiscarded: true };
        response.destroy();
        resolve(result);
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) pending.destroy(new Error("HTTP_RESPONSE_TOO_LARGE"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        resolve({ status: response.statusCode, headers: receivedHeaders(), text: Buffer.concat(chunks).toString("utf8") });
      });
    });
    pending.on("error", reject);
    pending.setTimeout(timeoutMs, () => pending.destroy(new Error("HTTP_REQUEST_TIMEOUT")));
    if (encoded !== undefined) pending.write(encoded);
    pending.end();
  });
}

/** Returns private response data to the caller only; never include it in evidence. */
async function postGuest(input, tenantId, body, options = {}) {
  const manifest = validateManifest(input);
  const tenant = manifest.tenants.find(item => item.id === tenantId);
  if (!tenant) throw new Error("UNKNOWN_SYNTHETIC_TENANT");
  const response = await request(manifest.guestOrigin, "/api/guest", {
    ...options, body, headers: { ...guestHeaders(manifest, tenant), "Content-Type": "application/json" },
  });
  let data;
  try { data = JSON.parse(response.text); } catch { throw new Error("INVALID_GUEST_RESPONSE"); }
  return { status: response.status, headers: response.headers, data };
}

/** Lose the original committed checkout response before any receipt is read.
 * The caller must retain and replay this exact body/key; nothing is auto-rekeyed.
 */
async function discardGuestResponse(input, tenantId, body, options = {}) {
  const manifest = validateManifest(input);
  const tenant = manifest.tenants.find(item => item.id === tenantId);
  expect(Boolean(tenant), "UNKNOWN_SYNTHETIC_TENANT");
  expect(body?.action === "checkout" && /^[A-Za-z0-9._:-]{8,128}$/.test(body.idempotencyKey ?? ""), "RECOVERABLE_CHECKOUT_REQUIRED");
  const response = await request(manifest.guestOrigin, "/api/guest", {
    ...options, body, discardSuccessfulBody: true,
    headers: { ...guestHeaders(manifest, tenant), "Content-Type": "application/json" },
  });
  expect(response.status === 200 && response.bodyDiscarded === true, "COMMITTED_CHECKOUT_RESPONSE_NOT_DISCARDED");
  return { status: response.status, bodyDiscarded: true };
}

function expect(condition, code) {
  if (!condition) { const error = new Error(code); error.journeyCode = code; throw error; }
}
function privateResponse(response) {
  expect(/no-store/i.test(response.headers.get("cache-control") ?? ""), "PRIVATE_CACHE_HEADERS_MISSING");
}
function deniedGuest(response, tenants) {
  expect(response.status === 404 || (response.status === 200 && /noindex/i.test(response.text)), "GUEST_DENIAL_MISSING");
  expect(response.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404|This page isn’t available|Restaurant site unavailable/.test(response.text), "GUEST_NOT_FOUND_STATE_MISSING");
  for (const tenant of tenants) {
    // Flight serializes route parameters, including the deliberately foreign UUID
    // supplied by this test. Check catalog content, not that public request hint.
    if (tenant.productName) expect(!response.text.includes(tenant.productName), "FOREIGN_CATALOG_RENDERED");
    if (tenant.productId) expect(!response.text.includes(`href="/menu/${tenant.productId}"`), "FOREIGN_CATALOG_RENDERED");
  }
}

/**
 * manifest: {apiOrigin, adminOrigin, guestOrigin, tenants:[{id,slug,host,productId?,categoryId?}]}.
 * options.publicAuth: {url,publishableKey,session:{access_token,refresh_token},expectedUserId}.
 * options.guestChecks optionally sends caller-reviewed synthetic QR requests through
 * the existing BFF. The caller retains all QR capabilities and raw receipts in memory.
 */
async function runWebJourney(input, options = {}) {
  const manifest = validateManifest(input);
  const checks = [];
  const timeoutMs = options.timeoutMs ?? 20000;
  const check = async (name, operation) => {
    try {
      await operation(); checks.push({ name, status: "PASS" });
    } catch (error) {
      // Network errors, upstream bodies and SDK exceptions may contain secrets.
      checks.push({ name, status: "FAIL", code: error.journeyCode ?? "LOCAL_HTTP_BOUNDARY_FAILED",
        detail: "The expected HTTP boundary did not pass; inspect the local service without logging credentials." });
    }
  };
  await check("admin-signed-out-route-protection", async () => {
    const response = await request(manifest.adminOrigin, "/settings", { timeoutMs });
    expect([303, 307, 308].includes(response.status), "ADMIN_REDIRECT_MISSING");
    expect(new URL(response.headers.get("location"), manifest.adminOrigin).pathname === "/login", "ADMIN_LOGIN_REDIRECT_MISSING");
    privateResponse(response);
  });
  await check("admin-login-entrypoint", async () => {
    const response = await request(manifest.adminOrigin, "/login", { timeoutMs });
    expect(response.status === 200 && response.text.includes("Sign in"), "ADMIN_LOGIN_MISSING");
    expect(!response.text.includes("Sign-in needs configuration"), "ADMIN_AUTH_CONFIGURATION_MISSING");
    privateResponse(response);
  });
  let jar;
  if (options.publicAuth) {
    await check("local-auth-sdk-session-validation", async () => { jar = await createAuthCookieJar(options.publicAuth); });
  } else {
    checks.push({ name: "local-auth-sdk-session-validation", status: "BLOCKED", detail: "A real local Auth session was not supplied." });
  }
  if (jar) {
    for (const iteration of [1, 2]) await check(`admin-session-restoration-${iteration}`, async () => {
      const response = await request(manifest.adminOrigin, "/settings", { timeoutMs, headers: { Cookie: jar.header() } });
      jar.ingest(response.headers);
      expect(response.status === 200 && response.text.includes(options.publicAuth.expectedUserId), "ADMIN_VERIFIED_IDENTITY_MISSING");
      expect(!response.text.includes('content="0;url=/login') && !response.text.includes('content="0;url=/access'), "ADMIN_ACCESS_DENIED");
      privateResponse(response);
      expect(!response.text.includes(options.publicAuth.session.access_token)
        && !response.text.includes(options.publicAuth.session.refresh_token), "ADMIN_TOKEN_SERIALIZED");
    });
    for (const [index, tenant] of manifest.tenants.entries()) await check(`admin-tenant-${index + 1}-detail`, async () => {
      const response = await request(manifest.adminOrigin, `/restaurant-details?id=${tenant.id}`, { timeoutMs, headers: { Cookie: jar.header() } });
      jar.ingest(response.headers);
      expect(response.status === 200 && response.text.includes(tenant.id) && response.text.includes("Restaurant profile"), "ADMIN_TENANT_DETAIL_MISSING");
      privateResponse(response);
    });
  } else {
    checks.push({ name: "admin-authenticated-session-and-details", status: "BLOCKED", detail: "Real local Auth plus the backend Platform Admin UUID allowlist are required." });
  }
  for (const [index, tenant] of manifest.tenants.entries()) {
    const other = manifest.tenants.find(item => item.id !== tenant.id);
    await check(`spring-tenant-${index + 1}-public-catalog`, async () => {
      const response = await request(manifest.apiOrigin, `/api/v1/public/restaurants/${tenant.id}/menu`, { timeoutMs });
      const menu = JSON.parse(response.text);
      expect(response.status === 200 && menu.restaurantId === tenant.id && Array.isArray(menu.categories), "SPRING_CATALOG_MISMATCH");
      if (tenant.productId) expect(menu.categories.some(category => category.products?.some(product => product.id === tenant.productId)), "SHARED_PRODUCT_MISSING");
    });
    await check(`guest-tenant-${index + 1}-real-menu`, async () => {
      const response = await request(manifest.guestOrigin, "/menu", { timeoutMs, headers: guestHeaders(manifest, tenant) });
      expect(response.status === 200 && response.text.includes("menu-dishes"), "GUEST_MENU_MISSING");
      if (tenant.productId) expect(response.text.includes(`/menu/${tenant.productId}`), "SHARED_PRODUCT_NOT_RENDERED");
      if (other.productId) expect(!response.text.includes(other.productId), "FOREIGN_PRODUCT_RENDERED");
      privateResponse(response);
    });
    await check(`guest-tenant-${index + 1}-foreign-query-denial`, async () => {
      const response = await request(manifest.guestOrigin, `/menu?restaurantId=${other.id}`, { timeoutMs, headers: guestHeaders(manifest, tenant) });
      deniedGuest(response, manifest.tenants);
    });
    if (other.productId) await check(`guest-tenant-${index + 1}-foreign-product-denial`, async () => {
      const response = await request(manifest.guestOrigin, `/menu/${other.productId}`, { timeoutMs, headers: guestHeaders(manifest, tenant) });
      deniedGuest(response, manifest.tenants.filter(item => item.id === other.id));
    });
  }
  await check("guest-unknown-host-denial", async () => {
    const response = await request(manifest.guestOrigin, "/menu", { timeoutMs, headers: { Host: "uxi13b-unconfigured.invalid" } });
    deniedGuest(response, manifest.tenants);
  });
  for (const [index, item] of (options.guestChecks ?? []).entries()) await check(`guest-bff-reviewed-request-${index + 1}`, async () => {
    const response = await postGuest(manifest, item.tenantId, item.body, { timeoutMs });
    expect(response.status === (item.expected?.status ?? 200), "GUEST_HTTP_STATUS_MISMATCH");
    privateResponse(response);
    for (const key of ["ok", "error"]) if (item.expected?.[key] !== undefined) {
      expect(response.data[key] === item.expected[key], "GUEST_RESULT_MISMATCH");
    }
    for (const key of ["restaurantId", "orderId", "totalAmount", "kind", "tableId", "queueStatus"]) if (item.expected?.[key] !== undefined) {
      expect(response.data.data?.[key] === item.expected[key], "GUEST_RECEIPT_MISMATCH");
    }
  });
  for (const [index, fixture] of (options.privateFixtures ?? []).entries()) await check(`guest-bff-shared-qr-journey-${index + 1}`, async () => {
    expect(["COMMON_QR", "TABLE_QR"].includes(fixture.kind), "INVALID_PRIVATE_FIXTURE_KIND");
    const tenant = manifest.tenants.find(item => item.id === fixture.restaurantId);
    expect(Boolean(tenant), "UNKNOWN_PRIVATE_FIXTURE_TENANT");
    const other = manifest.tenants.find(item => item.id !== fixture.restaurantId);
    const post = body => postGuest(manifest, fixture.restaurantId, body, { timeoutMs });
    const context = await post({ action: "validate", kind: fixture.kind, qrToken: fixture.qrToken });
    expect(context.status === 200 && context.data.ok === true && context.data.data?.restaurantId === fixture.restaurantId
      && context.data.data?.kind === fixture.kind, "GUEST_QR_CONTEXT_MISMATCH");
    expect(context.data.data.tableId === (fixture.kind === "TABLE_QR" ? fixture.tableId : null), "GUEST_TABLE_COMMON_SEPARATION_FAILED");
    const payload = { action: "checkout", kind: fixture.kind, qrToken: fixture.qrToken, items: fixture.items,
      idempotencyKey: `uxi13b-web-${randomUUID()}` };
    const discarded = await discardGuestResponse(manifest, fixture.restaurantId, payload, { timeoutMs });
    expect(discarded.bodyDiscarded === true, "GUEST_ORIGINAL_RECEIPT_NOT_DISCARDED");
    // This retry is the first receipt available to the caller. The third request
    // below must then replay its original order and queue capability unchanged.
    const checkout = await post(payload);
    privateResponse(checkout);
    const receipt = checkout.data.data;
    expect(checkout.status === 200 && checkout.data.ok === true && UUID.test(receipt?.orderId ?? ""), "GUEST_CHECKOUT_FAILED");
    expect(receipt.totalAmount === fixture.expectedTotal, "GUEST_SERVER_TOTAL_MISMATCH");
    expect(receipt.orderChannel === fixture.kind && receipt.orderType === (fixture.kind === "TABLE_QR" ? "DINE_IN" : "TAKEAWAY"), "GUEST_ORDER_CHANNEL_MISMATCH");
    const replay = await post(payload);
    expect(replay.status === 200 && replay.data.data?.orderId === receipt.orderId, "GUEST_DUPLICATE_CREATED_ORDER");
    const crossTenantQr = await postGuest(manifest, other.id, { action: "validate", kind: fixture.kind, qrToken: fixture.qrToken }, { timeoutMs });
    expect(crossTenantQr.data.ok === false && crossTenantQr.data.error === "invalid-qr", "GUEST_FOREIGN_QR_ACCEPTED");
    if (fixture.kind === "COMMON_QR") {
      expect(Boolean(receipt.queue?.trackingToken && receipt.queue?.ticketId), "GUEST_QUEUE_MISSING");
      expect(replay.data.data?.queue?.trackingToken === receipt.queue.trackingToken, "GUEST_QUEUE_CAPABILITY_NOT_REPLAYED");
      const queueBody = { action: "status", ticketId: receipt.queue.ticketId, queueToken: receipt.queue.trackingToken };
      const queue = await post(queueBody);
      expect(queue.status === 200 && queue.data.data?.ticketId === receipt.queue.ticketId, "GUEST_QUEUE_TRACKING_FAILED");
      const foreignQueue = await postGuest(manifest, other.id, queueBody, { timeoutMs });
      expect(foreignQueue.data.ok === false && foreignQueue.data.error === "invalid-qr", "GUEST_FOREIGN_QUEUE_ACCEPTED");
    } else expect(receipt.queue === null, "GUEST_TABLE_QUEUE_NOT_SEPARATE");
  });
  return { acceptanceClass: "real-next-http", status: checks.some(item => item.status === "FAIL") ? "FAIL"
    : checks.some(item => item.status === "BLOCKED") ? "BLOCKED" : "PASS", checks,
  lostResponseRecovery: options.privateFixtures?.length
    ? checks.filter(item => item.name.startsWith("guest-bff-shared-qr-journey-")).every(item => item.status === "PASS") ? "PASS" : "FAIL"
    : "NOT RUN",
  browser: "NOT RUN", missingBoundary: "HTTP checks do not establish browser sign-in UI, React server-action provisioning/bootstrap, QR fragment capture, or installed-device acceptance." };
}

module.exports = { validateManifest, cookieJar, createAuthCookieJar, postGuest, discardGuestResponse, runWebJourney };

if (require.main === module) {
  (async () => {
    const filename = process.argv[2];
    if (!filename) throw new Error("MANIFEST_PATH_REQUIRED");
    // CLI intentionally accepts a public manifest only. Authenticated orchestration
    // imports runWebJourney and passes a real provider session directly in memory.
    const report = await runWebJourney(JSON.parse(readFileSync(filename, "utf8")));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === "PASS" ? 0 : 1;
  })().catch(() => { console.error("Local web journey could not run. Check the public manifest and local services; no credentials were printed."); process.exitCode = 1; });
}
