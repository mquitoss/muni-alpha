import { describe, expect, it } from "vitest";

const scoring = require("../../src/engine/scoring.js");
const search = require("../../src/engine/search.js");
const expectedBaseline = require("./fixtures/munialpha-parity-v0.4.0.json");
const scoringCases = require("./fixtures/scoring-cases.json");
const searchCases = require("./fixtures/search-cases.json");
const { buildParityBaseline } = require("../../scripts/parity_baseline.js");

describe("baseline de paridad MuniAlpha 0.4.0", () => {
  it("congela bundle, scoring, cobertura y rankings de los siete presets", () => {
    const actual = buildParityBaseline();
    expect(actual.bundle).toEqual(expectedBaseline.bundle);
    expect(actual.scoringInputHash).toBe(expectedBaseline.scoringInputHash);
    expect(actual.presetOrder).toEqual(expectedBaseline.presetOrder);
    expect(actual.matrixHash).toBe(expectedBaseline.matrixHash);

    for (const presetId of actual.presetOrder) {
      const expected = expectedBaseline.presets[presetId];
      const received = actual.presets[presetId];
      expect(received.matrixHash, presetId).toBe(expected.matrixHash);
      expect(received.topCodes, presetId).toEqual(expected.topCodes);
      expect(received.values, presetId).toEqual(expected.values);
    }
  });

  it("cubre registros completos, parciales y sin cobertura con nombres neutrales", () => {
    const actual = scoring.computeScores(
      scoringCases.records,
      scoringCases.weights,
      scoringCases.config,
    );
    expect(actual.map(({ key, score, coverage }) => ({ id: key, score, coverage })))
      .toEqual(scoringCases.expected);
    expect(actual[2].contributions.factor_c).toBeNull();
    expect(actual[3].contributions).toBeNull();
    expect(actual[4].contributions).toBeNull();
  });

  it.each(searchCases.cases)("congela búsqueda normalizada: $query", ({ query, expected }) => {
    const results = search.searchZones(
      searchCases.zones,
      query,
      (zone) => ({ score: zone.score }),
    );
    expect(results.map((zone) => zone.name)).toEqual(expected);
  });
});
