"use strict";

const { cpSync, mkdirSync, readdirSync, rmSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");

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
  "src/engine",
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

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
assets.forEach(copyAsset);
validateAssets(output);

console.log(`Built static site in ${output}`);
