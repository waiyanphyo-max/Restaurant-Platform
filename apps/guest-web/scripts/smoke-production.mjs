/**
 * Production-bundle HTTP smoke test. Run after `npm run build -w
 * @restaurant-platform/guest-web` with no other guest server using this checkout.
 *
 * This does NOT test a live Spring/database deployment. A loopback HTTP server
 * implements the Spring menu, QR context, checkout and queue wire contracts with synthetic data.
 * Two unique, temporary registry records exercise the real external registry in
 * `next start`; they are not shipped fixtures or application fallback data.
 * Existing configs, assets, environment files and build output are never edited.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = path.resolve(appDirectory, "../..");
const configDirectory = path.join(repository, "configs/restaurants");
const assetsDirectory = path.join(configDirectory, "assets");
const nextBinary = path.join(repository, "node_modules/next/dist/bin/next");
const suffix = randomBytes(6).toString("hex");
const createdFiles = [];
let createdAssetsDirectory = false;
let nextProcess;
let nextExit;
let nextOutput = "";
let upstream;
let upstreamStatus = 200;
let mismatch = false;
let emptyMenu = false;
let checks = 0;
let streamedNotFoundResponses = 0;
const upstreamRequests = [];
const receipts = new Map();
const queueTickets = new Map();
const placedOrders = [];
let unavailableProduct = false;
let loseCheckoutResponse = false;

function tenant(label, color) {
  const slug = `qa-m5-${suffix}-${label.toLowerCase()}`;
  return {
    slug, host: `${slug}.guest.test`, restaurantId: randomUUID(),
    name: `M5 Smoke ${label} ${suffix}`, productName: `Smoke ${label} tea ${suffix}`,
    description: `Synthetic restaurant ${label} description ${suffix}`,
    phone: label === "A" ? "+959111111111" : "+959222222222",
    address: `Synthetic ${label} address ${suffix}`, color,
    logo: `https://media.example.test/${slug}/logo.png`,
    productId: randomUUID(), categoryId: randomUUID(), variantId: randomUUID(),
    groupId: randomUUID(), optionId: randomUUID(),
    tableId: randomUUID(), tableNumber: `T-${label}`,
    commonQrToken: randomBytes(32).toString("hex"), tableQrToken: randomBytes(32).toString("hex"),
    stock: 5, dailyQueueNumber: 0,
  };
}

const a = tenant("A", "#A12345");
const b = tenant("B", "#126B89");
const secretTokens = new Set([a.commonQrToken, a.tableQrToken, b.commonQrToken, b.tableQrToken]);

function redact(value) {
  let result = String(value);
  for (const token of secretTokens) result = result.replaceAll(token, "[redacted]");
  return result;
}

function sendJson(response, value, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function guestContractFixture(req, res) {
  upstreamRequests.push({ path: req.url, headers: { ...req.headers, "x-queue-token": req.headers["x-queue-token"] ? "[redacted]" : undefined } });
  const selected = [a, b].find(item => req.url === `/api/v1/public/restaurants/${item.restaurantId}/menu`);
  if (selected) return sendJson(res, upstreamStatus === 200 ? menu(mismatch ? b : selected) : { code: "RESTAURANT_NOT_FOUND" }, upstreamStatus);
  const qrRoute = /^\/api\/v1\/public\/restaurants\/([\da-f-]+)\/(qr-context|orders\/(common-qr|table-qr))$/.exec(req.url ?? "");
  if (qrRoute && req.method === "POST") {
    const restaurant = [a, b].find(item => item.restaurantId === qrRoute[1]);
    if (!restaurant) return sendJson(res, { code: "RESTAURANT_NOT_FOUND" }, 404);
    let rawBody = "";
    for await (const chunk of req) rawBody += chunk.toString();
    const body = JSON.parse(rawBody);
    const isContext = qrRoute[2] === "qr-context";
    const kind = isContext ? body.kind : qrRoute[3] === "table-qr" ? "TABLE_QR" : "COMMON_QR";
    const fingerprint = JSON.stringify(body);
    const receiptKey = `${restaurant.restaurantId}:${kind}:${req.headers["idempotency-key"]}`;
    const previous = receipts.get(receiptKey);
    // Spring's idempotency replay precedes current QR/stock validation.
    if (!isContext && previous) return previous.fingerprint === fingerprint
      ? sendJson(res, previous.response) : sendJson(res, { code: "IDEMPOTENCY_KEY_REUSED" }, 409);
    const tableQr = kind === "TABLE_QR";
    if (body.qrToken !== (tableQr ? restaurant.tableQrToken : restaurant.commonQrToken)) return sendJson(res, { code: tableQr ? "INVALID_TABLE_QR_TOKEN" : "INVALID_COMMON_QR_TOKEN" }, 403);
    if (isContext) return sendJson(res, { restaurantId: restaurant.restaurantId, kind, tableId: tableQr ? restaurant.tableId : null, tableNumber: tableQr ? restaurant.tableNumber : null });
    assert.match(req.headers["idempotency-key"] ?? "", /^[A-Za-z0-9._:-]{8,128}$/);
    if (!body.items?.length) return sendJson(res, { code: "VALIDATION_FAILED" }, 400);
    let subtotal = 0;
    let quantity = 0;
    for (const line of body.items) {
      if (line.productId !== restaurant.productId) return sendJson(res, { code: "INVALID_PRODUCT" }, 400);
      if (unavailableProduct) return sendJson(res, { code: "PRODUCT_UNAVAILABLE" }, 409);
      if (line.variantId !== restaurant.variantId) return sendJson(res, { code: "INVALID_PRODUCT_VARIANT" }, 400);
      if (line.modifiers?.length !== 1 || line.modifiers[0].modifierOptionId !== restaurant.optionId) return sendJson(res, { code: "INVALID_MODIFIER_SELECTION_COUNT" }, 400);
      subtotal += (3000 + 500 * line.modifiers[0].quantity) * line.quantity;
      quantity += line.quantity;
    }
    if (quantity > restaurant.stock) return sendJson(res, { code: "INSUFFICIENT_STOCK" }, 409);
    restaurant.stock -= quantity;
    const orderId = randomUUID();
    const orderNumber = `ORD-20261101-${randomBytes(4).toString("hex").toUpperCase()}`;
    let queue = null;
    if (!tableQr) {
      const ticketId = randomUUID();
      const token = randomBytes(32).toString("hex");
      secretTokens.add(token);
      const queueNumber = ++restaurant.dailyQueueNumber;
      queue = { ticketId, queueNumber, displayCode: String(queueNumber).padStart(3, "0"), status: "WAITING", trackingToken: token };
      queueTickets.set(ticketId, { restaurantId: restaurant.restaurantId, orderId, token, status: "WAITING", orderStatus: "PENDING", orderNumber, queueNumber, displayCode: queue.displayCode, notificationId: randomUUID(), read: false });
    }
    const response = { orderId, orderNumber, orderType: tableQr ? "DINE_IN" : "TAKEAWAY", orderChannel: kind, status: "PENDING", currency: "MMK", subtotal, deliveryFee: 0, discountAmount: 0, totalAmount: subtotal, queue };
    receipts.set(receiptKey, { fingerprint, response });
    placedOrders.push({ restaurantId: restaurant.restaurantId, kind, tableId: tableQr ? restaurant.tableId : null, items: body.items, orderId });
    if (loseCheckoutResponse) { loseCheckoutResponse = false; req.socket.destroy(); return; }
    return sendJson(res, response);
  }
  const queueRoute = /^\/api\/v1\/public\/queue-tickets\/([\da-f-]+)\/(status|notifications)(?:\/([\da-f-]+)\/read)?$/.exec(req.url ?? "");
  if (queueRoute) {
    const ticket = queueTickets.get(queueRoute[1]);
    if (!ticket || req.headers["x-queue-token"] !== ticket.token || req.headers["x-restaurant-id"] !== ticket.restaurantId) return sendJson(res, { code: "QUEUE_TICKET_NOT_FOUND" }, 404);
    if (queueRoute[2] === "status") return sendJson(res, { ticketId: queueRoute[1], queueNumber: ticket.queueNumber, displayCode: ticket.displayCode, queueStatus: ticket.status, orderNumber: ticket.orderNumber, orderStatus: ticket.orderStatus, createdAt: "2026-11-01T11:00:00+06:30", readyAt: ticket.status === "WAITING" ? null : "2026-11-01T11:05:00+06:30", calledAt: ["CALLED", "COMPLETED"].includes(ticket.status) ? "2026-11-01T11:06:00+06:30" : null, completedAt: ticket.status === "COMPLETED" ? "2026-11-01T11:07:00+06:30" : null });
    if (queueRoute[3]) {
      if (queueRoute[3] !== ticket.notificationId || req.method !== "PATCH") return sendJson(res, { code: "NOTIFICATION_NOT_FOUND" }, 404);
      ticket.read = true;
    }
    const notice = { id: ticket.notificationId, orderId: ticket.orderId, queueTicketId: queueRoute[1], notificationType: "ORDER_READY", title: "Your order is ready", body: `Queue ${ticket.displayCode} is ready for collection.`, channel: "IN_APP", status: ticket.read ? "READ" : "PENDING", createdAt: "2026-11-01T11:05:00+06:30", readAt: ticket.read ? "2026-11-01T11:06:00+06:30" : null };
    return sendJson(res, queueRoute[3] ? notice : ["READY", "CALLED", "COMPLETED"].includes(ticket.status) ? [notice] : []);
  }
  return sendJson(res, { code: "NOT_FOUND" }, 404);
}

function configuration(item, iconPath) {
  const androidApp = kind => ({
    displayName: `${item.name} ${kind}`,
    stagingApplicationId: `com.smoke.m${suffix}.${item.slug.endsWith("-a") ? "a" : "b"}.${kind}.staging`,
    productionApplicationId: `com.smoke.m${suffix}.${item.slug.endsWith("-a") ? "a" : "b"}.${kind}`,
    iconPath,
  });
  return {
    schemaVersion: 1, slug: item.slug, restaurantId: item.restaurantId,
    branding: { displayName: item.name, primaryColor: item.color, logoUrl: item.logo },
    guestDomains: { staging: [`staging.${item.host}`], production: [item.host] },
    android: { operations: androidApp("operations"), customer: androidApp("customer") },
  };
}

function menu(item) {
  return {
    restaurantId: item.restaurantId, restaurantName: item.name, slug: item.slug,
    description: item.description, phone: item.phone, address: item.address,
    logoUrl: item.logo, currency: "MMK",
    categories: emptyMenu ? [] : [{
      id: item.categoryId, name: `Smoke ${item === a ? "A" : "B"} drinks`, displayOrder: 0,
      products: [{
        id: item.productId, name: item.productName, description: `Tea description ${suffix}`,
        price: 2000, imageUrl: `https://media.example.test/${item.slug}/tea.webp`,
        available: true, trackStock: true, stockQuantity: 5,
        variants: [{ id: item.variantId, name: `Large ${suffix}`, price: 3000, imageUrl: null, available: true }],
        modifierGroups: [{
          id: item.groupId, name: `Milk choice ${suffix}`, required: true, minSelections: 1, maxSelections: 1,
          options: [{ id: item.optionId, name: `Oat milk ${suffix}`, additionalPrice: 500, available: true }],
        }],
      }],
    }],
  };
}

async function writeExclusive(filename, data) {
  await writeFile(filename, data, { flag: "wx" });
  createdFiles.push(filename);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

function request(port, host, pathname, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: "127.0.0.1", port, path: pathname,
      headers: { Host: host, ...extraHeaders },
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on("error", reject);
    });
    req.setTimeout(5_000, () => req.destroy(new Error("Production smoke HTTP request timed out")));
    req.on("error", reject);
  });
}

function guestPost(port, restaurant, body, extraHeaders = {}, pathname = "/api/guest") {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "POST", headers: {
      Host: restaurant.host, Origin: `http://${restaurant.host}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...extraHeaders,
    } }, response => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { responseBody += chunk; });
      response.on("end", () => {
        try {
          assert.match(response.headers["cache-control"] ?? "", /no-store/);
          assert.equal(response.headers["referrer-policy"], "no-referrer");
          resolve({ status: response.statusCode, data: JSON.parse(responseBody) });
        } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Guest checkout fixture request timed out")));
    req.on("error", reject);
    req.end(data);
  });
}

function assertBrand(response, expected, other, status = 200) {
  assert.equal(response.status, status);
  assert.ok(response.body.includes(expected.name), "Expected restaurant branding is absent");
  assert.ok(response.body.includes(expected.color), "Expected tenant color is absent");
  assert.ok(response.body.includes(expected.logo), "Expected tenant logo is absent");
  assert.ok(!response.body.includes(other.name), "Another restaurant's branding was exposed");
  assert.ok(!response.body.includes(other.productName), "Another restaurant's products were exposed");
  assert.ok(!response.body.includes(other.address), "Another restaurant's contact details were exposed");
  assert.match(response.headers["cache-control"] ?? "", /no-store/);
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  checks++;
}

function flightText(html) {
  return [...html.matchAll(/<script[^>]*>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].flatMap(([, json]) => {
    try {
      const frame = JSON.parse(json);
      return frame[0] === 1 && typeof frame[1] === "string" ? [frame[1]] : [];
    } catch { return []; }
  }).join("");
}

function hasDeniedState(response, expectedHeading) {
  const htmlState = response.body.includes(`<h1>${expectedHeading}</h1>`);
  // A notFound thrown from a streamed layout can serialize the fallback as Flight
  // data for React's 404 boundary, instead of placing that heading in initial HTML.
  const flight = flightText(response.body);
  const flightState = flight.includes(`["$","h1",null,{"children":${JSON.stringify(expectedHeading)}}]`);
  const notFoundSignal = /data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"/.test(response.body) || flight.includes("NEXT_HTTP_ERROR_FALLBACK;404");
  return htmlState || (flightState && notFoundSignal);
}

async function assertDenied(port, host, pathname, extraHeaders) {
  const before = upstreamRequests.length;
  const response = await request(port, host, pathname, extraHeaders);
  assert.ok(response.status === 404 || response.status === 200, `Unexpected denied route status ${response.status} for ${pathname}`);
  const expectedHeading = [a.host, b.host].includes(host) && !pathname.startsWith("/r/")
    ? "This page isn’t available" : "Restaurant site unavailable";
  assert.ok(hasDeniedState(response, expectedHeading), `Denied route did not render or serialize the correct not-found state; status=${response.status}; protocol404=${response.body.includes("NEXT_HTTP_ERROR_FALLBACK;404")}; flightHeading=${flightText(response.body).includes(expectedHeading)}`);
  // Next returns 200 when an async notFound() happens after a loading shell streamed.
  // Accept that documented behavior only with the actual denial state and noindex.
  if (response.status === 200) {
    assert.match(response.body, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex[^"]*"/);
    streamedNotFoundResponses++;
  }
  assert.ok(!response.body.includes(a.productName));
  assert.ok(!response.body.includes(b.productName));
  assert.match(response.headers["cache-control"] ?? "", /no-store/);
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  // Unknown products require reading the current scoped menu; other denied routes do not.
  if (!pathname.startsWith("/menu/")) assert.equal(upstreamRequests.length, before);
  checks++;
  return response;
}

async function stopNext() {
  if (!nextProcess || nextProcess.exitCode !== null || nextProcess.signalCode !== null) return;
  nextProcess.kill("SIGTERM");
  const stopped = await Promise.race([nextExit.then(() => true), delay(5_000).then(() => false)]);
  if (!stopped) {
    nextProcess.kill("SIGKILL");
    await nextExit;
  }
}

try {
  await access(path.join(appDirectory, ".next/BUILD_ID"));
  await access(nextBinary);
  try { await mkdir(assetsDirectory); createdAssetsDirectory = true; }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const iconPath = `assets/qa-m5-${suffix}.png`;
  await writeExclusive(path.join(configDirectory, iconPath), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=", "base64",
  ));
  for (const item of [a, b]) {
    await writeExclusive(path.join(configDirectory, `${item.slug}.json`), `${JSON.stringify(configuration(item, iconPath), null, 2)}\n`);
  }

  upstream = http.createServer((req, res) => {
    guestContractFixture(req, res).catch(() => sendJson(res, { code: "FIXTURE_ERROR" }, 500));
  });
  const upstreamPort = await listen(upstream);
  const reservation = http.createServer();
  const guestPort = await listen(reservation);
  await closeServer(reservation);

  nextProcess = spawn(process.execPath, [nextBinary, "start", "--hostname", "127.0.0.1", "--port", String(guestPort)], {
    cwd: appDirectory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NODE_ENV: "production", GUEST_CONFIG_ENV: "production",
      GUEST_LOCAL_ROUTING: "true", GUEST_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  nextExit = new Promise((resolve, reject) => {
    nextProcess.once("exit", (code, signal) => resolve({ code, signal }));
    nextProcess.once("error", reject);
  });
  const captureOutput = chunk => { nextOutput = (nextOutput + redact(chunk.toString())).slice(-16_000); };
  nextProcess.stdout.on("data", captureOutput);
  nextProcess.stderr.on("data", captureOutput);
  let ready = false;
  let lastReadiness = "No HTTP response received";
  for (let attempt = 0; attempt < 100; attempt++) {
    if (nextProcess.exitCode !== null) throw new Error("Next production server exited before becoming ready");
    try {
      const response = await request(guestPort, "unknown.guest.test", "/");
      const title = /<title>([^<]*)<\/title>/.exec(response.body)?.[1] ?? "(no title)";
      const headings = [...response.body.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map(match => match[1]);
      const flight = flightText(response.body);
      lastReadiness = `HTTP ${response.status}; title=${title}; headings=${headings.join(" | ")}; protocol404=${response.body.includes("NEXT_HTTP_ERROR_FALLBACK;404")}; flight unknown heading=${flight.includes("Restaurant site unavailable")}; flight unknown note=${flight.includes("This address is not configured for a restaurant.")}`;
      const hasUnknownState = hasDeniedState(response, "Restaurant site unavailable");
      const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex[^"]*"/.test(response.body);
      if (hasUnknownState && (response.status === 404 || (response.status === 200 && noindex))) { ready = true; break; }
    } catch (error) {
      lastReadiness = error.message;
      // Wait for the production listener, never a development server.
    }
    await delay(100);
  }
  assert.ok(ready, `Next production server did not become ready: ${lastReadiness}`);

  for (const [expected, other] of [[a, b], [b, a]]) {
    const home = await request(guestPort, expected.host, "/");
    assertBrand(home, expected, other);
    assert.ok(home.body.includes(expected.productName));
    assert.ok(home.body.includes(expected.address));
    assert.ok(home.body.includes(`tel:${expected.phone}`));
    const listing = await request(guestPort, expected.host, "/menu");
    assertBrand(listing, expected, other);
    assert.ok(listing.body.includes(`/menu/${expected.productId}`));
    const detail = await request(guestPort, expected.host, `/menu/${expected.productId}`);
    assertBrand(detail, expected, other);
    for (const name of [`Large ${suffix}`, `Milk choice ${suffix}`, `Oat milk ${suffix}`]) assert.ok(detail.body.includes(name));
    assert.ok(detail.body.includes("3,000"), "Variant whole-unit price was not rendered");
    for (const legacyPath of [
      `/?view=customer-pickup&restaurantId=${expected.restaurantId}`,
      `/workspace?view=table-order&restaurantId=${expected.restaurantId}`,
    ]) {
      const legacy = await request(guestPort, expected.host, legacyPath);
      assertBrand(legacy, expected, other);
      assert.ok(legacy.body.includes(expected.productName), "An existing guest QR route failed to serve its restaurant menu");
      assert.ok(legacy.body.includes("Checking your QR link"));
      assert.equal(legacy.headers.location, undefined, "Guest QR routes must not redirect to sign-in");
    }
    const beforeOwner = upstreamRequests.length;
    const owner = await request(guestPort, expected.host, `/workspace?restaurantId=${expected.restaurantId}`);
    assertBrand(owner, expected, other);
    assert.ok(owner.body.includes("Restaurant owner link"));
    assert.equal(upstreamRequests.length, beforeOwner);
    await assertDenied(guestPort, expected.host, `/?restaurantId=${other.restaurantId}`);
    await assertDenied(guestPort, expected.host, `/?view=customer-pickup&restaurantId=${other.restaurantId}`);
    await assertDenied(guestPort, expected.host, `/workspace?view=table-order&restaurantId=${other.restaurantId}`);
    await assertDenied(guestPort, expected.host, `/menu?restaurantId=${other.restaurantId}`);
    const wrongProduct = await assertDenied(guestPort, expected.host, `/menu/${other.productId}`);
    assert.ok(!wrongProduct.body.includes(other.name));
    await assertDenied(guestPort, expected.host, `/r/${other.slug}/menu`);
  }
  await assertDenied(guestPort, "unknown.guest.test", "/", { "x-forwarded-host": a.host });
  await assertDenied(guestPort, `localhost:${guestPort}`, `/r/${a.slug}/menu`);
  await assertDenied(guestPort, `${a.slug}.localhost:${guestPort}`, "/menu");
  for (const name of ["qrToken", "queueToken"]) {
    // A deliberately invalid placeholder checks accidental incoming URL handling, never a live capability.
    const accidentalCredential = `invalid-query-credential-${suffix}-${name}`;
    secretTokens.add(accidentalCredential);
    const before = upstreamRequests.length;
    const rejectedQuery = await request(guestPort, a.host, `/?${name}=${accidentalCredential}`);
    assert.equal(rejectedQuery.status, 400);
    assert.ok(!rejectedQuery.body.includes(accidentalCredential), "A credential query was echoed into the public error body");
    assert.equal(rejectedQuery.headers["referrer-policy"], "no-referrer");
    assert.match(rejectedQuery.headers["cache-control"] ?? "", /no-store/);
    assert.equal(upstreamRequests.length, before);
    checks++;
  }
  const beforeLocalApi = upstreamRequests.length;
  const localApi = await guestPost(guestPort, { host: `localhost:${guestPort}` }, { action: "validate", kind: "TABLE_QR", qrToken: a.tableQrToken }, {}, `/r/${a.slug}/api/guest`);
  assert.equal(localApi.status, 404);
  assert.equal(localApi.data.error, "unavailable");
  assert.equal(upstreamRequests.length, beforeLocalApi, "A local production API path bypassed host resolution");
  checks++;
  const spoofedContext = await request(guestPort, a.host, "/menu", {
    "x-forwarded-host": b.host, "x-guest-route-slug": b.slug,
  });
  assertBrand(spoofedContext, a, b);

  const burmese = await request(guestPort, a.host, "/menu", { Cookie: "guest-language=my" });
  assert.equal(burmese.status, 200);
  assert.ok(burmese.body.includes('<html lang="my"'));
  assert.match(burmese.body, /[\u1000-\u109f]/u);
  checks++;

  mismatch = true;
  const rejectedPayload = await request(guestPort, a.host, "/menu");
  assertBrand(rejectedPayload, a, b);
  assert.ok(!rejectedPayload.body.includes(b.description));
  assert.ok(!rejectedPayload.body.includes(b.phone));
  assert.ok(!rejectedPayload.body.includes(b.logo));
  mismatch = false;

  upstreamStatus = 404;
  const unavailable = await request(guestPort, a.host, "/menu");
  assertBrand(unavailable, a, b);
  assert.ok(unavailable.body.includes("The restaurant is unavailable right now"));
  upstreamStatus = 200;
  emptyMenu = true;
  const empty = await request(guestPort, a.host, "/menu");
  assertBrand(empty, a, b);
  assert.ok(empty.body.includes("The menu is being prepared"));
  emptyMenu = false;

  const completed = new Map();
  for (const [restaurant, other] of [[a, b], [b, a]]) {
    for (const kind of ["TABLE_QR", "COMMON_QR"]) {
      const qrToken = kind === "TABLE_QR" ? restaurant.tableQrToken : restaurant.commonQrToken;
      const context = await guestPost(guestPort, restaurant, { action: "validate", kind, qrToken });
      assert.equal(context.status, 200);
      assert.equal(context.data.data.restaurantId, restaurant.restaurantId);
      assert.equal(context.data.data.kind, kind);
      assert.equal(context.data.data.tableId, kind === "TABLE_QR" ? restaurant.tableId : null);
      assert.ok(!JSON.stringify(context.data).includes(qrToken), "QR context exposed its credential");
      checks++;

      const items = [{ productId: restaurant.productId, variantId: restaurant.variantId, quantity: 2, specialInstruction: "Less sweet / အချိုလျှော့", modifiers: [{ modifierOptionId: restaurant.optionId, quantity: 1 }] }];
      const payload = { action: "checkout", kind, qrToken, items, idempotencyKey: `smoke-${randomUUID()}` };
      const beforeOrders = placedOrders.length;
      // Commit the Common order, then sever the first upstream connection: the shared transport must replay its key.
      if (kind === "COMMON_QR") loseCheckoutResponse = true;
      const checkout = await guestPost(guestPort, restaurant, payload);
      assert.equal(checkout.status, 200);
      assert.equal(checkout.data.ok, true);
      const receipt = checkout.data.data;
      assert.equal(receipt.orderType, kind === "TABLE_QR" ? "DINE_IN" : "TAKEAWAY");
      assert.equal(receipt.orderChannel, kind);
      assert.equal(receipt.totalAmount, 7000, "Checkout must display the variant+modifier price calculated by the backend fixture");
      assert.equal(receipt.status, "PENDING");
      assert.equal(placedOrders.length, beforeOrders + 1);
      const saved = placedOrders.at(-1);
      assert.equal(saved.restaurantId, restaurant.restaurantId);
      assert.equal(saved.tableId, kind === "TABLE_QR" ? restaurant.tableId : null);
      assert.deepEqual(saved.items, items);
      const duplicate = await guestPost(guestPort, restaurant, payload);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.data.data.orderId, receipt.orderId, "A repeated checkout must return its original order");
      assert.equal(placedOrders.length, beforeOrders + 1, "A repeated checkout created another order");
      const changedKeyPayload = await guestPost(guestPort, restaurant, { ...payload, items: [{ ...items[0], quantity: 1 }] });
      assert.equal(changedKeyPayload.data.error, "conflict");
      assert.equal(changedKeyPayload.data.ambiguous, true);
      checks += 3;

      const foreignQr = await guestPost(guestPort, restaurant, { action: "validate", kind, qrToken: kind === "TABLE_QR" ? other.tableQrToken : other.commonQrToken });
      assert.equal(foreignQr.data.error, "invalid-qr");
      const invalid = await guestPost(guestPort, restaurant, { action: "validate", kind, qrToken: "invalid-credential" });
      assert.equal(invalid.data.error, "invalid-qr");
      const invalidCheckout = await guestPost(guestPort, restaurant, { ...payload, qrToken: "invalid-credential", idempotencyKey: `smoke-${randomUUID()}` });
      assert.equal(invalidCheckout.data.error, "invalid-qr");
      const crossTenantCheckout = await guestPost(guestPort, restaurant, { ...payload, qrToken: kind === "TABLE_QR" ? other.tableQrToken : other.commonQrToken, idempotencyKey: `smoke-${randomUUID()}` });
      assert.equal(crossTenantCheckout.data.error, "invalid-qr");
      const foreignProduct = await guestPost(guestPort, restaurant, { ...payload, idempotencyKey: `smoke-${randomUUID()}`, items: [{ ...items[0], productId: other.productId }] });
      assert.equal(foreignProduct.data.error, "selection");
      unavailableProduct = true;
      const unavailableSelection = await guestPost(guestPort, restaurant, { ...payload, idempotencyKey: `smoke-${randomUUID()}` });
      unavailableProduct = false;
      assert.equal(unavailableSelection.data.error, "selection");
      assert.equal(unavailableSelection.data.ambiguous, false);
      const outOfStock = await guestPost(guestPort, restaurant, { ...payload, idempotencyKey: `smoke-${randomUUID()}`, items: [{ ...items[0], quantity: 999 }] });
      assert.equal(outOfStock.data.error, "selection");
      const missingModifier = await guestPost(guestPort, restaurant, { ...payload, idempotencyKey: `smoke-${randomUUID()}`, items: [{ ...items[0], modifiers: [] }] });
      assert.equal(missingModifier.data.error, "selection");
      const emptyCart = await guestPost(guestPort, restaurant, { ...payload, items: [] });
      assert.equal(emptyCart.data.error, "selection");
      assert.equal(placedOrders.length, beforeOrders + 1, "A rejected checkout created an order");
      checks += 9;

      if (kind === "COMMON_QR") {
        assert.ok(receipt.queue, "Common QR must return its queue capability");
        assert.equal(receipt.queue.queueNumber, 1, "Each tenant has its own date-scoped queue counter");
        assert.equal(receipt.queue.displayCode, "001");
        assert.match(receipt.orderNumber, /^ORD-20261101-/);
        assert.ok(duplicate.data.data.queue.trackingToken === receipt.queue.trackingToken, "Idempotency must replay the original queue capability");
        const queueToken = receipt.queue.trackingToken;
        const ticketId = receipt.queue.ticketId;
        const statusPayload = { action: "status", ticketId, queueToken };
        const waiting = await guestPost(guestPort, restaurant, statusPayload);
        assert.equal(waiting.data.data.queueStatus, "WAITING");
        assert.equal(waiting.data.data.orderStatus, "PENDING");
        assert.equal(waiting.data.data.createdAt.slice(0, 10), "2026-11-01");
        const ticket = queueTickets.get(ticketId);
        ticket.status = "READY"; ticket.orderStatus = "READY";
        const readyStatus = await guestPost(guestPort, restaurant, statusPayload);
        assert.equal(readyStatus.data.data.queueStatus, "READY");
        const notifications = await guestPost(guestPort, restaurant, { ...statusPayload, action: "notifications" });
        assert.equal(notifications.data.data[0].notificationType, "ORDER_READY");
        const markRead = await guestPost(guestPort, restaurant, { ...statusPayload, action: "read", notificationId: ticket.notificationId });
        assert.equal(markRead.data.data.status, "READ");
        ticket.status = "CALLED";
        assert.equal((await guestPost(guestPort, restaurant, statusPayload)).data.data.queueStatus, "CALLED");
        ticket.status = "COMPLETED"; ticket.orderStatus = "COMPLETED";
        assert.equal((await guestPost(guestPort, restaurant, statusPayload)).data.data.orderStatus, "COMPLETED");
        const wrongTenant = await guestPost(guestPort, other, statusPayload);
        assert.equal(wrongTenant.data.error, "invalid-qr");
        const wrongTenantNotifications = await guestPost(guestPort, other, { ...statusPayload, action: "notifications" });
        assert.equal(wrongTenantNotifications.data.error, "invalid-qr");
        const wrongTenantRead = await guestPost(guestPort, other, { ...statusPayload, action: "read", notificationId: ticket.notificationId });
        assert.equal(wrongTenantRead.data.error, "invalid-qr");
        const badToken = await guestPost(guestPort, restaurant, { ...statusPayload, queueToken: "invalid-tracking-token" });
        assert.equal(badToken.data.error, "invalid-qr");
        completed.set(restaurant.restaurantId, { payload, receipt });
        checks += 11;
      } else assert.equal(receipt.queue, null);
    }
    assert.equal(restaurant.stock, 1, "Stock must be reserved once per successful order");
  }

  for (const restaurant of [a, b]) {
    const { payload, receipt } = completed.get(restaurant.restaurantId);
    const oldToken = restaurant.commonQrToken;
    restaurant.commonQrToken = randomBytes(32).toString("hex");
    secretTokens.add(restaurant.commonQrToken);
    const rotated = await guestPost(guestPort, restaurant, { action: "validate", kind: "COMMON_QR", qrToken: oldToken });
    assert.equal(rotated.data.error, "invalid-qr");
    const replayAfterRotation = await guestPost(guestPort, restaurant, payload);
    assert.equal(replayAfterRotation.data.data.orderId, receipt.orderId, "Rotation must not prevent a retry from recovering a committed receipt");
    const newOrderWithOldQr = await guestPost(guestPort, restaurant, { ...payload, idempotencyKey: `smoke-${randomUUID()}` });
    assert.equal(newOrderWithOldQr.data.error, "invalid-qr");
    checks += 3;
  }

  const crossOrigin = await guestPost(guestPort, a, { action: "validate", kind: "TABLE_QR", qrToken: a.tableQrToken }, { Origin: "https://attacker.test" });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.data.error, "invalid-qr");
  checks++;

  assert.ok(upstreamRequests.length > 0);
  for (const { path: requestedPath, headers } of upstreamRequests) {
    assert.ok(!requestedPath.includes("?") && !requestedPath.includes("#"), "Public upstream requests must not carry query or fragment credentials");
    assert.ok(/^\/api\/v1\/public\/(restaurants\/[\da-f-]+\/(menu|qr-context|orders\/(table-qr|common-qr))|queue-tickets\/[\da-f-]+\/(status|notifications)(\/[\da-f-]+\/read)?)$/.test(requestedPath));
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.referer, undefined);
    if (requestedPath.includes("/queue-tickets/")) {
      assert.ok([a.restaurantId, b.restaurantId].includes(headers["x-restaurant-id"]));
      assert.equal(headers["x-queue-token"], "[redacted]");
    } else assert.equal(headers["x-restaurant-id"], undefined);
  }
  checks++;
  console.log(`Production HTTP smoke passed: ${checks} checks against the built Next app and synthetic Spring menu/QR/checkout/queue contracts (${placedOrders.length} orders, ${streamedNotFoundResponses} correctly denied streamed not-found responses).`);
  console.log(`Unknown-host initial response: ${lastReadiness}`);
} catch (error) {
  console.error(redact(error.stack ?? error));
  if (nextOutput) console.error(`Next production output (synthetic test traffic only):\n${redact(nextOutput)}`);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  try { await stopNext(); } catch (error) { cleanupErrors.push(error); }
  try { await closeServer(upstream); } catch (error) { cleanupErrors.push(error); }
  for (const filename of createdFiles.reverse()) {
    try { await unlink(filename); } catch (error) { cleanupErrors.push(error); }
  }
  if (createdAssetsDirectory) {
    try { await rmdir(assetsDirectory); }
    catch (error) { if (error.code !== "ENOTEMPTY") cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) {
    console.error("Production smoke cleanup failed:", cleanupErrors);
    process.exitCode = 1;
  }
}
