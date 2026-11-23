"use strict";

// Real local Chrome/UI evidence. Credentials and QR capabilities are passed only
// in memory. No screenshots, page dumps, cookies, CDP messages or browser logs
// are persisted. The isolated task-owned browser profile is removed on exit.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { validateManifest } = require("./local-web-journey.cjs");
const { WebSocket, fetch, AbortSignal } = globalThis;

function requireLocalAuth(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("LOCAL_AUTH_ORIGIN_REQUIRED"); }
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("LOCAL_AUTH_ORIGIN_REQUIRED");
  return url.origin;
}

function guestUrl(manifest, tenant, fixture) {
  const url = new URL(manifest.guestOrigin);
  url.hostname = tenant.host;
  if (!fixture) url.pathname = "/menu";
  else {
    if (fixture.restaurantId !== tenant.id || !["COMMON_QR", "TABLE_QR"].includes(fixture.kind)
        || typeof fixture.qrToken !== "string" || !fixture.qrToken || fixture.qrToken.length > 8192) throw new Error("INVALID_PRIVATE_FIXTURE");
    url.pathname = fixture.kind === "TABLE_QR" ? "/workspace" : "/";
    url.searchParams.set("view", fixture.kind === "TABLE_QR" ? "table-order" : "customer-pickup");
    url.searchParams.set("restaurantId", tenant.id);
    url.hash = `qrToken=${encodeURIComponent(fixture.qrToken)}`;
  }
  return url.href;
}

function permittedBrowserUrl(value, origins) {
  if (value === "about:blank" || value.startsWith("data:")) return true;
  try { return origins.has(new URL(value).origin); } catch { return false; }
}

function connectCdp(url, { WebSocketImpl = WebSocket, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(url);
    const pending = new Map();
    const handlers = new Map();
    let nextId = 0;
    const opening = globalThis.setTimeout(() => { socket.close(); reject(new Error("BROWSER_CONNECTION_TIMEOUT")); }, timeoutMs);
    function failPending() {
      for (const item of pending.values()) { globalThis.clearTimeout(item.timer); item.reject(new Error("BROWSER_CONNECTION_CLOSED")); }
      pending.clear();
    }
    socket.addEventListener("error", () => { globalThis.clearTimeout(opening); failPending(); reject(new Error("BROWSER_CONNECTION_FAILED")); });
    socket.addEventListener("close", failPending);
    socket.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id); globalThis.clearTimeout(item.timer);
        if (message.error) item.reject(new Error("BROWSER_COMMAND_FAILED"));
        else item.resolve(message.result ?? {});
      } else for (const handler of handlers.get(message.method) ?? []) handler(message.params ?? {}, message.sessionId);
    });
    socket.addEventListener("open", () => {
      globalThis.clearTimeout(opening);
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++nextId;
          return new Promise((accept, decline) => {
            const timer = globalThis.setTimeout(() => { pending.delete(id); decline(new Error("BROWSER_COMMAND_TIMEOUT")); }, timeoutMs);
            pending.set(id, { resolve: accept, reject: decline, timer });
            try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
            catch { globalThis.clearTimeout(timer); pending.delete(id); decline(new Error("BROWSER_COMMAND_FAILED")); }
          });
        },
        on(method, handler) {
          if (!handlers.has(method)) handlers.set(method, new Set());
          handlers.get(method).add(handler);
          return () => handlers.get(method)?.delete(handler);
        },
        close() { failPending(); socket.close(); }
      });
    });
  });
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function findChrome(explicit, env = process.env) {
  const candidates = [explicit, env.LOCAL_CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  return candidates.find(file => fs.existsSync(file));
}

function removeOwnedProfile(profile, workspace, owner) {
  const resolvedWork = fs.realpathSync(workspace);
  const resolved = fs.realpathSync(profile);
  if (path.dirname(resolved) !== resolvedWork || !/^browser-[A-Za-z0-9]+$/.test(path.basename(resolved))
      || resolved !== path.resolve(profile) || fs.readFileSync(path.join(resolved, "uxi13b-owner"), "utf8") !== owner) {
    throw new Error("BROWSER_PROFILE_OWNERSHIP_MISMATCH");
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}

async function waitForValue(operation, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await operation()) return; } catch { /* Navigation can replace the execution context. */ }
    await delay(100);
  }
  throw new Error("BROWSER_EXPECTATION_TIMEOUT");
}

