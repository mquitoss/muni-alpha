(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function minmax(values) {
    const valid = values.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
    if (!valid.length) return values.map(() => null);
    const low = Math.min(...valid);
    const high = Math.max(...valid);
    return values.map((value) => {
      if (value == null || !Number.isFinite(Number(value))) return null;
      return high === low ? 0.5 : (Number(value) - low) / (high - low);
    });
  }
  function computeScores(indicators, weights, config) {
    const cfg = config || {};
    const factors = cfg.factors || [];
    const activeWeight = factors.reduce(
      (sum, factor) => sum + Math.max(0, Number(weights[factor.key]) || 0),
      0,
    );
    const minCoverage = Math.max(0, Math.min(1, Number(cfg.minCoverage) || 0));
    const normalized = new Map();
    for (const factor of factors) {
      normalized.set(factor.key, minmax(indicators.map((row) => row[factor.indicator])));
    }
    const raw = indicators.map((row, index) => {
      const contributions = {};
      let total = 0;
      let availableWeight = 0;
      for (const factor of factors) {
        const weight = Math.max(0, Number(weights[factor.key]) || 0);
        const value = normalized.get(factor.key)[index];
        if (value == null || weight === 0) {
          contributions[factor.key] = null;
          continue;
        }
        const contribution = (factor.sign === -1 ? -1 : 1) * weight * value;
        contributions[factor.key] = contribution;
        total += contribution;
        availableWeight += weight;
      }
      const coverage = activeWeight ? availableWeight / activeWeight : 0;
      return {
        key: row[cfg.keyField || "codi"] ?? null,
        value: availableWeight && coverage >= minCoverage ? total / availableWeight : null,
        coverage,
        contributions,
      };
    });
    const scaled = minmax(raw.map((item) => item.value));
    return raw.map((item, index) => ({
      key: item.key,
      score: scaled[index] == null ? null : Math.round(scaled[index] * 100),
      scoreN: scaled[index],
      coverage: item.coverage,
      contributions: item.value == null ? null : item.contributions,
    }));
  }
  return { minmax, computeScores };
});
