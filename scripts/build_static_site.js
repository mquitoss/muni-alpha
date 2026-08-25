"use strict";

const {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} = require("node:fs");
const { gzipSync } = require("node:zlib");
const { dirname, isAbsolute, relative, resolve, sep } = require("node:path");

const projectRoot = resolve(__dirname, "..");
const cloudflareMaxAssetBytes = 25 * 1024 * 1024;
const buildBudgets = {
  maxTotalBytes: 9 * 1024 * 1024,
  maxTotalGzipBytes: 1.5 * 1024 * 1024,
  maxBundleBytes: 8 * 1024 * 1024,
};
const hostAssets = [
  "index.html",
  "favicon.svg",
  "app.config.js",
  "data/map_bundle.js",
  "src/styles.css",
  "src/adapters/domain.js",
];
const forbiddenSegments = new Set([".git", ".venv", "node_modules", "sources", "raw", "tests"]);

function assertSafeRelativePath(path) {
  const invalid = typeof path !== "string"
    || !path
    || path.includes("\0")
    || path.includes("\\")
    || isAbsolute(path)
    || /^[A-Za-z]:/.test(path)
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
  if (invalid) throw new Error(`Unsafe static asset path: ${String(path)}`);
}

function assertInside(root, path) {
  const relativePath = relative(root, path);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Static asset escapes its root: ${path}`);
  }
}

function assertNoSymlink(root, relativePath) {
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) throw new Error(`Missing static asset: ${relativePath}`);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Static assets cannot contain symlinks: ${relativePath}`);
    }
  }
}

function validateAsset(sourceRoot, path, maxAssetBytes) {
  assertSafeRelativePath(path);
  assertNoSymlink(sourceRoot, path);
  const source = resolve(sourceRoot, path);
  assertInside(sourceRoot, source);
  assertInside(realpathSync(sourceRoot), realpathSync(source));
  const stats = lstatSync(source);
  if (!stats.isFile()) throw new Error(`Static asset is not a file: ${path}`);
  if (stats.size > maxAssetBytes) {
    throw new Error(`Static asset exceeds ${maxAssetBytes} bytes: ${path}`);
  }
  return { path: source, size: stats.size };
}

function readManifest(teselaRoot) {
  const path = resolve(teselaRoot, "tesela.assets.json");
  if (!existsSync(path) || !existsSync(resolve(teselaRoot, "src/app.js"))) {
    throw new Error(
      "Tesela no está inicializado. Ejecuta: git submodule update --init --recursive",
    );
  }
  assertNoSymlink(teselaRoot, "tesela.assets.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const maxAssetBytes = manifest.limits?.maxAssetBytes;
  if (!Number.isInteger(maxAssetBytes) || maxAssetBytes <= 0
    || maxAssetBytes > cloudflareMaxAssetBytes) {
    throw new Error("tesela.assets.json contiene un límite de asset inválido");
  }
  return { manifest, maxAssetBytes };
}

function createInventory(root = projectRoot) {
  const teselaRoot = resolve(root, "vendor/tesela");
  const { manifest, maxAssetBytes } = readManifest(teselaRoot);
  const publicAssets = [
    ...(manifest.styles || []),
    ...(manifest.scripts?.runtime || []),
    ...(manifest.scripts?.engine || []),
    manifest.scripts?.entrypoint,
  ];
  if (publicAssets.some((path) => typeof path !== "string" || !path)) {
    throw new Error("tesela.assets.json contiene assets públicos inválidos");
  }
  const inventory = [
    ...hostAssets.map((path) => ({ sourceRoot: root, sourcePath: path, outputPath: path })),
    {
      sourceRoot: teselaRoot,
      sourcePath: "tesela.assets.json",
      outputPath: "vendor/tesela/tesela.assets.json",
    },
    ...publicAssets.map((path) => ({
      sourceRoot: teselaRoot,
      sourcePath: path,
      outputPath: `vendor/tesela/${path}`,
    })),
  ];
  const outputs = inventory.map(({ outputPath }) => outputPath);
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("El manifiesto de build contiene assets duplicados");
  }
  for (const item of inventory) {
    assertSafeRelativePath(item.outputPath);
    item.asset = validateAsset(item.sourceRoot, item.sourcePath, maxAssetBytes);
  }
  return { inventory, manifest, maxAssetBytes };
}

function localReferences(html) {
  return [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !/^(?:[a-z]+:|\/\/|#)/i.test(path))
    .map((path) => path.split(/[?#]/, 1)[0].replace(/^\.\//, ""));
}

function validateHtmlReferences(root, inventory) {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  const outputs = new Set(inventory.map(({ outputPath }) => outputPath));
  for (const path of localReferences(html)) {
    assertSafeRelativePath(path);
    if (!outputs.has(path)) throw new Error(`HTML references an unpublished asset: ${path}`);
  }
}

function listOutputFiles(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const outputPath = relative(root, path).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error(`dist cannot contain symlinks: ${outputPath}`);
    if ([...forbiddenSegments].some((segment) =>
      outputPath.split("/").some((part) => part.toLowerCase() === segment.toLowerCase()))) {
      throw new Error(`Forbidden path published in dist: ${outputPath}`);
    }
    if (entry.isDirectory()) files.push(...listOutputFiles(root, path));
    else if (entry.isFile()) files.push(outputPath);
    else throw new Error(`Unsupported entry in dist: ${outputPath}`);
  }
  return files.sort();
}

function validateOutput(output, inventory, maxAssetBytes) {
  const expected = inventory.map(({ outputPath }) => outputPath).sort();
  const actual = listOutputFiles(output);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("dist does not match the exact public asset inventory");
  }
  let totalBytes = 0;
  let totalGzipBytes = 0;
  for (const path of actual) {
    const asset = validateAsset(output, path, maxAssetBytes);
    const contents = readFileSync(asset.path);
    totalBytes += asset.size;
    totalGzipBytes += gzipSync(contents).length;
    if (path === "data/map_bundle.js" && asset.size > buildBudgets.maxBundleBytes) {
      throw new Error(`Map bundle exceeds its ${buildBudgets.maxBundleBytes} byte budget`);
    }
  }
  if (totalBytes > buildBudgets.maxTotalBytes) {
    throw new Error(`Static site exceeds its ${buildBudgets.maxTotalBytes} byte budget`);
  }
  if (totalGzipBytes > buildBudgets.maxTotalGzipBytes) {
    throw new Error(`Compressed static site exceeds its ${buildBudgets.maxTotalGzipBytes} byte budget`);
  }
  return { files: actual.length, totalBytes, totalGzipBytes };
}

function build({ root = projectRoot, output = resolve(root, "dist") } = {}) {
  const { inventory, maxAssetBytes } = createInventory(root);
  validateHtmlReferences(root, inventory);

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const item of inventory) {
    const destination = resolve(output, item.outputPath);
    assertInside(output, destination);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(item.asset.path, destination);
  }
  const metrics = validateOutput(output, inventory, maxAssetBytes);
  return { output, assets: inventory.map(({ outputPath }) => outputPath), ...metrics };
}

if (require.main === module) {
  const result = build();
  console.log(
    `Built ${result.files} assets in ${result.output} `
      + `(${result.totalBytes} bytes, ${result.totalGzipBytes} gzip bytes)`,
  );
}

module.exports = {
  assertSafeRelativePath,
  build,
  buildBudgets,
  createInventory,
  listOutputFiles,
  localReferences,
  validateAsset,
  validateHtmlReferences,
  validateOutput,
};
