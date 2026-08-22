(function (root, factory) {
  const api = factory(typeof require === "function" ? require("./geo.js") : root.SSM.engine);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function (geo) {
  "use strict";
  function normalizeName(value) {
    return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/\s+/g, " ").replace(/^(?:els|les|el|la|l')\s*/, "");
  }
  function typed(value, type) {
    if (value == null) return null;
    return type === "number" ? Number(value) : String(value);
  }
  function joinByKey(geojson, indicators, config) {
    const cfg = config || {};
    const byKey = new Map();
    const byName = new Map();
    for (const row of indicators || []) {
      byKey.set(typed(row[cfg.keyField], cfg.type), row);
      if (cfg.nameFallback) byName.set(normalizeName(row[cfg.nameField]), row);
    }
    let matched = 0;
    let usedNameFallback = 0;
    const zones = (geojson.features || []).map((feature) => {
      const key = geo.keyFromFeature(feature, cfg.property, cfg.type);
      const name = geo.nameFromFeature(feature, cfg.nameProperty);
      let ind = byKey.get(key) || null;
      if (!ind && cfg.nameFallback) {
        ind = byName.get(normalizeName(name)) || null;
        if (ind) usedNameFallback += 1;
      }
      if (ind) matched += 1;
      return { key, name, feature, ind };
    });
    return { zones, matched, unmatched: zones.length - matched, usedNameFallback };
  }
  return { normalizeName, joinByKey };
});
