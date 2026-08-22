(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function keyFromFeature(feature, property, type) {
    const value = feature && feature.properties ? feature.properties[property] : null;
    if (value == null || value === "") return null;
    if (type === "number") {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return String(value);
  }
  function nameFromFeature(feature, property) {
    const props = (feature && feature.properties) || {};
    return String(props[property] ?? props.NOM ?? props.name ?? "");
  }
  return { keyFromFeature, nameFromFeature };
});
