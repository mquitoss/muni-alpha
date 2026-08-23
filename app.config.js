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
      version: "0.4.0",
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
      referenceTiles: {
        url: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
      municipalityLabels: { minZoom: 11 },
      comarcaCapitals: [
        "Valls", "Figueres", "Vilafranca del Penedès", "la Seu d'Urgell", "el Pont de Suert",
        "Igualada", "Manresa", "Reus", "Tortosa", "la Bisbal d'Empordà",
        "Sant Feliu de Llobregat", "el Vendrell", "Barcelona", "Berga", "Puigcerdà",
        "Montblanc", "Vilanova i la Geltrú", "les Borges Blanques", "Olot", "Girona",
        "Prats de Lluçanès", "Mataró", "Moià", "Amposta", "Balaguer", "Vic", "Tremp",
        "Sort", "Mollerussa", "Banyoles", "Falset", "Móra d'Ebre", "Ripoll", "Cervera",
        "Lleida", "Santa Coloma de Farners", "Solsona", "Tarragona", "Gandesa", "Tàrrega",
        "Vielha e Mijaran", "Sabadell", "Terrassa", "Granollers",
      ],
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
    methodology: {
      summary:
        "MuniAlpha combina 15 datasets municipales reproducibles. Prioriza fuentes públicas y oficiales, conserva los valores ausentes y documenta cobertura, confianza y periodo de referencia.",
      sources: [
        { name: "IDESCAT y datos abiertos de la Generalitat", role: "Catálogo municipal, población, renta, turismo y registros administrativos." },
        { name: "Agència de l'Habitatge de Catalunya", role: "Compraventas, precios y contratos de alquiler publicados a escala municipal." },
        { name: "ICGC y cartografía de la Generalitat", role: "Límites, costa, cubiertas del suelo, relieve, espacios protegidos y peligro de incendio." },
        { name: "OpenStreetMap, openrouteservice y catálogo de esquí", role: "Servicios, red viaria y tiempos de acceso a Barcelona y estaciones de esquí." },
      ],
      steps: [
        "Se identifica cada municipio mediante su código oficial IDESCAT de seis dígitos.",
        "Se descargan y conservan snapshots de las fuentes junto con fecha, versión y huella de integridad.",
        "Se validan tipos, rangos, duplicados y cobertura antes de unir los datasets por código municipal.",
        "Las métricas comparables se transforman a escalas 0–100; cuando procede se limitan valores extremos mediante percentiles P05/P95.",
        "Los datos ausentes permanecen como null. Cada salida registra confianza, cobertura y si puede participar en el índice.",
        "El índice visible se recalcula con los pesos elegidos y exige al menos un 65 % de cobertura ponderada.",
      ],
      links: [
        { label: "Metodología y código fuente", url: "https://github.com/mquitoss/muni-alpha" },
        { label: "Especificación de datos", url: "https://github.com/mquitoss/muni-alpha/blob/main/docs/data-specs.md" },
      ],
    },
    detail: {
      glossaryIntro:
        "Los scores van de 0 a 100 y son relativos al conjunto municipal analizado: un valor alto representa una mejor señal en ese indicador, no una garantía. La confianza describe calidad, cobertura y actualidad del dato; no es una probabilidad de éxito.",
      photos: {
        provider: "Wikimedia Commons",
        limit: 3,
        searchLimit: 16,
      },
      notices: [
        "La viabilidad HUT es un gate regulatorio, no una señal económica. Un valor alto no garantiza una licencia; comprueba el planeamiento local.",
        "El riesgo natural es un indicador de revisión y no forma parte del índice. La cobertura de inundación puede estar incompleta.",
      ],
      fields: [
        { section: "Municipio", key: "comarca_name", label: "Comarca", format: "plain", help: "División territorial a la que pertenece el municipio." },
        { key: "demographic_population_current", label: "Población", format: "number", help: "Número de habitantes del último periodo municipal disponible." },
        { section: "Accesibilidad", key: "barcelona_access_drive_minutes", label: "Tiempo en coche a Barcelona", format: "duration", help: "Duración estimada por carretera desde el núcleo municipal hasta el centro de Barcelona mediante openrouteservice." },
        { section: "Mercado", key: "sale_price_score_0_100", label: "Precio de venta · score", format: "number", decimals: 1, help: "Posición relativa del nivel de precios de compraventa. Un score alto indica precios observados más elevados." },
        { key: "sale_price_confidence_0_100", label: "Precio de venta · confianza", format: "number", help: "Calidad y cobertura de los registros usados para estimar el precio de venta." },
        { key: "sale_price_sale_price_eur_m2", label: "Precio observado", format: "number", decimals: 0, unit: "€/m²", help: "Precio medio de compraventa publicado por metro cuadrado para el periodo de referencia." },
        { key: "sale_momentum_score_0_100", label: "Momentum · score", format: "number", decimals: 1, help: "Señal relativa de crecimiento reciente del precio, combinando variaciones anual y plurianual cuando están disponibles." },
        { key: "sale_momentum_confidence_0_100", label: "Momentum · confianza", format: "number", help: "Calidad, continuidad temporal y cobertura de la serie usada para medir crecimiento de precios." },
        { key: "rental_price_score_0_100", label: "Alquiler · score", format: "number", decimals: 1, help: "Posición relativa del nivel y actividad del alquiler residencial; no mide directamente ocupación futura." },
        { key: "rental_price_confidence_0_100", label: "Alquiler · confianza", format: "number", help: "Calidad y cobertura de los contratos y rentas observados." },
        { key: "yield_proxy_score_0_100", label: "Rentabilidad proxy · score", format: "number", decimals: 1, help: "Comparación relativa de la rentabilidad bruta estimada entre municipios." },
        { key: "yield_proxy_gross_yield_proxy_pct", label: "Rentabilidad bruta proxy", format: "percent", decimals: 2, help: "Alquiler anual estimado dividido por el precio medio de compra. No descuenta vacancia, impuestos, reformas ni otros costes." },
        { key: "yield_proxy_confidence_0_100", label: "Rentabilidad · confianza", format: "number", help: "Confianza conjunta de los datos de alquiler y compraventa utilizados en la proxy." },
        { key: "market_liquidity_score_0_100", label: "Liquidez · score", format: "number", decimals: 1, help: "Actividad relativa del mercado a partir de operaciones de venta y contratos de alquiler por población." },
        { key: "market_liquidity_confidence_0_100", label: "Liquidez · confianza", format: "number", help: "Cobertura y consistencia de los registros empleados para medir actividad de mercado." },
        { section: "Crecimiento y entorno", key: "demographic_score_0_100", label: "Demografía · score", format: "number", decimals: 1, help: "Señal relativa de evolución de la población, con mayor peso del crecimiento sostenido." },
        { key: "demographic_confidence_0_100", label: "Demografía · confianza", format: "number", help: "Cobertura y continuidad de la serie de población municipal." },
        { key: "demographic_cagr_5y_pct", label: "Población · CAGR 5 años", format: "percent", decimals: 2, help: "Tasa anual compuesta que resume el crecimiento o descenso de población durante cinco años." },
        { key: "tourism_demand_score_0_100", label: "Turismo · score", format: "number", decimals: 1, help: "Presión turística relativa basada en alojamientos registrados y población estacional, cuando existe información." },
        { key: "tourism_demand_confidence_0_100", label: "Turismo · confianza", format: "number", help: "Cobertura y actualidad de los registros turísticos y de población estacional." },
        { key: "landscape_score_0_100", label: "Paisaje · score", format: "number", decimals: 1, help: "Proxy de atractivo natural que combina superficie natural y protegida, relieve y pendiente." },
        { key: "landscape_confidence_0_100", label: "Paisaje · confianza", format: "number", help: "Cobertura y resolución de las capas geográficas utilizadas para caracterizar el entorno." },
        { key: "services_score_0_100", label: "Servicios · score", format: "number", decimals: 1, help: "Accesibilidad relativa a servicios esenciales como salud, educación, comercio y transporte." },
        { key: "services_confidence_0_100", label: "Servicios · confianza", format: "number", help: "Cobertura de los servicios localizados y de las rutas calculadas desde el núcleo municipal." },
        { section: "Gates e indicadores", key: "hut_feasibility_score_0_100", label: "Viabilidad HUT · gate", format: "number", decimals: 0, help: "Filtro regulatorio preliminar para vivienda de uso turístico. No sustituye una consulta urbanística ni garantiza licencia." },
        { key: "hut_feasibility_confidence_0_100", label: "HUT · confianza", format: "number", help: "Grado de revisión y cobertura de las restricciones y normativa turística recopiladas." },
        { key: "hut_feasibility_local_regulation_checked", label: "Normativa local revisada", format: "boolean", help: "Indica si se ha verificado de forma explícita normativa municipal específica sobre HUT." },
        { key: "natural_risk_score_0_100", label: "Seguridad natural · indicador", format: "number", decimals: 1, help: "Indicador donde 100 representa menor exposición relativa y 0 mayor riesgo. Considera incendio e inundación con cobertura desigual." },
        { key: "natural_risk_fire_safety_score", label: "Seguridad frente a incendio", format: "number", decimals: 1, help: "Componente específico de seguridad frente a peligro de incendio forestal; un valor alto representa menor riesgo relativo." },
        { key: "natural_risk_fire_red_flag", label: "Alerta de incendio", format: "boolean", help: "Marca municipios cuya exposición a incendio requiere una revisión adicional." },
        { key: "natural_risk_confidence_0_100", label: "Riesgo · confianza", format: "number", help: "Cobertura y calidad de las capas territoriales disponibles para evaluar riesgos naturales." },
        { key: "natural_risk_risk_review_required", label: "Revisión de riesgo necesaria", format: "boolean", help: "Advierte que el municipio no debe evaluarse automáticamente sin comprobar información de riesgo más detallada." },
      ],
    },
  };

  root.SSM_CONFIG = config;
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof self !== "undefined" ? self : this);
