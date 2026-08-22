(function (root) {
  "use strict";

  const factors = [
    ["mercado", "Fortaleza de precio", "sale_price_composite_score", 1, "Mercado"],
    ["asequibilidad", "Precio asequible", "sale_price_composite_score", -1, "Mercado"],
    ["momentum", "Crecimiento de precio", "sale_momentum_composite_score", 1, "Mercado"],
    ["alquiler", "Demanda de alquiler", "rental_price_composite_score", 1, "Mercado"],
    ["yield", "Rentabilidad bruta proxy", "yield_proxy_composite_score", 1, "Mercado"],
    ["liquidez", "Liquidez", "market_liquidity_composite_score", 1, "Mercado"],
    ["barcelona", "Acceso a Barcelona", "barcelona_access_composite_score", 1, "Accesibilidad"],
    ["esqui", "Acceso a esquí", "ski_access_composite_score", 1, "Accesibilidad"],
    ["costa", "Acceso a costa", "coast_access_composite_score", 1, "Accesibilidad"],
    ["paisaje", "Paisaje", "landscape_composite_score", 1, "Entorno"],
    ["turismo", "Demanda turística", "tourism_demand_composite_score", 1, "Entorno"],
    ["demografia", "Crecimiento demográfico", "demographic_composite_score", 1, "Fundamentales"],
    ["renta", "Renta local", "income_composite_score", 1, "Fundamentales"],
    ["servicios", "Servicios", "services_composite_score", 1, "Fundamentales"],
  ].map(([key, label, indicator, sign, group]) => ({
    key,
    label,
    indicator,
    sign,
    group,
    kind: "minmax",
    defaultWeight: 0.5,
  }));

  const config = {
    branding: {
      title: "MuniAlpha",
      subtitle: "Explorador municipal de inversión inmobiliaria · Cataluña",
      accent: "#e3b341",
      dataNamespace: "MUNIALPHA_DATA",
      notice:
        "Herramienta exploratoria basada en datos públicos. No constituye asesoramiento financiero, legal, fiscal ni urbanístico.",
    },
    map: {
      center: [41.72, 1.65],
      zoom: 8,
      tiles: {
        url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Geometría ICGC',
      },
    },
    join: {
      property: "CODIMUNI",
      keyField: "municipality_code",
      type: "string",
      nameFallback: false,
      nameProperty: "NOMMUNI",
      nameField: "municipality_name",
    },
    indicators: [],
    color: {
      metric: "score",
      ramp: [[126, 44, 54], [206, 104, 62], [213, 178, 94], [84, 138, 107], [34, 96, 78]],
      noData: { fillColor: "#d8d3c8", color: "#aaa398", dashArray: "2,3" },
    },
    scoring: {
      keyField: "municipality_code",
      factors,
      minCoverage: 0.65,
      slider: { min: 0, max: 1, step: 0.1 },
      presets: [
        { id: "equilibrado", label: "Equilibrado", weights: { mercado: 0.3, asequibilidad: 0, momentum: 0.5, alquiler: 0.5, yield: 0.6, liquidez: 0.6, barcelona: 0.4, esqui: 0.2, costa: 0.3, paisaje: 0.4, turismo: 0.3, demografia: 0.5, renta: 0.4, servicios: 0.5 } },
        { id: "residencial", label: "Rentabilidad residencial", weights: { mercado: 0, asequibilidad: 0.7, momentum: 0.3, alquiler: 0.9, yield: 1, liquidez: 0.8, barcelona: 0.5, esqui: 0, costa: 0.1, paisaje: 0.1, turismo: 0.1, demografia: 0.6, renta: 0.4, servicios: 0.6 } },
        { id: "crecimiento", label: "Crecimiento", weights: { mercado: 0.5, asequibilidad: 0, momentum: 1, alquiler: 0.5, yield: 0.3, liquidez: 0.7, barcelona: 0.4, esqui: 0.1, costa: 0.2, paisaje: 0.2, turismo: 0.4, demografia: 1, renta: 0.6, servicios: 0.5 } },
        { id: "turistico", label: "Turístico", weights: { mercado: 0, asequibilidad: 0.4, momentum: 0.4, alquiler: 0.2, yield: 0.4, liquidez: 0.4, barcelona: 0.2, esqui: 0.8, costa: 0.9, paisaje: 0.8, turismo: 1, demografia: 0.2, renta: 0.2, servicios: 0.4 } },
        { id: "calidad", label: "Calidad de vida", weights: { mercado: 0, asequibilidad: 0.5, momentum: 0.1, alquiler: 0.1, yield: 0.1, liquidez: 0.3, barcelona: 0.5, esqui: 0.3, costa: 0.5, paisaje: 1, turismo: 0.2, demografia: 0.5, renta: 0.7, servicios: 1 } },
        { id: "invierno", label: "Deportes de invierno", weights: { mercado: 0, asequibilidad: 0.2, momentum: 0, alquiler: 0, yield: 0, liquidez: 0, barcelona: 0.1, esqui: 1, costa: 0, paisaje: 0.4, turismo: 0.3, demografia: 0, renta: 0, servicios: 0.2 } },
        { id: "senderismo", label: "Senderismo", weights: { mercado: 0, asequibilidad: 0.2, momentum: 0, alquiler: 0, yield: 0, liquidez: 0, barcelona: 0.2, esqui: 0, costa: 0.2, paisaje: 1, turismo: 0.2, demografia: 0, renta: 0, servicios: 0.4 } },
      ],
      defaultPreset: "equilibrado",
    },
    detail: {
      notices: [
        "La viabilidad HUT es un gate regulatorio, no una señal económica. Un valor alto no garantiza una licencia; comprueba el planeamiento local.",
        "El riesgo natural es un indicador de revisión y no forma parte del índice. La cobertura de inundación puede estar incompleta.",
      ],
      fields: [
        { section: "Municipio", key: "comarca_name", label: "Comarca", format: "plain" },
        { key: "demographic_population_current", label: "Población", format: "number" },
        { section: "Accesibilidad", key: "barcelona_access_drive_minutes", label: "Tiempo en coche a Barcelona", format: "duration" },
        { section: "Mercado", key: "sale_price_score_0_100", label: "Precio de venta · score", format: "number", decimals: 1 },
        { key: "sale_price_confidence_0_100", label: "Precio de venta · confianza", format: "number" },
        { key: "sale_price_sale_price_eur_m2", label: "Precio observado", format: "number", decimals: 0, unit: "€/m²" },
        { key: "sale_momentum_score_0_100", label: "Momentum · score", format: "number", decimals: 1 },
        { key: "sale_momentum_confidence_0_100", label: "Momentum · confianza", format: "number" },
        { key: "rental_price_score_0_100", label: "Alquiler · score", format: "number", decimals: 1 },
        { key: "rental_price_confidence_0_100", label: "Alquiler · confianza", format: "number" },
        { key: "yield_proxy_score_0_100", label: "Rentabilidad proxy · score", format: "number", decimals: 1 },
        { key: "yield_proxy_gross_yield_proxy_pct", label: "Rentabilidad bruta proxy", format: "percent", decimals: 2 },
        { key: "yield_proxy_confidence_0_100", label: "Rentabilidad · confianza", format: "number" },
        { key: "market_liquidity_score_0_100", label: "Liquidez · score", format: "number", decimals: 1 },
        { key: "market_liquidity_confidence_0_100", label: "Liquidez · confianza", format: "number" },
        { section: "Crecimiento y entorno", key: "demographic_score_0_100", label: "Demografía · score", format: "number", decimals: 1 },
        { key: "demographic_confidence_0_100", label: "Demografía · confianza", format: "number" },
        { key: "demographic_cagr_5y_pct", label: "Población · CAGR 5 años", format: "percent", decimals: 2 },
        { key: "tourism_demand_score_0_100", label: "Turismo · score", format: "number", decimals: 1 },
        { key: "tourism_demand_confidence_0_100", label: "Turismo · confianza", format: "number" },
        { key: "landscape_score_0_100", label: "Paisaje · score", format: "number", decimals: 1 },
        { key: "landscape_confidence_0_100", label: "Paisaje · confianza", format: "number" },
        { key: "services_score_0_100", label: "Servicios · score", format: "number", decimals: 1 },
        { key: "services_confidence_0_100", label: "Servicios · confianza", format: "number" },
        { section: "Gates e indicadores", key: "hut_feasibility_score_0_100", label: "Viabilidad HUT · gate", format: "number", decimals: 0 },
        { key: "hut_feasibility_confidence_0_100", label: "HUT · confianza", format: "number" },
        { key: "hut_feasibility_local_regulation_checked", label: "Normativa local revisada", format: "boolean" },
        { key: "natural_risk_score_0_100", label: "Seguridad natural · indicador", format: "number", decimals: 1 },
        { key: "natural_risk_fire_safety_score", label: "Seguridad frente a incendio", format: "number", decimals: 1 },
        { key: "natural_risk_fire_red_flag", label: "Alerta de incendio", format: "boolean" },
        { key: "natural_risk_confidence_0_100", label: "Riesgo · confianza", format: "number" },
        { key: "natural_risk_risk_review_required", label: "Revisión de riesgo necesaria", format: "boolean" },
      ],
    },
  };

  root.SSM_CONFIG = config;
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof self !== "undefined" ? self : this);
