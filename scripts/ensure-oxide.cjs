#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- this is a CommonJS lifecycle
   script executed by npm (postinstall/predev/prebuild) before any tooling loads. */
/*
 * Self-healing install of the Tailwind CSS v4 native binding.
 *
 * Why: @tailwindcss/oxide-linux-x64-gnu@4.3.3 declares `"engines": { "node": ">= 20" }`
 * while this project also supports Node 18. npm treats an *optional* dependency whose
 * `engines` range does not match as "skip silently", so a plain `npm install` on
 * Node < 20 leaves the binding out and every page fails with
 *   Cannot find module '@tailwindcss/oxide-linux-x64-gnu'
 * (HTTP 500 from the global CSS import). Installing the package *explicitly* bypasses
 * the skip (npm only warns), and the prebuilt binary is N-API compatible with Node 18,
 * so it works. This script performs that explicit install whenever the binding that
 * the runtime resolver will actually load is missing.
 *
 * Runs from: npm postinstall / predev / prebuild. No-op on every other platform,
 * no-op when the binding resolves, and it never fails the parent command.
 */

const { execFileSync } = require("child_process");
const { createRequire } = require("module");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const pkgName = "@tailwindcss/oxide-linux-x64-gnu";
const oxideDir = path.join(projectRoot, "node_modules", "@tailwindcss", "oxide");
const pkgDir = path.join(projectRoot, "node_modules", "@tailwindcss", "oxide-linux-x64-gnu");

function log(msg) {
  console.log(`[ensure-oxide] ${msg}`);
}

function isGlibcLinuxX64() {
  if (process.platform !== "linux" || process.arch !== "x64") return false;
  try {
    const report = process.report.getReport();
    return Boolean(report.header.glibcVersionRuntime);
  } catch {
    return true; // assume glibc if the report is unavailable
  }
}

function resolves() {
  const resolveFrom = createRequire(path.join(oxideDir, "index.js"));
  try {
    resolveFrom.resolve(pkgName);
    return true;
  } catch {
    return false;
  }
}

try {
  if (isGlibcLinuxX64() && fs.existsSync(oxideDir) && !resolves()) {
    const version = JSON.parse(
      fs.readFileSync(path.join(oxideDir, "package.json"), "utf8")
    ).version;
    log(`native binding missing (npm skips it on Node ${process.version}); installing ${pkgName}@${version}`);
    execFileSync(
      "npm",
      ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", `${pkgName}@${version}`],
      { cwd: projectRoot, stdio: "inherit" }
    );
    // fs.existsSync is used as an additional signal because Node's CJS loader caches
    // module lookups for a few seconds, which can make resolves() stale right after
    // the install completes within this same process.
    if (resolves() || fs.existsSync(pkgDir)) log("native binding installed ✓");
    else log("binding still missing after install — the app may fail to compile CSS");
  }
} catch (err) {
  console.warn(`[ensure-oxide] could not auto-install the native binding: ${err.message}`);
  console.warn(`[ensure-oxide] fallback (run manually): npm i --no-save ${pkgName}@4.3.3`);
}
process.exit(0);
