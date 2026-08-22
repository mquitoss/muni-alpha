(function (root, factory) {
  const api = factory(typeof require === "function" ? require("./join.js") : root.SSM.engine);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function (names) {
  "use strict";

  function searchZones(zones, query, scoreFor = () => null) {
    const normalizedQuery = names.normalizeName(String(query).trim());
    return [...zones]
      .filter((zone) => !normalizedQuery || names.normalizeName(zone.name).includes(normalizedQuery))
      .sort((left, right) => {
        if (normalizedQuery) {
          const leftStarts = names.normalizeName(left.name).startsWith(normalizedQuery);
          const rightStarts = names.normalizeName(right.name).startsWith(normalizedQuery);
          if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        }
        return (scoreFor(right)?.score ?? -1) - (scoreFor(left)?.score ?? -1)
          || left.name.localeCompare(right.name, "ca");
      });
  }

  return { searchZones };
});
