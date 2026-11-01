/**
 * Production-bundle HTTP smoke test. Run after `npm run build -w
 * @restaurant-platform/guest-web` with no other guest server using this checkout.
 *
 * This does NOT test a live Spring/database deployment. A loopback HTTP server
 * implements the existing Spring public-menu wire contract with synthetic data.
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
  };
}

const a = tenant("A", "#A12345");
const b = tenant("B", "#126B89");

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
    upstreamRequests.push({ path: req.url, headers: req.headers });
    const selected = [a, b].find(item => req.url === `/api/v1/public/restaurants/${item.restaurantId}/menu`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = selected ? upstreamStatus : 404;
    res.end(JSON.stringify(selected && upstreamStatus === 200 ? menu(mismatch ? b : selected) : { code: "RESTAURANT_NOT_FOUND" }));
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
  const captureOutput = chunk => { nextOutput = (nextOutput + chunk.toString()).slice(-16_000); };
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

  assert.ok(upstreamRequests.length > 0);
  for (const { path: requestedPath, headers } of upstreamRequests) {
    assert.ok([a, b].some(item => requestedPath === `/api/v1/public/restaurants/${item.restaurantId}/menu`));
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.referer, undefined);
    assert.equal(headers["x-restaurant-id"], undefined);
  }
  checks++;
  console.log(`Production HTTP smoke passed: ${checks} checks against the built Next app and synthetic Spring menu contract (${streamedNotFoundResponses} correctly denied streamed not-found responses).`);
  console.log(`Unknown-host initial response: ${lastReadiness}`);
} catch (error) {
  console.error(error);
  if (nextOutput) console.error(`Next production output (synthetic test traffic only):\n${nextOutput}`);
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
