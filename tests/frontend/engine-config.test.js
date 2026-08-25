import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const config = require("../../app.config.js");
const packageConfig = require("../../package.json");
const join = require("../../vendor/tesela/src/engine/join.js");
const search = require("../../vendor/tesela/src/engine/search.js");
const media = require("../../vendor/tesela/src/providers/wikimedia-commons.js");
const scoring = require("../../vendor/tesela/src/engine/scoring.js");
const format = require("../../vendor/tesela/src/engine/format.js");
const color = require("../../vendor/tesela/src/engine/color.js");
const adapters = require("../../src/adapters/domain.js");
const { readMapBundle } = require("../../scripts/parity_baseline.js");
const projectRoot = process.cwd();

function legacyFormatValue(value, field = {}) {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return "sin dato";
  if (field.format === "boolean") return value === true ? "Sí" : value === false ? "No" : "sin dato";
  if (field.format === "duration") {
    const totalMinutes = Math.round(Number(value));
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "sin dato";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
  }
  if (field.format === "number" || field.format === "percent") {
    const decimals = field.decimals ?? (field.format === "percent" ? 1 : 0);
    const text = Number(value).toLocaleString("es-ES", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (field.format === "percent") return `${text}%`;
    return field.unit ? `${text} ${field.unit}` : text;
  }
  return String(value);
}

describe("motor agnóstico", () => {
  it("une códigos conservando ceros iniciales y null", () => {
    const geo = { type: "FeatureCollection", features: [{ properties: { CODIMUNI: "080018", NOMMUNI: "Abrera" } }] };
    const indicator = { municipality_code: "080018", value: null };
    const result = join.joinByKey(geo, [indicator], config.join);
    expect(result.matched).toBe(1);
    expect(result.zones[0].ind.value).toBeNull();
  });

  it("une exactamente los 947 municipios sin duplicados ni fallback", () => {
    const { data } = readMapBundle();
    const result = join.joinByKey(data.geo, data.indicators, config.join);
    expect(result.zones).toHaveLength(947);
    expect(result.matched).toBe(947);
    expect(result.unmatched).toBe(0);
    expect(result.usedNameFallback).toBe(0);
    expect(result.duplicateIndicatorKeys).toEqual([]);
    expect(result.zones.every((zone) => /^\d{6}$/.test(zone.key))).toBe(true);
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
    expect(adapters.formatValue(format, true, { format: "boolean" }, config.ui)).toBe("Sí");
    expect(adapters.formatValue(format, null, { format: "number" }, config.ui)).toBe("sin dato");
  });

  it("presenta duraciones en horas y minutos legibles", () => {
    expect(adapters.formatValue(format, 45, { format: "duration" }, config.ui)).toBe("45 min");
    expect(adapters.formatValue(format, 60, { format: "duration" }, config.ui)).toBe("1 h");
    expect(adapters.formatValue(format, 95, { format: "duration" }, config.ui)).toBe("1 h 35 min");
  });

  it("conserva la rampa cromática explícita", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map((value) =>
      color.colorForValue(value, { min: 0, max: 1 }, config.color.ramp)))
      .toEqual([
        "rgb(126,44,54)",
        "rgb(206,104,62)",
        "rgb(213,178,94)",
        "rgb(84,138,107)",
        "rgb(34,96,78)",
      ]);
  });

  it("mantiene todos los formatos visibles del motor anterior", () => {
    const { data } = readMapBundle();
    for (const field of config.detail.fields) {
      for (const indicator of data.indicators) {
        const value = indicator[field.key];
        expect(adapters.formatValue(format, value, field, config.ui), field.key)
          .toBe(legacyFormatValue(value, field));
      }
    }
  });

  it("busca sin acentos ni artículos y prioriza coincidencias iniciales", () => {
    const zones = [
      { name: "Móra d'Ebre" },
      { name: "Sant Mori" },
      { name: "Móra la Nova" },
    ];
    const options = { locale: "ca" };
    expect(search.searchZones(zones, "mora", options).map((zone) => zone.name)).toEqual([
      "Móra d'Ebre", "Móra la Nova",
    ]);
    expect(search.searchZones([{ name: "l'Hospitalet de Llobregat" }], "hospitalet", options)).toHaveLength(1);
  });
});

