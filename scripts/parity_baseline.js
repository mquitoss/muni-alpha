const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const config = require("../app.config.js");
const scoring = require("../vendor/tesela/src/engine/scoring.js");
const search = require("../vendor/tesela/src/engine/search.js");

const projectRoot = resolve(__dirname, "..");
const defaultBundlePath = resolve(projectRoot, "data/map_bundle.js");
const defaultBaselinePath = resolve(
  projectRoot,
  "tests/frontend/fixtures/munialpha-parity-v0.4.0.json",
);

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function readMapBundle(path = defaultBundlePath) {
  const source = readFileSync(path);
  const text = source.toString("utf8");
  const lines = text.trimEnd().split("\n");
  const prefix = "window.MUNIALPHA_DATA = ";
  const aliases = [
    "window.TESELA_DATA = window.MUNIALPHA_DATA;",
    "window.SSM_DATA = window.MUNIALPHA_DATA;",
  ];
  if (
    lines.length !== 3
    || !lines[0].startsWith(prefix)
    || !lines[0].endsWith(";")
    || lines[1] !== aliases[0]
    || lines[2] !== aliases[1]
  ) {
    throw new Error(`Bundle inválido: ${path}`);
  }
  return {
    bytes: source,
    data: JSON.parse(lines[0].slice(prefix.length, -1)),
  };
}

function scoringContract(configValue = config) {
  return {
    keyField: configValue.scoring.keyField,
    minCoverage: configValue.scoring.minCoverage,
    factors: configValue.scoring.factors.map(({ key, indicator, kind, sign }) => ({
      key,
      indicator,
      kind,
      sign,
    })),
    presets: configValue.scoring.presets.map(({ id, weights }) => ({ id, weights })),
  };
}

function buildScoringMatrix(indicators, preset, scoringConfig = config.scoring) {
  const byKey = new Map(
    scoring.computeScores(indicators, preset.weights, scoringConfig).map((result) => [
      String(result.key),
      result,
    ]),
  );
  const codes = indicators.map((row) => String(row[scoringConfig.keyField])).sort();
  return codes.map((code) => {
    const result = byKey.get(code);
    if (!result) throw new Error(`Falta el resultado de scoring para ${code}`);
    if (result.score != null && !Number.isFinite(result.score)) {
      throw new Error(`Score no finito para ${code}`);
    }
    if (!Number.isFinite(result.coverage)) throw new Error(`Cobertura no finita para ${code}`);
    return [result.score, result.coverage];
  });
}

function rankTopZones(features, matrix, codes, limit = 8) {
  const scoreByCode = new Map(codes.map((code, index) => [code, { score: matrix[index][0] }]));
  const zones = features.map((feature) => ({
    key: String(feature.properties.CODIMUNI),
    name: feature.properties.NOMMUNI,
  }));
  return search.searchZones(zones, "", {
    scoreFor: (zone) => scoreByCode.get(zone.key)?.score,
    keyFor: (zone) => zone.key,
    locale: "ca",
  }).slice(0, limit)
    .map((zone) => zone.key);
}

function buildParityBaseline(bundlePath = defaultBundlePath, configValue = config) {
  const { bytes, data } = readMapBundle(bundlePath);
  const features = data.geo.features;
  const codes = data.indicators.map((row) => String(row[configValue.scoring.keyField])).sort();
  const presets = {};

  for (const preset of configValue.scoring.presets) {
    const values = buildScoringMatrix(data.indicators, preset, configValue.scoring);
    const available = values.filter(([score]) => score != null).length;
    presets[preset.id] = {
      available,
      fullCoverage: values.filter(([, coverage]) => coverage === 1).length,
      partialCoverage: values.filter(([, coverage]) => coverage > 0 && coverage < 1).length,
      zeroCoverage: values.filter(([, coverage]) => coverage === 0).length,
      matrixHash: sha256Json(codes.map((code, index) => [code, ...values[index]])),
      topCodes: rankTopZones(features, values, codes),
      values,
    };
  }

  const presetOrder = configValue.scoring.presets.map((preset) => preset.id);
  return {
    schemaVersion: 1,
    applicationVersion: configValue.branding.version,
    bundle: {
      bytes: bytes.length,
      sha256: sha256Bytes(bytes),
      geometries: features.length,
      indicators: data.indicators.length,
      featurePropertyKeys: [...new Set(features.flatMap((feature) => Object.keys(feature.properties)))].sort(),
    },
    municipalityCodes: codes,
    scoringInputHash: sha256Json(scoringContract(configValue)),
    presetOrder,
    presets,
    matrixHash: sha256Json(presetOrder.map((id) => [id, presets[id].matrixHash])),
  };
}

function run(argv = process.argv.slice(2)) {
  const mode = argv[0] || "--check";
  const actual = buildParityBaseline();
  if (mode === "--write") {
    writeFileSync(defaultBaselinePath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
    return;
  }
  if (mode !== "--check") throw new Error("Uso: parity_baseline.js [--check|--write]");
  const expected = JSON.parse(readFileSync(defaultBaselinePath, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("El baseline de paridad ha cambiado; ejecuta los tests para ver el detalle");
  }
}

if (require.main === module) run();

module.exports = {
  buildParityBaseline,
  buildScoringMatrix,
  rankTopZones,
  readMapBundle,
  scoringContract,
  sha256Bytes,
  sha256Json,
};
