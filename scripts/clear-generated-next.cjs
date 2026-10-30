"use strict";

const fs = require("node:fs");
const path = require("node:path");

const appName = process.argv[2];
if (appName !== "admin-web" && appName !== "guest-web") {
  throw new Error("Only the admin-web and guest-web build caches may be cleared");
}

const repositoryRoot = path.resolve(__dirname, "..");
const appsRoot = path.join(repositoryRoot, "apps");
const appRoot = path.join(appsRoot, appName);
const generatedDirectory = path.join(appRoot, ".next");

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.normalize(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

if (
  !samePath(fs.realpathSync(appsRoot), appsRoot) ||
  !samePath(fs.realpathSync(appRoot), appRoot) ||
  !samePath(fs.realpathSync(process.cwd()), appRoot) ||
  !samePath(path.dirname(generatedDirectory), appRoot) ||
  path.basename(generatedDirectory) !== ".next"
) {
  throw new Error("Refusing to clear a generated directory outside the selected web workspace");
}

let entry;
try {
  entry = fs.lstatSync(generatedDirectory);
} catch (error) {
  if (error.code === "ENOENT") process.exit(0);
  throw error;
}

if (!entry.isDirectory() || entry.isSymbolicLink()) {
  throw new Error("Refusing to clear a non-directory or linked .next path");
}

// Next.js 15 build output only. An unexpected top-level item may be user material.
const generatedEntries = new Set([
  "BUILD_ID",
  "app-build-manifest.json",
  "app-path-routes-manifest.json",
  "build-manifest.json",
  "cache",
  "diagnostics",
  "export-detail.json",
  "export-marker.json",
  "images-manifest.json",
  "next-minimal-server.js.nft.json",
  "next-server.js.nft.json",
  "package.json",
  "prerender-manifest.json",
  "react-loadable-manifest.json",
  "required-server-files.json",
  "routes-manifest.json",
  "server",
  "static",
  "trace",
  "types",
]);
const unexpected = fs.readdirSync(generatedDirectory).filter((name) => !generatedEntries.has(name));
if (unexpected.length > 0) {
  throw new Error(`Refusing to clear .next with unexpected entries: ${unexpected.join(", ")}`);
}

fs.rmSync(generatedDirectory, { recursive: true, maxRetries: 40, retryDelay: 250 });
if (fs.existsSync(generatedDirectory)) {
  throw new Error("Generated .next directory still exists after cleanup");
}