async function launchBrowser({ repository, chromePath, timeoutMs, onChild }) {
  const executable = findChrome(chromePath);
  if (!executable) throw new Error("LOCAL_CHROME_UNAVAILABLE");
  const workspace = path.join(repository, ".local-integration");
  fs.mkdirSync(workspace, { recursive: true });
  if (fs.realpathSync(workspace) !== path.resolve(workspace)) throw new Error("BROWSER_WORKSPACE_OWNERSHIP_MISMATCH");
  const profile = fs.mkdtempSync(path.join(workspace, "browser-"));
  const owner = randomUUID();
  fs.writeFileSync(path.join(profile, "uxi13b-owner"), owner);
  let child, cdp;
  async function close() {
    if (cdp) { await cdp.send("Browser.close").catch(() => undefined); cdp.close(); }
    if (child && child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(3000)]);
      if (child.exitCode === null) {
        if (process.platform === "win32") await new Promise(resolve => {
          const stop = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          stop.once("error", resolve); stop.once("close", resolve);
        });
        else child.kill();
        await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(3000)]);
      }
    }
    removeOwnedProfile(profile, workspace, owner);
  }
  try {
    const port = await reservePort();
    child = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-sync", "--disable-component-update", "--disable-default-apps",
      "--disable-extensions", "--metrics-recording-only", "--no-proxy-server",
      "--host-resolver-rules=MAP *.localhost 127.0.0.1", "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
    { windowsHide: true, stdio: "ignore" });
    child.on("error", () => undefined);
    onChild?.(child);
    let webSocketDebuggerUrl;
    await waitForValue(async () => {
      if (child.exitCode !== null) throw new Error("LOCAL_CHROME_EXITED");
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
      webSocketDebuggerUrl = (await response.json()).webSocketDebuggerUrl;
      return typeof webSocketDebuggerUrl === "string" && webSocketDebuggerUrl.startsWith(`ws://127.0.0.1:${port}/`);
    }, timeoutMs);
    cdp = await connectCdp(webSocketDebuggerUrl, { timeoutMs });
    return { cdp, close };
  } catch { await close(); throw new Error("LOCAL_CHROME_STARTUP_BLOCKED"); }
}

