(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const L = window.L;
  const config = window.SSM_CONFIG || {};
  const engine = (window.SSM && window.SSM.engine) || {};
  const state = { zones: [], scores: new Map(), weights: {}, preset: null, map: null, layer: null, layers: new Map(), query: "", selected: null };
  const $ = (selector) => document.querySelector(selector);

  function element(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
  }

  function defaults() {
    return Object.fromEntries((config.scoring.factors || []).map((factor) => [factor.key, factor.defaultWeight ?? 1]));
  }

  function applyPreset(id) {
    const preset = config.scoring.presets.find((item) => item.id === id);
    if (!preset) return;
    state.preset = id;
    state.weights = { ...defaults(), ...preset.weights };
  }

  function rescore() {
    const rows = state.zones.filter((zone) => zone.ind).map((zone) => zone.ind);
    const results = engine.computeScores(rows, state.weights, config.scoring);
    state.scores = new Map(results.map((result) => [String(result.key), result]));
  }

  function scoreFor(zone) {
    return state.scores.get(String(zone.key)) || null;
  }

  function styleZone(zone) {
    const score = scoreFor(zone);
    const fillColor = engine.colorForValue(score && score.scoreN, { min: 0, max: 1 }, config.color.ramp);
    if (!fillColor) return { ...config.color.noData, weight: 1, fillOpacity: 0.55 };
    return { color: "#f3efe5", weight: 0.7, fillColor, fillOpacity: 0.82 };
  }

  function renderMap() {
    if (state.layer) state.layer.remove();
    state.layers.clear();
    const byFeature = new Map(state.zones.map((zone) => [zone.feature, zone]));
    state.layer = L.geoJSON({ type: "FeatureCollection", features: state.zones.map((zone) => zone.feature) }, {
      style: (feature) => styleZone(byFeature.get(feature)),
      onEachFeature: (feature, layer) => {
        const zone = byFeature.get(feature);
        state.layers.set(String(zone.key), layer);
        layer.bindTooltip(() => {
          const score = scoreFor(zone);
          return score?.score == null
            ? `${zone.name} · sin cobertura suficiente`
            : `${zone.name} · ${score.score}/100 · ${Math.round(score.coverage * 100)}% cobertura`;
        }, { sticky: true });
        layer.on("mouseover", () => layer.setStyle({ weight: 2, color: config.branding.accent }));
        layer.on("mouseout", () => layer.setStyle(styleZone(zone)));
        layer.on("click", () => showDetail(zone));
      },
    }).addTo(state.map);
  }

  function refreshMapStyles() {
    for (const zone of state.zones) {
      const layer = state.layers.get(String(zone.key));
      if (layer) layer.setStyle(styleZone(zone));
    }
  }

  function showDetail(zone) {
    const panel = $("#ssm-detail");
    const score = scoreFor(zone);
    state.selected = zone;
    panel.replaceChildren();
    panel.append(element("div", { class: "ssm-detail-head" }, [
      element("div", {}, [
        element("h2", {}, [zone.name]),
        element("div", { class: "ssm-score" }, [
          score?.score == null
            ? "Índice no disponible por cobertura insuficiente"
            : `Índice relativo: ${score.score}/100 · cobertura ${Math.round(score.coverage * 100)}%`,
        ]),
      ]),
      element("button", { class: "ssm-close", type: "button", "aria-label": "Cerrar", onclick: () => closeDetail() }, ["×"]),
    ]));
    for (const field of config.detail.fields || []) {
      if (field.section) panel.append(element("h3", { class: "ssm-detail-section" }, [field.section]));
      panel.append(element("div", { class: "ssm-row" }, [
        element("span", { class: "ssm-row-label" }, [field.label || field.key]),
        element("span", { class: "ssm-row-value" }, [engine.formatValue(zone.ind && zone.ind[field.key], field)]),
      ]));
    }
    for (const notice of config.detail.notices || []) panel.append(element("p", { class: "ssm-detail-notice" }, [notice]));
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }

  function closeDetail() {
    const panel = $("#ssm-detail");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    state.selected = null;
  }

  function focusZone(zone) {
    const layer = state.layers.get(String(zone.key));
    if (layer && layer.getBounds) state.map.fitBounds(layer.getBounds(), { maxZoom: 12, padding: [30, 30] });
    showDetail(zone);
  }

  function resultList() {
    const query = engine.normalizeName(state.query.trim());
    const ranked = state.zones
      .filter((zone) => !query || engine.normalizeName(zone.name).includes(query))
      .sort((left, right) => (scoreFor(right)?.score ?? -1) - (scoreFor(left)?.score ?? -1))
      .slice(0, query ? 12 : 8);
    return element("div", { class: "ssm-results" }, ranked.map((zone) => {
      const badges = [];
      if ((zone.ind?.hut_feasibility_score_0_100 ?? 100) < 100) badges.push("HUT restringido");
      if (zone.ind?.natural_risk_risk_review_required === true) badges.push("Revisar riesgo");
      return element("button", { class: "ssm-result", type: "button", onclick: () => focusZone(zone) }, [
        element("span", { class: "ssm-result-name" }, [
          zone.name,
          ...(badges.length ? [element("small", {}, [badges.join(" · ")])] : []),
        ]),
        element("strong", {}, [String(scoreFor(zone)?.score ?? "—")]),
      ]);
    }));
  }

  function coverageStatus() {
    const scored = state.zones.filter((zone) => scoreFor(zone)?.score != null).length;
    return `${state.zones.length} municipios · ${scored} con cobertura suficiente en esta tesis`;
  }

  function buildConsole() {
    const rail = $("#ssm-rail");
    rail.replaceChildren();
    rail.append(element("header", { class: "ssm-brand" }, [element("h1", {}, [config.branding.title]), element("p", {}, [config.branding.subtitle])]));
    rail.append(element("p", { class: "ssm-status" }, [coverageStatus()]));
    rail.append(element("p", { class: "ssm-notice" }, [config.branding.notice]));
    rail.append(element("input", { class: "ssm-search", type: "search", value: state.query, placeholder: "Buscar municipio…", "aria-label": "Buscar municipio", oninput: (event) => {
      state.query = event.target.value;
      rail.querySelector(".ssm-results")?.replaceWith(resultList());
    } }));

    const presets = element("div", { class: "ssm-presets" }, (config.scoring.presets || []).map((preset) => element("button", {
      class: `ssm-preset${state.preset === preset.id ? " active" : ""}`,
      type: "button",
      onclick: () => {
        applyPreset(preset.id);
        rescore();
        refreshMapStyles();
        if (state.selected) showDetail(state.selected);
        buildConsole();
      },
    }, [preset.label])));
    rail.append(element("section", { class: "ssm-section" }, [element("h2", { class: "ssm-section-title" }, ["Tesis de inversión"]), presets]));

    const groups = new Map();
    for (const factor of config.scoring.factors || []) {
      const group = factor.group || "Factores";
      groups.set(group, [...(groups.get(group) || []), factor]);
    }
    const sliderConfig = config.scoring.slider || { min: 0, max: 1, step: 0.1 };
    for (const [group, factors] of groups) {
      const sliders = element("div", { class: "ssm-sliders" });
      for (const factor of factors) {
        const output = element("span", { class: "ssm-slider-value" }, [Number(state.weights[factor.key]).toFixed(1)]);
        const input = element("input", { type: "range", min: sliderConfig.min, max: sliderConfig.max, step: sliderConfig.step, value: state.weights[factor.key], oninput: (event) => {
          state.weights[factor.key] = Number(event.target.value);
          state.preset = null;
          output.textContent = Number(event.target.value).toFixed(1);
          rescore();
          refreshMapStyles();
          rail.querySelector(".ssm-status").textContent = coverageStatus();
          rail.querySelector(".ssm-results")?.replaceWith(resultList());
          if (state.selected) showDetail(state.selected);
        } });
        sliders.append(element("label", { class: "ssm-slider" }, [element("span", {}, [factor.label]), output, input]));
      }
      rail.append(element("section", { class: "ssm-section" }, [element("h2", { class: "ssm-section-title" }, [group]), sliders]));
    }
    rail.append(element("section", { class: "ssm-section" }, [element("h2", { class: "ssm-section-title" }, [state.query ? "Coincidencias" : "Mejor índice actual"]), resultList()]));
    const gradient = config.color.ramp.map((color) => `rgb(${color.join(",")})`).join(",");
    rail.append(element("div", { class: "ssm-section" }, [element("div", { class: "ssm-legend-bar", style: `background:linear-gradient(90deg,${gradient})` }), element("div", { class: "ssm-legend-ends" }, ["índice bajo", "índice alto"])]));
  }

  function bootstrap() {
    const namespace = config.branding.dataNamespace;
    const bundle = engine.selectDataSource({ embedded: window[namespace] }).bundle;
    if (!bundle) {
      $("#ssm-rail").innerHTML = '<p class="ssm-error">No se ha encontrado el bundle. Ejecuta <code>python scripts/build_map_data.py</code>.</p>';
      return;
    }
    state.zones = engine.joinByKey(bundle.geo, bundle.indicators, config.join).zones;
    document.documentElement.style.setProperty("--accent", config.branding.accent);
    applyPreset(config.scoring.defaultPreset);
    rescore();
    state.map = L.map("ssm-map", { zoomControl: true }).setView(config.map.center, config.map.zoom);
    L.tileLayer(config.map.tiles.url, { attribution: config.map.tiles.attribution }).addTo(state.map);
    renderMap();
    buildConsole();
    state.map.fitBounds(state.layer.getBounds(), { padding: [12, 12] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
  });
})();
