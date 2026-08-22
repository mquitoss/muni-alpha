(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function isValidBundle(bundle) {
    return Boolean(bundle && bundle.geo && bundle.geo.type === "FeatureCollection" && bundle.geo.features.length && Array.isArray(bundle.indicators) && bundle.indicators.length);
  }
  function selectDataSource(candidates = {}) {
    for (const source of ["embedded", "url", "upload"]) {
      if (isValidBundle(candidates[source])) return { source, bundle: candidates[source] };
    }
    return { source: "none", bundle: null };
  }
  return { isValidBundle, selectDataSource };
});
