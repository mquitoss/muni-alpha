"use strict";

const { cpSync, mkdirSync, readdirSync, rmSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { assertTeselaInitialized } = require("./verify_tesela.js");

const root = resolve(__dirname, "..");
const output = join(root, "dist");
const maxAssetBytes = 25 * 1024 * 1024;
const assets = [
  "index.html",
  "favicon.svg",
  "app.config.js",
  "data/map_bundle.js",
  "src/app.js",
  "src/styles.css",
  "src/adapters",
  "vendor/tesela/src/engine/namespace.js",
  "vendor/tesela/src/engine/format.js",
  "vendor/tesela/src/engine/geo.js",
  "vendor/tesela/src/engine/join.js",
  "vendor/tesela/src/engine/search.js",
  "vendor/tesela/src/engine/scoring.js",
  "vendor/tesela/src/engine/color.js",
  "vendor/tesela/src/engine/bundle.js",
  "vendor/tesela/src/providers/wikimedia-commons.js",
];

function copyAsset(relativePath) {
  const source = join(root, relativePath);
  const destination = join(output, relativePath);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

function validateAssets(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      validateAssets(path);
    } else if (statSync(path).size > maxAssetBytes) {
      throw new Error(`Static asset exceeds Cloudflare's 25 MiB limit: ${path}`);
    }
  }
}

assertTeselaInitialized();
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
assets.forEach(copyAsset);
validateAssets(output);

console.log(`Built static site in ${output}`);