/** Actual app UI; callers must supply the same in-memory identities/QR fixtures used by Spring. */
async function runBrowserJourney({ manifest: input, adminIdentity, privateFixtures = [], authOrigin }, options = {}) {
  const manifest = validateManifest(input);
  const auth = requireLocalAuth(authOrigin);
  if (adminIdentity && (!/^[^@\s]+@example\.test$/.test(adminIdentity.email ?? "")
      || typeof adminIdentity.password !== "string" || !adminIdentity.password)) throw new Error("SYNTHETIC_LOCAL_IDENTITY_REQUIRED");
  for (const fixture of privateFixtures) {
    const tenant = manifest.tenants.find(item => item.id === fixture.restaurantId);
    if (!tenant) throw new Error("UNKNOWN_PRIVATE_FIXTURE_TENANT");
    guestUrl(manifest, tenant, fixture);
  }
  const timeoutMs = options.timeoutMs ?? 45000;
  const checks = [];
  let browser;
  const check = async (name, operation) => {
    try { await operation(); checks.push({ name, status: "PASS" }); return true; }
    catch { checks.push({ name, status: "FAIL", code: "LOCAL_BROWSER_BOUNDARY_FAILED" }); return false; }
  };
  try {
    try { browser = await launchBrowser({ repository: options.repository ?? path.resolve(__dirname, ".."), chromePath: options.chromePath, timeoutMs, onChild: options.onChild }); }
    catch { return { acceptanceClass: "real-chrome-ui", status: "BLOCKED", checks: [{ name: "isolated-local-chrome", status: "BLOCKED" }],
      missingBoundary: "Installed Chrome could not start with its task-owned isolated profile." }; }
    const { cdp } = browser;
    const origins = new Set([manifest.apiOrigin, manifest.adminOrigin, manifest.guestOrigin, auth,
      ...manifest.tenants.map(tenant => new URL(guestUrl(manifest, tenant)).origin)]);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    let foreignNetworkRequest = false, capabilityInNetworkUrl = false;
    cdp.on("Fetch.requestPaused", (params, session) => {
      if (session !== sessionId) return;
      const allowed = permittedBrowserUrl(params.request.url, origins);
      if (!allowed) foreignNetworkRequest = true;
      void send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", { requestId: params.requestId,
        ...(!allowed ? { errorReason: "BlockedByClient" } : {}) }).catch(() => undefined);
    });
    cdp.on("Network.requestWillBeSent", (params, session) => {
      if (session === sessionId && privateFixtures.some(fixture => params.request.url.includes(fixture.qrToken))) capabilityInNetworkUrl = true;
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error("BROWSER_EVALUATION_FAILED");
      return result.result?.value;
    };
    const wait = expression => waitForValue(() => evaluate(expression), timeoutMs);
    const navigate = async url => {
      const navigation = await send("Page.navigate", { url });
      if (navigation.errorText) throw new Error("BROWSER_NAVIGATION_FAILED");
      // The old document may still report readyState=complete immediately after
      // Page.navigate. Require the new loader before inspecting rendered state.
      await waitForValue(async () => {
        const { frameTree } = await send("Page.getFrameTree");
        return (!navigation.loaderId || frameTree.frame.loaderId === navigation.loaderId)
          && await evaluate("document.readyState === 'complete'");
      }, timeoutMs);
    };
    await check("admin-ui-signed-out-protection", async () => {
      await navigate(`${manifest.adminOrigin}/settings`);
      await wait("location.pathname === '/login' && !!document.querySelector('#admin-email')");
    });
    let signedIn = false;
    if (adminIdentity) signedIn = await check("admin-ui-real-password-sign-in", async () => {
      await wait("!!document.querySelector('#admin-email') && !document.querySelector('#admin-email').disabled && Object.keys(document.querySelector('#admin-email')).some(key => key.startsWith('__reactProps$'))");
      await evaluate("document.querySelector('#admin-email').focus()");
      await send("Input.insertText", { text: adminIdentity.email });
      await evaluate("document.querySelector('#admin-password').focus()");
      await send("Input.insertText", { text: adminIdentity.password });
      await evaluate("document.querySelector('form.auth-form').requestSubmit()");
      await wait("location.pathname === '/settings' && document.body.innerText.includes('Platform Admin verified')");
      if (adminIdentity.id && !await evaluate(`document.body.innerText.includes(${JSON.stringify(adminIdentity.id)})`)) throw new Error("ADMIN_IDENTITY_MISMATCH");
    });
    else checks.push({ name: "admin-ui-real-password-sign-in", status: "BLOCKED" });
    if (signedIn) {
      await check("admin-ui-session-restoration", async () => {
        await evaluate("window.__uxi13bBeforeReload = true");
        await send("Page.reload", { ignoreCache: true });
        await wait("!window.__uxi13bBeforeReload && location.pathname === '/settings' && document.body.innerText.includes('Platform Admin verified')");
      });
      for (const [index, tenant] of manifest.tenants.entries()) await check(`admin-ui-shared-tenant-${index + 1}-detail`, async () => {
        await navigate(`${manifest.adminOrigin}/restaurant-details?id=${tenant.id}`);
        await wait(`document.body.innerText.includes('Restaurant profile') && document.body.innerText.includes(${JSON.stringify(tenant.id)})`);
      });
      await check("admin-ui-session-clear-protection", async () => {
        await send("Network.clearBrowserCookies"); await navigate(`${manifest.adminOrigin}/settings`);
        await wait("location.pathname === '/login' && !!document.querySelector('#admin-email')");
      });
    }
    for (const [index, tenant] of manifest.tenants.entries()) await check(`guest-ui-tenant-${index + 1}-shared-menu`, async () => {
      await navigate(guestUrl(manifest, tenant));
      await wait("!!document.querySelector('#menu-dishes .product-link')");
      const other = manifest.tenants.find(item => item.id !== tenant.id);
      if (tenant.productId && !await evaluate(`!!document.querySelector('a.product-link[href="/menu/${tenant.productId}"]')`)) throw new Error("SHARED_PRODUCT_NOT_RENDERED");
      if (other.productId && await evaluate(`!!document.querySelector('a.product-link[href="/menu/${other.productId}"]')`)) throw new Error("FOREIGN_PRODUCT_RENDERED");
    });
    for (const [index, tenant] of manifest.tenants.entries()) {
      if (!["COMMON_QR", "TABLE_QR"].every(kind => privateFixtures.some(fixture => fixture.restaurantId === tenant.id && fixture.kind === kind))) {
        checks.push({ name: `guest-ui-tenant-${index + 1}-table-and-common-qr-fixtures`, status: "BLOCKED" });
      }
    }
    for (const [index, fixture] of privateFixtures.entries()) await check(`guest-ui-private-qr-${index + 1}-capture-and-scrub`, async () => {
      const tenant = manifest.tenants.find(item => item.id === fixture.restaurantId);
      await navigate(guestUrl(manifest, tenant, fixture));
      await wait("location.hash === '' && !!document.querySelector('.qr-notice [role=status]') && document.querySelector('.qr-notice').innerText.includes('Your QR link is ready')");
      const expectedLabel = fixture.kind === "TABLE_QR" ? "Dine in" : "Takeaway / pickup";
      await wait(`!!document.querySelector('.ordering-context') && document.querySelector('.ordering-context').innerText.includes(${JSON.stringify(expectedLabel)})`);
      const exposed = await evaluate(`(() => { const token = ${JSON.stringify(fixture.qrToken)}; return document.documentElement.outerHTML.includes(token) || location.href.includes(token) || [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes(token))); })()`);
      if (exposed || capabilityInNetworkUrl) throw new Error("QR_CAPABILITY_EXPOSED");
    });
    await check("browser-network-local-only", async () => { if (foreignNetworkRequest) throw new Error("NONLOCAL_BROWSER_REQUEST_BLOCKED"); });
    await check("browser-qr-network-url-privacy", async () => { if (capabilityInNetworkUrl) throw new Error("QR_CAPABILITY_IN_NETWORK_URL"); });
  } catch { checks.push({ name: "browser-application-journey", status: "FAIL", code: "LOCAL_BROWSER_BOUNDARY_FAILED" }); }
  finally {
    if (browser) await check("task-owned-browser-profile-cleanup", () => browser.close());
  }
  return { acceptanceClass: "real-chrome-ui", status: checks.some(item => item.status === "FAIL") ? "FAIL"
    : checks.some(item => item.status === "BLOCKED") ? "BLOCKED" : "PASS", checks,
    missingBoundary: "Browser smoke verifies existing sign-in, shared tenant reads and QR capture; provisioning/bootstrap writes, checkout/payment and native installation retain their separate evidence classes." };
}

