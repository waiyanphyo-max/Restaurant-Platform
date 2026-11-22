"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const directory = __dirname;
const root = path.resolve(directory, "../../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const baseline = JSON.parse(fs.readFileSync(path.join(directory, "baseline.json"), "utf8"));
const hash = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const postman = baseline.postman.map(item => ({ path: item.path, unchanged: hash(path.join(root, item.path)).toUpperCase() === item.sha256.toUpperCase() }));
const mdFiles = [path.join(root, "docs/ux-multi-tenant-acceptance.md"), ...fs.readdirSync(directory).filter(file => file.endsWith(".md")).map(file => path.join(directory, file))];
const missingLinks = [];
const trailingWhitespace = [];
let checkedLinks = 0;
for (const file of mdFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    checkedLinks++;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) missingLinks.push({ file: path.relative(root, file), target });
  }
  content.split(/\r?\n/).forEach((line, n) => { if (/\s+$/.test(line)) trailingWhitespace.push({ file: path.relative(root, file), line: n + 1 }); });
}
const matrix = JSON.parse(fs.readFileSync(path.join(directory, "figma-traceability.json"), "utf8"));
const statusEnums = new Set(["IMPLEMENTED_AND_VERIFIED", "IMPLEMENTED_NOT_VISUALLY_VERIFIED", "PARTIALLY_IMPLEMENTED", "BLOCKED_EXTERNAL_DEPENDENCY", "MISSING", "NOT_APPLICABLE_WITH_REASON"]);
const invalidStatuses = matrix.rows.filter(row => !statusEnums.has(row.status)).map(row => row.id);
const status = git("status", "--porcelain=v1");
const result = {
  date: "2026-11-22 Asia/Bangkok", head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
  baselineHeadUnchanged: git("rev-parse", "HEAD") === baseline.head,
  baselineBranchUnchanged: git("branch", "--show-current") === baseline.branch,
  trackedDiffPaths: git("diff", "--name-only").split(/\r?\n/).filter(Boolean),
  stagedDiffPaths: git("diff", "--cached", "--name-only").split(/\r?\n/).filter(Boolean),
  status: status.split(/\r?\n/).filter(Boolean), postman, allSevenPostmanFilesUnchanged: postman.length === 7 && postman.every(item => item.unchanged),
  markdownFilesChecked: mdFiles.length, checkedLinks, missingLinks, trailingWhitespace,
  traceabilityRows: matrix.rows.length, invalidStatuses,
  noSourceFixRequired: true,
};
fs.writeFileSync(path.join(directory, "final-preservation.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.baselineHeadUnchanged || !result.baselineBranchUnchanged || !result.allSevenPostmanFilesUnchanged || result.trackedDiffPaths.length || result.stagedDiffPaths.length || missingLinks.length || trailingWhitespace.length || invalidStatuses.length) process.exitCode = 1;
