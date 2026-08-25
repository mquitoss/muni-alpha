import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageConfig = require("../../package.json");
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

  it("mantiene el motor local durante M2", () => {
    const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
    expect(html).toContain('src="src/engine/scoring.js"');
    expect(html).not.toContain('src="vendor/tesela/');
  });

  it("explica cómo inicializar un submódulo ausente", () => {
    expect(() => assertTeselaInitialized(resolve(projectRoot, "missing-tesela")))
      .toThrow("git submodule update --init --recursive");
  });
});
