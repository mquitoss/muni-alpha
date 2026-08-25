import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const {
  assertSafeRelativePath,
  build,
  buildBudgets,
  createInventory,
  listOutputFiles,
  localReferences,
  validateAsset,
} = require("../../scripts/build_static_site.js");

const temporaryPaths = [];
const temporaryDirectory = (prefix) => {
  const path = mkdtempSync(resolve(tmpdir(), prefix));
  temporaryPaths.push(path);
  return path;
};

afterEach(() => {
  while (temporaryPaths.length) rmSync(temporaryPaths.pop(), { recursive: true, force: true });
});

describe("build estático seguro", () => {
  it.each([
    "../secret",
    "/absolute",
    "C:\\secret",
    "foo\\..\\secret",
    "./asset.js",
    "foo//asset.js",
    "foo/../asset.js",
    "",
  ])("rechaza la ruta insegura %j", (path) => {
    expect(() => assertSafeRelativePath(path)).toThrow("Unsafe static asset path");
  });

  it("rechaza symlinks, directorios y assets que exceden el límite", () => {
    const root = temporaryDirectory("munialpha-assets-");
    writeFileSync(resolve(root, "valid.js"), "ok", "utf8");
    symlinkSync("valid.js", resolve(root, "linked.js"));
    mkdirSync(resolve(root, "directory"));
    writeFileSync(resolve(root, "large.js"), "", "utf8");
    truncateSync(resolve(root, "large.js"), 11);

    expect(validateAsset(root, "valid.js", 10).size).toBe(2);
    expect(() => validateAsset(root, "linked.js", 10)).toThrow("symlinks");
    expect(() => validateAsset(root, "directory", 10)).toThrow("not a file");
    expect(() => validateAsset(root, "large.js", 10)).toThrow("exceeds");
  });

  it("publica exactamente el inventario declarado dentro de los presupuestos", () => {
    const output = resolve(temporaryDirectory("munialpha-dist-"), "dist");
    const result = build({ output });
    const inventory = createInventory();

    expect(result.assets).toContain("vendor/tesela/tesela.assets.json");
    expect(result.assets).not.toContain(
      `vendor/tesela/${inventory.manifest.scripts.defaultAdapter}`,
    );
    expect(listOutputFiles(output)).toEqual([...result.assets].sort());
    expect(result.totalBytes).toBeLessThanOrEqual(buildBudgets.maxTotalBytes);
    expect(result.totalGzipBytes).toBeLessThanOrEqual(buildBudgets.maxTotalGzipBytes);
    expect(inventory.maxAssetBytes).toBe(25 * 1024 * 1024);
  });

  it("conserva el dist anterior cuando falla el preflight", () => {
    const root = temporaryDirectory("munialpha-invalid-build-");
    const output = resolve(root, "dist");
    mkdirSync(output);
    const marker = resolve(output, "existing.txt");
    writeFileSync(marker, "keep", "utf8");

    expect(() => build({ root, output })).toThrow("submodule update --init --recursive");
    expect(existsSync(marker)).toBe(true);
  });

  it("extrae referencias locales sin confundir recursos externos", () => {
    const html = [
      '<script src="./app.js?v=1"></script>',
      '<link href="styles.css#theme" rel="stylesheet">',
      '<script src="https://cdn.example/app.js"></script>',
      '<a href="#content">Contenido</a>',
    ].join("");
    expect(localReferences(html)).toEqual(["app.js", "styles.css"]);
  });
});
