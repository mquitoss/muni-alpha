(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const tesela = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = tesela;
  tesela.adapters = Object.assign(tesela.adapters || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function formatValue(engine, value, field = {}, ui = {}) {
    const numeric = typeof value !== "boolean" && Number.isFinite(Number(value));
    return engine.formatValue(value, {
      locale: ui.locale || "es-ES",
      sinDato: ui.noDataLabel || "sin dato",
      booleanLabels: ui.booleanLabels,
      durationLabels: ui.durationLabels,
      useGrouping: numeric && Math.abs(Number(value)) >= 10000,
      ...field,
    });
  }

  async function fetchCommonsImages(provider, subject, options = {}, fetcher = fetch) {
    const response = await fetcher(provider.buildCommonsUrl(subject, options));
    if (!response.ok) throw new Error(`Wikimedia Commons responded with ${response.status}`);
    return provider.selectCommonsImages(await response.json(), options);
  }

  return {
    derive: (indicator) => indicator,
    fetchCommonsImages,
    formatValue,
  };
});
