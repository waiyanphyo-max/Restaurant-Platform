"use strict";
// Runs the existing built-Next contract fixture and local browser checks,
// then lets its own cleanup remove temporary synthetic registry records.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const directory = __dirname;
const root = path.resolve(directory, "../../..");
const logFile = path.join(directory, "guest-production-smoke.log");
const smokeLog = fs.createWriteStream(logFile);
const startedUtc = new Date().toISOString();
const smoke = spawn(process.execPath, ["apps/guest-web/scripts/smoke-production.mjs"], {
  cwd: root, windowsHide: true, env: { ...process.env, GUEST_SMOKE_PREVIEW: "true" }, stdio: ["pipe", "pipe", "pipe"],
});
let output = "";
let exitCode;
let ready;
let rejectReady;
const readiness = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
for (const stream of [smoke.stdout, smoke.stderr]) stream.on("data", chunk => {
  output += chunk.toString(); smokeLog.write(chunk);
  if (output.includes("Synthetic browse preview is ready.")) ready();
});
const closed = new Promise(resolve => smoke.on("close", code => {
  exitCode = code; rejectReady(new Error(`Guest smoke stopped before preview: ${code}`));
  smokeLog.end(resolve);
}));
smoke.on("error", rejectReady);
async function main() {
  await readiness;
  // Publish complete ready output before browser-qa reads the origin lines.
  await new Promise(resolve => smokeLog.write("", resolve));
  console.log("Existing built-app HTTP smoke passed; inspecting synthetic browser routes.");
  const browserLog = fs.createWriteStream(path.join(directory, "guest-browser.log"));
  const browser = spawn(process.execPath, [path.join(directory, "browser-qa.cjs"), "--guest"], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [browser.stdout, browser.stderr]) stream.on("data", chunk => { browserLog.write(chunk); process.stdout.write(chunk); });
  const browserExit = await new Promise(resolve => browser.on("close", resolve));
  await new Promise(resolve => browserLog.end(resolve));
  smoke.stdin.end("\n");
  await closed;
  const summary = { startedUtc, finishedUtc: new Date().toISOString(), httpSmokeExit: exitCode, browserExit, smokeSummary: /Production HTTP smoke passed:[^\r\n]+/.exec(output)?.[0], cleanupCompleted: exitCode === 0 };
  fs.writeFileSync(path.join(directory, "guest-command-result.json"), JSON.stringify(summary, null, 2));
  if (exitCode !== 0 || browserExit !== 0) process.exitCode = 1;
}
main().catch(async error => {
  console.error(error);
  if (smoke.exitCode === null) smoke.stdin.end("\n");
  await closed;
  fs.writeFileSync(path.join(directory, "guest-command-result.json"), JSON.stringify({ startedUtc, finishedUtc: new Date().toISOString(), httpSmokeExit: exitCode, error: error.message }, null, 2));
  process.exitCode = 1;
});