function provisioningFields(request) {
  const restaurant = request?.restaurant;
  if (!restaurant || !/^[^@\s]+@example\.test$/.test(request.ownerEmail ?? "")
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.ownerUserId ?? "")
      || !/^uxi13b-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(restaurant.slug ?? "")
      || !/^[A-Z]{3}$/.test(restaurant.currency ?? "")
      || ["name", "city", "township", "timezone"].some(key => typeof restaurant[key] !== "string" || !restaurant[key].trim())) {
    throw new Error("EXACT_SYNTHETIC_OWNER_AND_RESTAURANT_REQUIRED");
  }
  try { new Intl.DateTimeFormat("en", { timeZone: restaurant.timezone }); }
  catch { throw new Error("SYNTHETIC_RESTAURANT_TIMEZONE_REQUIRED"); }
  return { name: restaurant.name, slug: restaurant.slug, city: restaurant.city, township: restaurant.township,
    timezone: restaurant.timezone, currency: restaurant.currency, ownerEmail: request.ownerEmail, ownerUserId: request.ownerUserId };
}

/** Provision through the existing React review/confirm form; no alternate write API. */
async function runAdminProvisioning({ manifest, adminIdentity, authOrigin, request }, options = {}) {
  const origins = new Set([requireLocalAuth(manifest?.adminOrigin), requireLocalAuth(manifest?.apiOrigin), requireLocalAuth(authOrigin)]);
  if (manifest?.guestOrigin) origins.add(requireLocalAuth(manifest.guestOrigin));
  if (!/^[^@\s]+@example\.test$/.test(adminIdentity?.email ?? "") || typeof adminIdentity?.password !== "string" || !adminIdentity.password) {
    throw new Error("SYNTHETIC_LOCAL_IDENTITY_REQUIRED");
  }
  const fields = provisioningFields(request);
  const timeoutMs = options.timeoutMs ?? 45000;
  const checks = [];
  let browser, id, stage = "isolated-local-chrome";
  try {
    browser = await launchBrowser({ repository: options.repository ?? path.resolve(__dirname, ".."), chromePath: options.chromePath, timeoutMs, onChild: options.onChild });
    const { cdp } = browser;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send("Page.enable"); await send("Runtime.enable");
    let foreignNetworkRequest = false;
    cdp.on("Fetch.requestPaused", (params, session) => {
      if (session !== sessionId) return;
      const allowed = permittedBrowserUrl(params.request.url, origins);
      if (!allowed) foreignNetworkRequest = true;
      void send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", { requestId: params.requestId,
        ...(!allowed ? { errorReason: "BlockedByClient" } : {}) }).catch(() => undefined);
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error("BROWSER_EVALUATION_FAILED");
      return result.result?.value;
    };
    const wait = expression => waitForValue(() => evaluate(expression), timeoutMs);
    stage = "admin-provisioning-real-password-sign-in";
    await send("Page.navigate", { url: `${manifest.adminOrigin}/provisioning` });
    await wait("location.pathname === '/login' && !!document.querySelector('#admin-email') && !document.querySelector('#admin-email').disabled && Object.keys(document.querySelector('#admin-email')).some(key => key.startsWith('__reactProps$'))");
    await evaluate("document.querySelector('#admin-email').focus()"); await send("Input.insertText", { text: adminIdentity.email });
    await evaluate("document.querySelector('#admin-password').focus()"); await send("Input.insertText", { text: adminIdentity.password });
    await evaluate("document.querySelector('form.auth-form').requestSubmit()");
    await wait("location.pathname === '/provisioning' && !!document.querySelector('form.provision-form') && Object.keys(document.querySelector('form.provision-form')).some(key => key.startsWith('__reactProps$'))");
    checks.push({ name: stage, status: "PASS" });
    stage = "admin-provisioning-exact-owner-review";
    // These are uncontrolled form fields. Fill the actual controls, then use
    // their native submit/review handlers and the existing React server action.
    await evaluate(`(() => { const values = ${JSON.stringify(fields)}; for (const [name, value] of Object.entries(values)) { const control = document.querySelector('form.provision-form [name="' + name + '"]'); if (!control) throw new Error('Missing control'); control.value = value; control.dispatchEvent(new Event('input', {bubbles:true})); control.dispatchEvent(new Event('change', {bubbles:true})); } document.querySelector('form.provision-form').requestSubmit(); })()`);
    await wait(`!!document.querySelector('#review-title') && document.querySelector('.review-panel').innerText.includes(${JSON.stringify(fields.ownerUserId)}) && document.querySelector('.review-panel').innerText.includes(${JSON.stringify(fields.ownerEmail)}) && document.querySelector('.review-panel').innerText.includes(${JSON.stringify(fields.slug)}) && document.querySelector('.review-panel').innerText.includes('The existing Auth identity and confirmed email will be verified')`);
    checks.push({ name: stage, status: "PASS" });
    stage = "admin-provisioning-react-server-action-confirm";
    await wait("Array.from(document.querySelectorAll('.review-panel button')).some(button => button.textContent.trim() === 'Create restaurant' && !button.disabled)");
    await evaluate("Array.from(document.querySelectorAll('.review-panel button')).find(button => button.textContent.trim() === 'Create restaurant').click()");
    await wait("document.body.innerText.includes('Restaurant provisioned') && !!document.querySelector('a[href^=\"/restaurant-setup?id=\"]')");
    const setupHref = await evaluate("document.querySelector('a[href^=\"/restaurant-setup?id=\"]').getAttribute('href')");
    const setup = new URL(setupHref, manifest.adminOrigin);
    id = setup.searchParams.get("id");
    if (setup.origin !== manifest.adminOrigin || setup.pathname !== "/restaurant-setup" || setup.hash
        || [...setup.searchParams.keys()].length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "")
        || !await evaluate("document.body.innerText.includes('Auth contact confirmed; account setup must still be checked')")) throw new Error("PROVISIONING_RECEIPT_MISMATCH");
    checks.push({ name: stage, status: "PASS" });
    stage = "admin-provisioning-local-network-only";
    if (foreignNetworkRequest) throw new Error("NONLOCAL_BROWSER_REQUEST_BLOCKED");
    checks.push({ name: stage, status: "PASS" });
  } catch { checks.push({ name: stage, status: "FAIL", code: "LOCAL_ADMIN_PROVISIONING_FAILED" }); }
  finally {
    if (browser) {
      try { await browser.close(); checks.push({ name: "task-owned-provisioning-browser-cleanup", status: "PASS" }); }
      catch { checks.push({ name: "task-owned-provisioning-browser-cleanup", status: "FAIL" }); }
    }
  }
  const evidence = { acceptanceClass: "real-admin-provisioning-ui", status: id && checks.every(check => check.status === "PASS") ? "PASS" : "FAIL", checks,
    boundary: "Existing Owner UUID was submitted through the real review/confirm form; the API bridge must independently verify persisted Owner identity and onboarding state." };
  if (evidence.status !== "PASS") { const error = new Error("LOCAL_ADMIN_PROVISIONING_FAILED"); error.evidence = evidence; throw error; }
  return { id: id.toLowerCase(), evidence };
}

module.exports = { runBrowserJourney, runAdminProvisioning, provisioningFields, requireLocalAuth, guestUrl, permittedBrowserUrl, connectCdp, removeOwnedProfile, findChrome, launchBrowser };
