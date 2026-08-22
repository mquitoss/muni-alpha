(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.adapters = Object.assign(ssm.adapters || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return { derive: (indicator) => indicator };
});