describe("configuración MuniAlpha", () => {
  it("mantiene una única versión semántica visible", () => {
    expect(config.branding.version).toBe(packageConfig.version);
    expect(config.branding.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("publica TESELA_CONFIG como configuración primaria", () => {
    const context = { self: {} };
    runInNewContext(readFileSync(resolve(projectRoot, "app.config.js"), "utf8"), context);
    expect(context.self.TESELA_CONFIG).toBe(context.self.SSM_CONFIG);
    expect(context.self.TESELA_CONFIG.branding.version).toBe(packageConfig.version);
  });

  it("configura referencias y etiquetas municipales por nivel de zoom", () => {
    expect(config.map.referenceTiles.url).toContain("only_labels");
    expect(config.map.municipalityLabels.minZoom).toBeGreaterThan(config.map.zoom);
    expect(config.map.comarcaCapitals).toHaveLength(44);
  });

  it("documenta todos los campos y el proceso de datos", () => {
    expect(config.detail.fields.every((field) => field.help?.length > 20)).toBe(true);
    expect(config.detail.glossaryIntro).toMatch(/0 a 100/);
    expect(config.methodology.sources.length).toBeGreaterThanOrEqual(4);
    expect(config.methodology.steps).toHaveLength(6);
  });

  it("normaliza artículos y acentos para buscar municipios", () => {
    expect(join.normalizeName("l'Hospitalet de Llobregat")).toBe("hospitalet de llobregat");
    expect(join.normalizeName("Móra d'Ebre")).toBe("mora d'ebre");
  });

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

describe("fotografías de Wikimedia Commons", () => {
  it("construye una búsqueda geográfica alrededor del municipio", () => {
    const url = new URL(media.buildCommonsUrl(
      { name: "Vic", lat: 41.93, lon: 2.25 },
      { ...config.detail.photos, searchLimit: 12 },
    ));
    expect(url.hostname).toBe("commons.wikimedia.org");
    expect(url.searchParams.get("generator")).toBe("geosearch");
    expect(url.searchParams.get("ggscoord")).toBe("41.93|2.25");
    expect(url.searchParams.get("ggslimit")).toBe("12");
  });

  it("selecciona fotografías y descarta mapas o formatos no fotográficos", () => {
    const image = (title, mime) => ({
      title,
      imageinfo: [{
        mime,
        thumburl: `https://upload.wikimedia.org/${encodeURIComponent(title)}.jpg`,
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Town.jpg",
        extmetadata: {
          Artist: { value: "<b>Autora &amp; Co.</b>" },
          LicenseShortName: { value: "CC BY-SA 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
        },
      }],
    });
    const payload = { query: { pages: {
      1: image("File:Plaça major.jpg", "image/jpeg"),
      2: image("File:Map of town.jpg", "image/jpeg"),
      3: image("File:Escut.svg", "image/svg+xml"),
      4: image("File:Entorn natural.webp", "image/webp"),
      5: image("File:001 Plaça major.jpg", "image/jpeg"),
    } } };

    const selected = media.selectCommonsImages(payload, config.detail.photos);
    expect(selected.map((photo) => photo.title)).toEqual(["Plaça major", "Entorn natural"]);
    expect(selected[0].author).toBe("Autora & Co.");
    expect(selected[0].license).toBe("CC BY-SA 4.0");
    expect(media.titleSignature("001 Plaça major (Vic).jpg")).toBe("placa major");
    expect(media.safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(media.safeExternalUrl("//creativecommons.org/licenses/by/4.0/")).toMatch(/^https:/);
  });

  it("carga fotografías mediante el provider Tesela sin bloquear el shell", async () => {
    const fetcher = async (url) => ({
      ok: true,
      json: async () => ({ query: { pages: {} } }),
      url,
    });
    await expect(adapters.fetchCommonsImages(
      media,
      { name: "Vic", lat: 41.93, lon: 2.25 },
      config.detail.photos,
      fetcher,
    )).resolves.toEqual([]);
  });
});

describe("build estático", () => {
  it("publica solo los recursos necesarios en dist", () => {
    execFileSync(process.execPath, [resolve(projectRoot, "scripts/build_static_site.js")]);

    expect(existsSync(resolve(projectRoot, "dist/index.html"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/data/map_bundle.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/vendor/tesela/src/engine/scoring.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/vendor/tesela/src/providers/wikimedia-commons.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/src/engine"))).toBe(false);
    expect(existsSync(resolve(projectRoot, "dist/node_modules"))).toBe(false);
    expect(existsSync(resolve(projectRoot, "dist/.venv"))).toBe(false);
    const publishedBundle = readFileSync(resolve(projectRoot, "dist/data/map_bundle.js"));
    const versionedBundle = readFileSync(resolve(projectRoot, "data/map_bundle.js"));
    expect(publishedBundle.equals(versionedBundle)).toBe(true);
    const publishedHtml = readFileSync(resolve(projectRoot, "dist/index.html"), "utf8");
    const localScripts = [...publishedHtml.matchAll(/<script src="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => !path.startsWith("http"));
    expect(localScripts.every((path) => existsSync(resolve(projectRoot, "dist", path)))).toBe(true);

    const wrangler = JSON.parse(readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8"));
    expect(wrangler.build.command).toBe("npm run build");
    expect(wrangler.assets.directory).toBe("./dist");
  });
});
