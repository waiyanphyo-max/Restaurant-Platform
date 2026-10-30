"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const appDirectory = process.cwd();
const packageJson = require(path.join(appDirectory, "package.json"));
if (!["@restaurant-platform/operations-mobile", "@restaurant-platform/customer-mobile"].includes(packageJson.name)) {
  throw new Error("build:starter must run from one of the two mobile app workspaces");
}

const cli = require.resolve("expo/bin/cli", { paths: [appDirectory] });
const result = spawnSync(process.execPath, [cli, "export", "--platform", "android", "--output-dir", "dist-starter"], {
  cwd: appDirectory,
  env: {
    ...process.env,
    MOBILE_ENV: "development",
    RESTAURANT_SLUG: "starter-fixture",
    PUBLIC_API_BASE_URL: "http://10.0.2.2:8080",
    EXPO_OFFLINE: "1",
    EXPO_NO_TELEMETRY: "1",
    CI: "1"
  },
  stdio: "inherit",
  windowsHide: true
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
