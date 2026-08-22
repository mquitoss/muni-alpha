(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DEFAULT_RAMP = [[34, 46, 48], [213, 178, 94], [126, 44, 54]];
  function rampColor(value, ramp = DEFAULT_RAMP) {
    const t = Math.max(0, Math.min(1, value));
    const position = t * (ramp.length - 1);
    const index = Math.floor(position);
    const fraction = position - index;
    const left = ramp[index];
    const right = ramp[Math.min(index + 1, ramp.length - 1)];
    return `rgb(${left.map((channel, i) => Math.round(channel + (right[i] - channel) * fraction)).join(",")})`;
  }
  function colorForValue(value, extent, ramp) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    const span = extent.max - extent.min;
    return rampColor(span ? (Number(value) - extent.min) / span : 0.5, ramp);
  }
  return { DEFAULT_RAMP, rampColor, colorForValue };
});
