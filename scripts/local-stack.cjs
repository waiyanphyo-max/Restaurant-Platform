"use strict";

// Disposable Supabase CLI workspace; no hosted commands, resets, or PID-file killing.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { fetch, AbortSignal } = globalThis;
const ROOT = path.resolve(__dirname, "..");
const WORK = path.join(ROOT, ".local-integration");
const PROJECT = "restaurant-platform-uxi13b";
const PORTS = { guest: 3000, admin: 3001, api: 8080, gateway: 54321, database: 54322,
  studio: 54323, mail: 54324, analytics: 54327, inspector: 8083 };
const cli = path.join(ROOT, "node_modules/supabase/dist/supabase.js");
const cliBinary = process.platform === "win32" ? path.join(ROOT, "node_modules/@supabase/cli-windows-x64/bin/supabase.exe") : null;
function privateJson(value) {
  try { return JSON.parse(value); } catch { throw new Error("Local private JSON is invalid; inspect it without printing credentials"); }
}
const readJson = (file) => privateJson(fs.readFileSync(file, "utf8"));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });

function command(file, args, { env = process.env, input, cwd = ROOT, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = globalThis.setTimeout(() => {
      if (process.platform === "win32" && child.exitCode === null) spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else child.kill();
      reject(new Error("Local command timed out"));
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { globalThis.clearTimeout(timer); reject(error); });
    child.once("close", (code) => { globalThis.clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(input);
  });
}
const supabase = (args, options) => cliBinary && fs.existsSync(cliBinary)
  ? command(cliBinary, [...args, "--workdir", WORK], options)
  : command(process.execPath, [cli, ...args, "--workdir", WORK], options);
async function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(() => resolve(true)));
  });
}
function javaBinary(env = process.env) {
  return env.JAVA_HOME ? path.join(env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
}
function mavenProbe() {
  const configured = process.env.MAVEN_CMD ?? (process.env.MAVEN_HOME ? path.join(process.env.MAVEN_HOME, "bin/mvn.cmd") : "mvn.cmd");
  if (process.platform !== "win32") return command("mvn", ["--version"]);
  if (/["&|<>^%\r\n]/.test(configured)) throw new Error("Unsafe Maven command path");
  return command("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", "& $env:MAVEN_CMD --version"], { env: { ...process.env, MAVEN_CMD: configured } });
}
function migrationInventory() {
  return fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => ({ name, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "supabase/migrations", name))).digest("hex") }));
}
function assertStatus(status) {
  if (status.API_URL !== `http://127.0.0.1:${PORTS.gateway}` ||
      !/^postgresql:\/\/[^/@]+:[^/@]+@127\.0\.0\.1:54322\/postgres$/.test(status.DB_URL)) throw new Error("Refusing non-disposable Supabase endpoints");
  const api = new URL(status.API_URL);
  const db = new URL(status.DB_URL);
  if (api.origin !== `http://127.0.0.1:${PORTS.gateway}` || api.username || api.password || api.pathname !== "/" || api.search || api.hash ||
      db.protocol !== "postgresql:" || db.hostname !== "127.0.0.1" || db.port !== String(PORTS.database) ||
      db.pathname !== "/postgres" || db.search || db.hash) throw new Error("Refusing non-disposable Supabase endpoints");
  return status;
}
function assertOwned() {
  const state = readJson(path.join(WORK, "owner.json"));
  if (fs.realpathSync(WORK) !== WORK || state.project !== PROJECT || state.root !== ROOT || state.disposable !== true) {
    throw new Error("Disposable workspace ownership mismatch");
  }
  if (JSON.stringify(state.migrations) !== JSON.stringify(migrationInventory())) throw new Error("Source migrations changed; inspect before reusing disposable state");
  for (const migration of state.migrations) {
    const copy = fs.readFileSync(path.join(WORK, "supabase/migrations", migration.name));
    if (crypto.createHash("sha256").update(copy).digest("hex") !== migration.sha256) throw new Error("Disposable migration copy changed");
  }
  const configFile = path.join(WORK, "supabase/config.toml");
  if (fs.existsSync(configFile) && !fs.readFileSync(configFile, "utf8").includes(`project_id = "${PROJECT}"`)) throw new Error("Disposable CLI project mismatch");
  return state;
}
async function preflight() {
  let reusedInfrastructure = false;
  if (fs.existsSync(path.join(WORK, "owner.json"))) {
    assertOwned();
    const existing = await supabase(["status", "-o", "json"], { timeout: 30000 });
    if (!existing.code) { assertStatus(privateJson(existing.stdout)); reusedInfrastructure = true; }
  }
  const probes = await Promise.allSettled([
    command("docker", ["version", "--format", "{{.Server.Os}}"]),
    command(javaBinary(), ["-version"]), command(process.execPath, [cli, "--version"]),
    ...Object.entries(PORTS).map(async ([name, port]) => ({ name, port, free: await portFree(port) }))
  ]);
  const checks = probes.map((probe, index) => {
    if (index >= 3) return probe.status === "fulfilled" ? { ...probe.value,
      status: probe.value.free || (reusedInfrastructure && !["guest", "admin", "api"].includes(probe.value.name)) ? "PASS" : "BLOCKED",
      ...(reusedInfrastructure && !["guest", "admin", "api"].includes(probe.value.name) ? { detail: "Reusing verified task-owned CLI infrastructure" } : {}) } : { status: "BLOCKED" };
    const name = ["docker-linux-engine", "java-21", "supabase-cli"][index];
    if (probe.status !== "fulfilled") return { name, status: "BLOCKED", detail: "Command unavailable or inaccessible" };
    const result = probe.value;
    const text = result.stdout + result.stderr;
    const passed = result.code === 0 && (index === 0 ? result.stdout.trim() === "linux" : index === 1 ? /version "21[."]/.test(text) : /\d+\.\d+\.\d+/.test(result.stdout));
    return { name, status: passed ? "PASS" : "BLOCKED", detail: passed ? (index === 0 ? "Linux engine reachable" : index === 1 ? "Java 21" : result.stdout.trim()) : "Check tool availability/permissions; no system changes made" };
  });
  let maven;
  try { maven = await mavenProbe(); } catch { maven = { code: 1, stdout: "" }; }
  checks.push({ name: "maven", status: maven.code === 0 && /Apache Maven 3\./.test(maven.stdout) ? "PASS" : "BLOCKED", detail: "Use existing Maven on PATH or set MAVEN_CMD to its full mvn.cmd path" });
  checks.push({ name: "npm-workspaces", status: fs.existsSync(path.join(ROOT, "node_modules/next/dist/bin/next")) && fs.existsSync(cli) ? "PASS" : "BLOCKED" });
  return { status: checks.every((check) => check.status === "PASS") ? "PASS" : "BLOCKED", checks };
}
async function prepare() {
  if (fs.existsSync(WORK)) {
    const state = assertOwned();
    if (state.ready) {
      if (!fs.existsSync(path.join(WORK, "supabase/signing_keys.json")) || !fs.existsSync(path.join(WORK, "supabase/config.toml"))) throw new Error("Owned local configuration is incomplete");
      return;
    }
  } else {
  // Never attach to volumes from an unknown earlier stack, even when their ports are free.
  const volumes = await command("docker", ["volume", "ls", "--format", "{{.Name}}"]);
  const containers = await command("docker", ["ps", "-a", "--format", "{{.Names}}"]);
  if (volumes.code || containers.code || (volumes.stdout + containers.stdout).includes(PROJECT)) throw new Error("Cannot establish fresh disposable workspace ownership");
  fs.mkdirSync(path.join(WORK, "supabase/migrations"), { recursive: true });
  writeJson(path.join(WORK, "owner.json"), { project: PROJECT, root: ROOT, disposable: true, migrations: migrationInventory() });
  for (const migration of migrationInventory()) fs.copyFileSync(path.join(ROOT, "supabase/migrations", migration.name), path.join(WORK, "supabase/migrations", migration.name));
  }
  const config = fs.readFileSync(path.join(ROOT, "supabase/config.toml"), "utf8")
    .replace(/^project_id = .+$/m, `project_id = "${PROJECT}"`)
    .replace(/^# signing_keys_path = .+$/m, 'signing_keys_path = "./signing_keys.json"')
    .replace(/^site_url = .+$/m, 'site_url = "http://localhost:3001"')
    .replace(/^additional_redirect_urls = .+$/m, 'additional_redirect_urls = ["http://localhost:3001/auth/callback", "http://localhost:3001/auth/accept-invite"]')
    .replace(/^sql_paths = \["\.\/seed.sql"\]$/m, "sql_paths = []");
  // Keep the existing CLI services, migrations, PostgreSQL 17, Auth, Storage and local mail.
  // Generate with the existing CLI before enabling the signing key file in its config.
  fs.writeFileSync(path.join(WORK, "supabase/config.toml"), config.replace(/^signing_keys_path = .+$/m, "# signing_keys_path generated below"));
  if (!fs.existsSync(path.join(WORK, "supabase/signing_keys.json"))) {
    const generated = await supabase(["gen", "signing-key", "--algorithm", "ES256"]);
    if (generated.code) throw new Error("Supabase signing-key generation failed; no credentials printed");
    const keys = privateJson(generated.stdout);
    writeJson(path.join(WORK, "supabase/signing_keys.json"), Array.isArray(keys) ? keys : [keys]);
  }
  fs.writeFileSync(path.join(WORK, "supabase/config.toml"), config);
  writeJson(path.join(WORK, "owner.json"), { ...assertOwned(), ready: true });
}
async function infrastructure() {
  assertOwned();
  const started = await supabase(["start", "--exclude", "studio,postgres-meta,edge-runtime,logflare,vector"], { timeout: 1200000 });
  if (started.code) {
    // Do not print CLI stdout: successful services may have emitted secret keys.
    const safeLines = started.stderr.split(/\r?\n/).filter((line) => /error|failed|unhealthy|denied|not found|pull access|connect/i.test(line))
      .filter((line) => !/eyJ|sb_secret_|password|token|JWT|key/i.test(line));
    console.error(safeLines.slice(-8).map((line) => line.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL redacted]")).join("\n"));
    throw new Error("Supabase CLI start failed; inspect the component before retrying (no reset performed)");
  }
  const result = await supabase(["status", "-o", "json"]);
  if (result.code) throw new Error("Local Supabase status unavailable");
  return assertStatus(privateJson(result.stdout));
}
async function sql(input) {
  assertOwned();
  const result = await command("docker", ["exec", "-i", `supabase_db_${PROJECT}`, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres", "-At"], { input });
  if (result.code) throw new Error("Disposable database verification failed (SQL/credentials withheld)");
  return result.stdout;
}
async function trustedPrincipal() {
  const password = crypto.randomBytes(32).toString("hex");
  // This role exists only in the separately named task-owned disposable database.
  await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='uxi13b_server') THEN CREATE ROLE uxi13b_server LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS; END IF; END $$;
ALTER ROLE uxi13b_server PASSWORD '${password}';
GRANT USAGE ON SCHEMA public, auth TO uxi13b_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uxi13b_server;
REVOKE UPDATE, DELETE ON restaurant_bootstrap_steps FROM uxi13b_server;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uxi13b_server;
GRANT SELECT (id, email, raw_user_meta_data, deleted_at, banned_until) ON auth.users TO uxi13b_server;
GRANT UPDATE (updated_at) ON auth.users TO uxi13b_server;
`);
  const version = (await sql("SHOW server_version_num;")).trim();
  if (Number(version) < 170000 || Number(version) >= 180000) throw new Error("Disposable database must be PostgreSQL 17");
  const privileges = (await sql("SELECT rolsuper || '|' || rolbypassrls || '|' || has_column_privilege('uxi13b_server','auth.users','updated_at','UPDATE') FROM pg_roles WHERE rolname='uxi13b_server';")).trim();
  if (privileges !== "false|true|true") throw new Error("Local trusted database role or Auth row-lock grant is incorrect");
  const applied = (await sql("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")).trim().split(/\r?\n/);
  if (JSON.stringify(applied) !== JSON.stringify(migrationInventory().map(item => item.name.slice(0, 14)))) throw new Error("Local CLI migration ledger does not match source order");
  return { password, version, migrations: applied.length };
}
async function waitFor(url, child, expected = 200) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error("Task-owned application exited before readiness");
    try { const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) }); if (response.status === expected) return; } catch { /* bounded startup */ }
    await delay(500);
  }
  throw new Error("Application readiness timed out");
}
function application(file, args, env) {
  const child = spawn(file, args, { cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  // Consume logs privately: Spring/Next/SDK output is not acceptance evidence.
  child.stdout.resume(); child.stderr.resume();
  child.on("error", () => {});
  return child;
}
function systemEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|Path|PATHEXT|SYSTEMROOT|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|USERPROFILE|LOCALAPPDATA|APPDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/.test(name)));
}
async function connectivityChecks(adminId) {
  const checks = [];
  const health = await fetch("http://127.0.0.1:8080/actuator/health", { signal: AbortSignal.timeout(5000) });
  if (health.status !== 200 || (await health.json()).status !== "UP") throw new Error("Local API health failed");
  checks.push({ name: "spring-health-and-database-startup", status: "PASS" });
  const origins = [`http://localhost:3001`, `http://127.0.0.1:3001`,
    `http://uxi13b-a-${adminId}.localhost:3000`, `http://uxi13b-b-${adminId}.localhost:3000`];
  for (const [index, origin] of origins.entries()) {
    const response = await fetch("http://127.0.0.1:8080/api/v1/my/restaurants", { method: "OPTIONS", signal: AbortSignal.timeout(5000),
      headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" } });
    if (![200, 204].includes(response.status) || response.headers.get("access-control-allow-origin") !== origin) throw new Error("Reviewed local API CORS origin failed");
    checks.push({ name: `spring-reviewed-cors-origin-${index + 1}`, status: "PASS" });
  }
  const denied = await fetch("http://127.0.0.1:8080/api/v1/my/restaurants", { method: "OPTIONS", signal: AbortSignal.timeout(5000),
    headers: { Origin: "http://uxi13b-unconfigured.localhost:3000", "Access-Control-Request-Method": "GET" } });
  if (denied.status !== 403 || denied.headers.has("access-control-allow-origin")) throw new Error("Unreviewed local CORS origin was accepted");
  checks.push({ name: "spring-unreviewed-cors-origin-denied", status: "PASS" });
  return { status: "PASS", checks };
}
function serverEnvironment(status, principal, adminId, encryptionKey) {
  assertStatus(status);
  return { ...systemEnvironment(), SUPABASE_DB_URL: `jdbc:postgresql://127.0.0.1:${PORTS.database}/postgres`,
    SUPABASE_DB_USERNAME: "uxi13b_server", SUPABASE_DB_PASSWORD: principal.password,
    SUPABASE_AUTH_ISSUER: `${status.API_URL}/auth/v1`, SUPABASE_JWKS_URL: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
    SUPABASE_PROJECT_URL: status.API_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    SUPABASE_ALLOW_LOCAL_IDENTITY_LOOKUP: "true", PLATFORM_ADMIN_USER_IDS: adminId,
    SUPABASE_INVITE_REDIRECT_URL: "", APP_PUSH_FIREBASE_ENABLED: "false",
    APP_IDEMPOTENCY_ENCRYPTION_KEY: encryptionKey, PORT: String(PORTS.api),
    SERVER_ADDRESS: "127.0.0.1", APP_SECURITY_JWT_SIGNING_ALGORITHM: "ES256",
    APP_CORS_ALLOWED_ORIGINS: `http://127.0.0.1:3001,http://localhost:3001,http://uxi13b-a-${adminId}.localhost:3000,http://uxi13b-b-${adminId}.localhost:3000`,
    LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_WEB_SERVLET_DISPATCHERSERVLET: "INFO" };
}
function webEnvironment(status) {
  // Construct an allowlisted environment; privileged server/Auth/database keys are never inherited by Next.
  const env = systemEnvironment();
  return { ...env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", APP_STAGE: "local", ADMIN_WEB_ORIGIN: "http://localhost:3001",
    NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8080", GUEST_API_BASE_URL: "http://127.0.0.1:8080", GUEST_CONFIG_ENV: "staging", GUEST_LOCAL_ROUTING: "true",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    GUEST_LOCAL_INTEGRATION_REGISTRY: path.join(WORK, "guest-registry.json") };
}
async function up({ once = false } = {}) {
  const report = await preflight();
  if (report.status !== "PASS") { console.log(JSON.stringify(report, null, 2)); throw new Error("Local preflight blocked; resolve dependencies/port conflicts first"); }
  await prepare();
  console.log("Starting/reusing task-owned disposable Supabase services (CLI output kept private).");
  const status = await infrastructure();
  if (!status.PUBLISHABLE_KEY?.startsWith("sb_publishable_")) throw new Error("CLI did not supply the public publishable key required by the existing applications");
  const storage = await require("./local-storage-check.cjs").verifyLocalStorage({ authOrigin: status.API_URL,
    serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY, publishableKey: status.PUBLISHABLE_KEY });
  const principal = await trustedPrincipal();
  const secretsFile = path.join(WORK, "server-secrets.json");
  if (!fs.existsSync(secretsFile)) writeJson(secretsFile, { encryptionKey: crypto.randomBytes(32).toString("base64") });
  const { encryptionKey } = readJson(secretsFile);
  if (typeof encryptionKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey)) throw new Error("Invalid task-owned encryption key");
  const { prepareIdentities, runApiJourney } = require("./local-api-journey.cjs");
  const identities = await prepareIdentities({ authOrigin: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY, anonKey: status.PUBLISHABLE_KEY });
  const children = [];
  let stopping;
  const stopApps = () => stopping ??= (async () => {
    for (const child of [...children].reverse()) if (child.exitCode === null) {
      // Live child handles only: no stale PID files, image-name or port-based killing.
      if (process.platform === "win32") await command("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]);
      else child.kill();
    }
  })();
  const onSignal = () => { void stopApps().then(() => process.exit(0)); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  try {
    const jar = path.join(ROOT, "app/api/target/restaurant-platform-persistence-0.0.1-SNAPSHOT.jar");
    if (!fs.existsSync(jar)) throw new Error("Build backend with Maven verify before local:up");
    const sources = fs.readdirSync(path.join(ROOT, "app/api/src/main"), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
      .map(entry => path.join(entry.parentPath, entry.name));
    if (sources.some(file => fs.statSync(file).mtimeMs > fs.statSync(jar).mtimeMs)) throw new Error("Backend source is newer than the jar; rerun Maven verify");
    const api = application(javaBinary(), ["-jar", jar], serverEnvironment(status, principal, identities.admin.id, encryptionKey)); children.push(api);
    await waitFor("http://127.0.0.1:8080/actuator/health", api);
    const connectivity = await connectivityChecks(identities.admin.id);
    const next = path.join(ROOT, "node_modules/next/dist/bin/next");
    const env = webEnvironment(status);
    const admin = application(process.execPath, [next, "dev", "apps/admin-web", "--hostname", "127.0.0.1", "--port", "3001"], env); children.push(admin);
    await waitFor("http://127.0.0.1:3001/login", admin);
    const uiProvisioning = [];
    const journey = await runApiJourney({ apiOrigin: "http://127.0.0.1:8080", identities,
      provisionRestaurant: async request => {
        const result = await require("./local-browser-journey.cjs").runAdminProvisioning({
          manifest: { adminOrigin: "http://localhost:3001", apiOrigin: "http://127.0.0.1:8080" },
          authOrigin: status.API_URL, adminIdentity: identities.admin, request
        }, { onChild: child => children.push(child) });
        uiProvisioning.push(result.evidence);
        return { id: result.id };
      },
      guestOrigins: { a: "http://restaurant-a.localhost:3000", b: "http://restaurant-b.localhost:3000" } });
    const manifest = journey.manifest;
    writeJson(path.join(WORK, "guest-registry.json"), { schemaVersion: 1, purpose: "UXI-13B disposable local integration", tenants: manifest.tenants.map((tenant) => ({
      schemaVersion: 1, fixture: true, slug: tenant.slug, restaurantId: tenant.id,
      branding: { displayName: tenant.name, primaryColor: tenant.currency === "MMK" ? "#9B2226" : "#234D3C" },
      guestDomains: { staging: [tenant.host], production: [`${tenant.slug}.invalid`] },
      android: Object.fromEntries(["operations", "customer"].map((kind) => [kind, { displayName: `Local ${kind}`, stagingApplicationId: `dev.uxi13b.${tenant.slug.replaceAll("-", "")}.${kind}.staging`, productionApplicationId: `dev.uxi13b.${tenant.slug.replaceAll("-", "")}.${kind}` }]))
    })) });
    const guest = application(process.execPath, [next, "dev", "apps/guest-web", "--hostname", "127.0.0.1", "--port", "3000"], env); children.push(guest);
    await waitFor("http://127.0.0.1:3000/", guest, 404);
    const { runWebJourney } = require("./local-web-journey.cjs");
    const web = await runWebJourney({ ...manifest, apiOrigin: "http://127.0.0.1:8080", adminOrigin: "http://localhost:3001", guestOrigin: "http://127.0.0.1:3000" }, {
      publicAuth: { url: status.API_URL, publishableKey: status.PUBLISHABLE_KEY, session: identities.admin.session, expectedUserId: identities.admin.id },
      privateFixtures: journey.privateFixtures
    });
    const browser = await require("./local-browser-journey.cjs").runBrowserJourney({
      manifest: { ...manifest, apiOrigin: "http://127.0.0.1:8080", adminOrigin: "http://localhost:3001", guestOrigin: "http://127.0.0.1:3000" },
      adminIdentity: identities.admin, privateFixtures: journey.privateFixtures, authOrigin: status.API_URL
    }, { onChild: child => children.push(child) });
    const evidence = { status: [web, browser, storage].every(result => result.status === "PASS") ? "PASS" : "FAIL", completedAt: new Date().toISOString(), database: { version: principal.version, role: "uxi13b_server", superuser: false, bypassRls: true, migrations: principal.migrations },
      api: manifest.evidence ?? journey.evidence, connectivity, uiProvisioning, web, browser, storage,
      entrypoints: { admin: "http://localhost:3001", api: "http://127.0.0.1:8080", guests: manifest.tenants.map(tenant => ({ id: tenant.id, origin: `http://${tenant.host}:3000`, productId: tenant.productId })) },
      boundary: "Real local Auth/Admin UI provisioning/Spring/Guest HTTP and bounded browser smoke; installed native acceptance separate" };
    writeJson(path.join(WORK, "result.json"), evidence);
    console.log(JSON.stringify(evidence, null, 2));
    if (once) return evidence;
    console.log("Local applications running. Ctrl+C stops only these application children; local:stop stops the task-owned Supabase stack and retains data.");
    await new Promise((resolve) => children.forEach((child) => child.once("exit", resolve)));
    throw new Error("A task-owned server exited");
  } finally { process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal); await stopApps(); }
}
async function main() {
  const mode = process.argv[2] ?? "preflight";
  if (mode === "preflight") { const result = await preflight(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === "PASS" ? 0 : 1; }
  else if (mode === "prepare") { await prepare(); console.log("Disposable CLI workspace prepared; no services started."); }
  else if (mode === "infra") { await prepare(); await infrastructure(); console.log("Disposable Supabase services healthy; credentials withheld."); }
  else if (mode === "up") { const result = await up({ once: process.argv.includes("--once") }); if (result?.status !== "PASS") process.exitCode = 1; }
  else if (mode === "stop") { assertOwned(); const result = await supabase(["stop"]); if (result.code) throw new Error("Task-owned Supabase stop failed"); console.log("Stopped task-owned Supabase services; disposable volumes retained."); }
  else throw new Error("Use preflight | prepare | infra | up [--once] | stop");
}
module.exports = { assertStatus, privateJson, migrationInventory, preflight, serverEnvironment, webEnvironment, PORTS, PROJECT };
if (require.main === module) main().catch((error) => {
  if (process.argv[2] === "up") {
    try { assertOwned(); writeJson(path.join(WORK, "result.json"), { status: "FAIL", code: "LOCAL_INTEGRATION_FAILED", ...(error.evidence ? { browser: error.evidence } : {}) }); }
    catch { /* A failed ownership check must not write to an unverified directory. */ }
  }
  console.error(error.message); process.exitCode = 1;
});
