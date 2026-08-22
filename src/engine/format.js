(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function formatValue(value, field = {}) {
    if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return "sin dato";
    if (field.format === "boolean") return value === true ? "Sí" : value === false ? "No" : "sin dato";
    if (field.format === "duration") {
      const totalMinutes = Math.round(Number(value));
      if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "sin dato";
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0) return `${minutes} min`;
      if (minutes === 0) return `${hours} h`;
      return `${hours} h ${minutes} min`;
    }
    if (field.format === "number" || field.format === "percent") {
      const decimals = field.decimals ?? (field.format === "percent" ? 1 : 0);
      const text = Number(value).toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      if (field.format === "percent") return `${text}%`;
      return field.unit ? `${text} ${field.unit}` : text;
    }
    return String(value);
  }
  return { formatValue };
});
