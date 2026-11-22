"use strict";

// UXI-13 offline, synthetic configuration/JavaScript evidence only.
// Does not prebuild, sign, install, call an API, or edit active tenant records.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const evidence = __dirname;
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(EXPO_PUBLIC_|MOBILE_|CUSTOMER_|OPERATIONS_|EAS_|PUBLIC_API_BASE_URL$|PUBLIC_GUEST_BASE_URL$|RESTAURANT_SLUG$)/.test(key)) delete env[key];
}
Object.assign(env, {
  EXPO_NO_DOTENV: "1", EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1", CI: "1",
  OPERATIONS_NOTIFICATIONS_ENABLED: "false", CUSTOMER_NOTIFICATIONS_ENABLED: "false",
  MOBILE_SOURCE_REVISION: revision,
});
const results = [];
const plans = [];
for (const tenant of ["restaurant-a", "restaurant-b"]) {
  for (const kind of ["operations", "customer"]) {
    for (const profile of ["development", "staging", "production"]) {
      const args = ["scripts/mobile-build.cjs", "resolve", tenant, kind, profile, "--fixture"];
      const run = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", windowsHide: true });
      const name = `${tenant}-${kind}-${profile}`;
      fs.writeFileSync(path.join(evidence, `${name}.json`), run.stdout || "");
      if (run.stderr) fs.writeFileSync(path.join(evidence, `${name}.stderr.log`), run.stderr);
      const plan = run.status === 0 ? JSON.parse(run.stdout) : null;
      if (plan) plans.push(plan);
      results.push({ command: `node ${args.join(" ")}`, exitCode: run.status, error: run.error?.message || null });
      console.log(`${name}: ${run.status === 0 ? "PASS" : "FAIL"}`);
    }
  }
}
if (plans.length !== 12 || new Set(plans.map((p) => p.applicationId)).size !== 12 ||
    new Set(plans.map((p) => p.scheme)).size !== 12 ||
    plans.some((p) => p.sourceRevision !== revision || !/^sha256:[a-f0-9]{64}$/.test(p.fingerprint))) {
  throw new Error("Synthetic matrix identity/fingerprint verification failed");
}
fs.writeFileSync(path.join(evidence, "mobile-plan-summary.json"), JSON.stringify({ revision, plans, results }, null, 2));
if (process.argv.includes("--export")) {
  for (const tenant of ["restaurant-a", "restaurant-b"]) {
    for (const kind of ["operations", "customer"]) {
      const cwd = path.join(root, "apps", `${kind}-mobile`);
      const output = path.join(root, "target", "uxi-13-mobile", `${tenant}-${kind}`);
      const cli = require.resolve("expo/bin/cli", { paths: [cwd] });
      const args = [cli, "export", "--platform", "android", "--output-dir", output];
      const run = spawnSync(process.execPath, args, {
        cwd, env: { ...env, RESTAURANT_SLUG: tenant, MOBILE_ENV: "development" },
        encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      });
      const name = `${tenant}-${kind}-android-js-export`;
      fs.writeFileSync(path.join(evidence, `${name}.log`), (run.stdout || "") + (run.stderr || ""));
      results.push({
        command: `node expo/bin/cli export --platform android --output-dir target/uxi-13-mobile/${tenant}-${kind}`,
        tenant, kind, environment: "development", dotenv: false, notifications: false,
        exitCode: run.status, error: run.error?.message || null,
      });
      fs.writeFileSync(path.join(evidence, "mobile-check-results.json"), JSON.stringify({ revision, results }, null, 2));
      console.log(`${name}: ${run.status === 0 ? "PASS" : "FAIL"}`);
    }
  }
}
fs.writeFileSync(path.join(evidence, "mobile-check-results.json"), JSON.stringify({ revision, results }, null, 2));
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0;
