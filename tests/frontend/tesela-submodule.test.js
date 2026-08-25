import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageConfig = require("../../package.json");
const assetManifest = require("../../vendor/tesela/tesela.assets.json");
const {
  assertTeselaInitialized,
  verifyTesela,
} = require("../../scripts/verify_tesela.js");
const projectRoot = process.cwd();

describe("submódulo Tesela", () => {
  it("fija el gitlink y los metadatos a v0.3.0", () => {
    expect(verifyTesela()).toEqual({
      version: packageConfig.tesela.version,
      tag: "v0.3.0",
      commit: "824caa0fb73b5bd540468c12452eadeda2d5bd04",
      url: "https://github.com/mquitoss/tesela.git",
    });
  });

  it("carga el shell Tesela completo y conserva el adaptador de dominio host", () => {
    const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
    const vendorScripts = scripts.filter((path) => path.startsWith("vendor/tesela/"));
    expect(vendorScripts).toEqual([
      ...assetManifest.scripts.runtime,
      ...assetManifest.scripts.engine,
      assetManifest.scripts.entrypoint,
    ].map((path) => `vendor/tesela/${path}`));
    expect(html).toContain('href="vendor/tesela/src/ui/tesela.css"');
    expect(html).toContain('src="src/adapters/domain.js"');
    expect(html).toContain('src="vendor/tesela/src/app.js"');
    expect(html).not.toContain('src="src/engine/');
    expect(html).not.toContain('src="src/app.js"');
    expect(html).not.toContain(`src="vendor/tesela/${assetManifest.scripts.defaultAdapter}"`);
  });

  it("explica cómo inicializar un submódulo ausente", () => {
    expect(() => assertTeselaInitialized(resolve(projectRoot, "missing-tesela")))
      .toThrow("git submodule update --init --recursive");
  });
});
