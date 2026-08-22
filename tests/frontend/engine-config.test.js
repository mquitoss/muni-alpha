import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = require("../../app.config.js");
const join = require("../../src/engine/join.js");
const scoring = require("../../src/engine/scoring.js");
const format = require("../../src/engine/format.js");
const projectRoot = process.cwd();

describe("motor agnóstico", () => {
  it("une códigos conservando ceros iniciales y null", () => {
    const geo = { type: "FeatureCollection", features: [{ properties: { CODIMUNI: "080018", NOMMUNI: "Abrera" } }] };
    const indicator = { municipality_code: "080018", value: null };
    const result = join.joinByKey(geo, [indicator], config.join);
    expect(result.matched).toBe(1);
    expect(result.zones[0].ind.value).toBeNull();
  });

  it("pondera solo factores disponibles y deja null sin cobertura", () => {
    const cfg = {
      keyField: "code",
      factors: [
        { key: "a", indicator: "a", sign: 1 },
        { key: "b", indicator: "b", sign: 1 },
      ],
    };
    const rows = [{ code: "1", a: 0, b: null }, { code: "2", a: 100, b: 100 }, { code: "3", a: null, b: null }];
    const result = scoring.computeScores(rows, { a: 1, b: 1 }, cfg);
    expect(result[0].contributions.b).toBeNull();
    expect(result[2].score).toBeNull();
    expect(result.every((item) => item.score == null || Number.isFinite(item.score))).toBe(true);
  });

  it("excluye un municipio que no alcanza la cobertura mínima configurada", () => {
    const cfg = {
      keyField: "code",
      minCoverage: 0.75,
      factors: [
        { key: "a", indicator: "a", sign: 1 },
        { key: "b", indicator: "b", sign: 1 },
      ],
    };
    const result = scoring.computeScores(
      [{ code: "1", a: 80, b: null }, { code: "2", a: 90, b: 90 }],
      { a: 1, b: 1 },
      cfg,
    );
    expect(result[0].coverage).toBe(0.5);
    expect(result[0].score).toBeNull();
    expect(result[1].coverage).toBe(1);
  });

  it("presenta booleanos y huecos en español", () => {
    expect(format.formatValue(true, { format: "boolean" })).toBe("Sí");
    expect(format.formatValue(null, { format: "number" })).toBe("sin dato");
  });

  it("presenta duraciones en horas y minutos legibles", () => {
    expect(format.formatValue(45, { format: "duration" })).toBe("45 min");
    expect(format.formatValue(60, { format: "duration" })).toBe("1 h");
    expect(format.formatValue(95, { format: "duration" })).toBe("1 h 35 min");
  });
});

describe("configuración MuniAlpha", () => {
  it("declara las siete tesis solicitadas", () => {
    expect(config.scoring.presets.map((preset) => preset.id)).toEqual([
      "equilibrado", "residencial", "crecimiento", "turistico", "calidad", "invierno", "senderismo",
    ]);
  });

  it("muestra el tiempo en coche a Barcelona en el detalle", () => {
    expect(config.detail.fields).toContainEqual(expect.objectContaining({
      key: "barcelona_access_drive_minutes",
      format: "duration",
    }));
  });

  it("prioriza esquí y paisaje en las nuevas tesis", () => {
    const presets = Object.fromEntries(config.scoring.presets.map((preset) => [preset.id, preset]));
    expect(presets.invierno.weights.esqui).toBe(1);
    expect(presets.senderismo.weights.paisaje).toBe(1);
  });

  it("no activa simultáneamente fortaleza y asequibilidad del mismo precio", () => {
    for (const preset of config.scoring.presets) {
      expect((preset.weights.mercado || 0) * (preset.weights.asequibilidad || 0)).toBe(0);
    }
  });

  it("mantiene HUT y riesgo como gates/indicadores fuera del score", () => {
    const inputs = config.scoring.factors.map((factor) => factor.indicator);
    expect(inputs.some((key) => key.includes("hut_feasibility"))).toBe(false);
    expect(inputs.some((key) => key.includes("natural_risk"))).toBe(false);
    expect(config.detail.notices.join(" ")).toMatch(/gate regulatorio/);
    expect(config.branding.notice).toMatch(/No constituye asesoramiento/);
  });
});

describe("build estático", () => {
  it("publica solo los recursos necesarios en dist", () => {
    execFileSync(process.execPath, [resolve(projectRoot, "scripts/build_static_site.js")]);

    expect(existsSync(resolve(projectRoot, "dist/index.html"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/data/map_bundle.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/src/engine/scoring.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/node_modules"))).toBe(false);
    expect(existsSync(resolve(projectRoot, "dist/.venv"))).toBe(false);

    const wrangler = JSON.parse(readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8"));
    expect(wrangler.build.command).toBe("npm run build");
    expect(wrangler.assets.directory).toBe("./dist");
  });
});
