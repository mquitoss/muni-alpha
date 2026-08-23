(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const L = window.L;
  const config = window.SSM_CONFIG || {};
  const engine = (window.SSM && window.SSM.engine) || {};
  const state = {
    zones: [], scores: new Map(), weights: {}, preset: null, map: null, layer: null,
    layers: new Map(), query: "", selected: null, selectedOutline: null,
    referenceLayer: null, municipalityLabelLayer: null, photoCache: new Map(), photoRequest: 0,
    glossaryTrigger: null,
  };
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
    return { color: "#f3efe5", weight: 0.7, fillColor, fillOpacity: 0.7 };
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

  function highlightZone(zone) {
    if (state.selectedOutline) state.selectedOutline.remove();
    state.selectedOutline = L.geoJSON(zone.feature, {
      interactive: false,
      style: {
        color: config.branding.accent,
        weight: 4,
        opacity: 1,
        fill: false,
        lineCap: "round",
        lineJoin: "round",
      },
    }).addTo(state.map);
    state.selectedOutline.bringToFront();
  }

  function labelIcon(label, kind) {
    const text = document.createElement("span");
    text.className = `ssm-map-label ssm-map-label-${kind}`;
    text.textContent = label;
    return L.divIcon({
      className: "ssm-map-label-icon",
      html: text.outerHTML,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  function zoneCoordinates(zone) {
    const lat = Number(zone.ind?.capital_lat);
    const lon = Number(zone.ind?.capital_lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function refreshMunicipalityLabels() {
    const layer = state.municipalityLabelLayer;
    if (!layer || !state.map.hasLayer(layer)) return;
    layer.clearLayers();
    if (state.map.getZoom() < config.map.municipalityLabels.minZoom) return;
    const bounds = state.map.getBounds().pad(0.15);
    for (const zone of state.zones) {
      const coordinates = zoneCoordinates(zone);
      if (coordinates && bounds.contains(coordinates)) {
        L.marker(coordinates, { icon: labelIcon(zone.name, "municipality"), interactive: false }).addTo(layer);
      }
    }
  }

  function addOrientationLayers() {
    const capitalNames = new Set((config.map.comarcaCapitals || []).map(engine.normalizeName));
    const capitalMarkers = state.zones
      .filter((zone) => capitalNames.has(engine.normalizeName(zone.name)))
      .map((zone) => {
        const coordinates = zoneCoordinates(zone);
        return coordinates
          ? L.marker(coordinates, { icon: labelIcon(zone.name, "capital"), interactive: false })
          : null;
      })
      .filter(Boolean);
    const referenceTiles = L.tileLayer(config.map.referenceTiles.url, {
      attribution: config.map.referenceTiles.attribution,
      pane: "overlayPane",
    });
    state.referenceLayer = L.layerGroup([referenceTiles, ...capitalMarkers]).addTo(state.map);
    state.municipalityLabelLayer = L.layerGroup().addTo(state.map);
    L.control.layers(null, {
      "Capitales comarcales y vías": state.referenceLayer,
      "Nombres de municipios (zoom 11+)": state.municipalityLabelLayer,
    }, { position: "topright" }).addTo(state.map);
    state.map.on("zoomend moveend overlayadd", refreshMunicipalityLabels);
    refreshMunicipalityLabels();
  }

  function closeGlossary(restoreFocus = true) {
    const panel = $("#ssm-glossary");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    if (state.glossaryTrigger?.isConnected) state.glossaryTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && state.glossaryTrigger?.isConnected) state.glossaryTrigger.focus();
    state.glossaryTrigger = null;
  }

  function showGlossary(event) {
    const panel = $("#ssm-glossary");
    state.glossaryTrigger = event?.currentTarget || null;
    state.glossaryTrigger?.setAttribute("aria-expanded", "true");
    panel.replaceChildren();
    panel.append(element("div", { class: "ssm-glossary-head" }, [
      element("div", {}, [
        element("p", { class: "ssm-eyebrow" }, ["Guía de lectura"]),
        element("h2", { id: "ssm-glossary-title" }, ["Qué significa cada dato"]),
      ]),
      element("button", {
        class: "ssm-close", type: "button", "aria-label": "Cerrar guía",
        onclick: () => closeGlossary(),
      }, ["×"]),
    ]));
    panel.append(element("p", { class: "ssm-glossary-intro" }, [config.detail.glossaryIntro]));
    const definitions = element("dl", { class: "ssm-glossary-list" });
    let section = null;
    for (const field of config.detail.fields || []) {
      if (field.section && field.section !== section) {
        section = field.section;
        definitions.append(element("div", { class: "ssm-glossary-section" }, [section]));
      }
      definitions.append(
        element("dt", {}, [field.label || field.key]),
        element("dd", {}, [field.help]),
      );
    }
    panel.append(definitions);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    panel.querySelector(".ssm-close").focus();
  }

  function photoCard(photo, zone) {
    return element("figure", { class: "ssm-photo" }, [
      element("a", { href: photo.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, [
        element("img", { src: photo.url, alt: `${photo.title}, imagen cercana a ${zone.name}`, loading: "lazy" }),
      ]),
      element("figcaption", {}, [
        element("strong", {}, [photo.title]),
        element("span", {}, [
          `${photo.author} · `,
          element("a", { href: photo.licenseUrl, target: "_blank", rel: "noopener noreferrer" }, [photo.license]),
        ]),
      ]),
    ]);
  }

  async function renderMunicipalityPhotos(zone, section) {
    const request = ++state.photoRequest;
    section.replaceChildren(element("p", { class: "ssm-photo-status" }, ["Buscando imágenes cercanas…"]));
    let promise = state.photoCache.get(String(zone.key));
    if (!promise) {
      const [lat, lon] = zoneCoordinates(zone) || [];
      promise = engine.fetchCommonsImages(
        { name: zone.name, lat, lon },
        config.detail.photos,
      );
      state.photoCache.set(String(zone.key), promise);
    }
    try {
      const photos = await promise;
      if (request !== state.photoRequest || state.selected?.key !== zone.key || !section.isConnected) return;
      section.replaceChildren();
      if (!photos.length) {
        section.append(element("p", { class: "ssm-photo-status" }, ["No se han encontrado fotografías reutilizables para este entorno."]));
        return;
      }
      section.append(element("div", { class: "ssm-photos-grid" }, photos.map((photo) => photoCard(photo, zone))));
      section.append(element("p", { class: "ssm-photo-note" }, [
        "Imágenes geolocalizadas cercanas proporcionadas por Wikimedia Commons. Pueden mostrar el entorno y no el núcleo exacto.",
      ]));
    } catch {
      state.photoCache.delete(String(zone.key));
      if (request !== state.photoRequest || state.selected?.key !== zone.key || !section.isConnected) return;
      section.replaceChildren(element("p", { class: "ssm-photo-status" }, [
        "No se han podido cargar las fotografías. Los indicadores del municipio siguen disponibles.",
      ]));
    }
  }

  function showDetail(zone) {
    const panel = $("#ssm-detail");
    const score = scoreFor(zone);
    closeGlossary(false);
    state.selected = zone;
    highlightZone(zone);
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
      element("div", { class: "ssm-detail-actions" }, [
        element("button", {
          class: "ssm-help", type: "button", "aria-haspopup": "dialog",
          "aria-controls": "ssm-glossary", "aria-expanded": "false",
          onclick: showGlossary,
        }, ["Guía de indicadores"]),
        element("button", { class: "ssm-close", type: "button", "aria-label": "Cerrar", onclick: () => closeDetail() }, ["×"]),
      ]),
    ]));
    panel.append(element("h3", { class: "ssm-detail-section" }, ["Localidad y entorno"]));
    const photos = element("section", { class: "ssm-photos", "aria-label": `Imágenes de ${zone.name}` });
    panel.append(photos);
    renderMunicipalityPhotos(zone, photos);
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
    state.photoRequest += 1;
    closeGlossary(false);
    if (state.selectedOutline) state.selectedOutline.remove();
    state.selectedOutline = null;
  }

  function focusZone(zone) {
    const layer = state.layers.get(String(zone.key));
    if (layer && layer.getBounds) state.map.fitBounds(layer.getBounds(), { maxZoom: 12, padding: [30, 30] });
    showDetail(zone);
  }

  function matchingZones() {
    return engine.searchZones(state.zones, state.query, scoreFor);
  }

  function resultList(limit = 8) {
    const ranked = matchingZones().slice(0, limit);
    if (!ranked.length) return element("p", { class: "ssm-no-results" }, ["No se ha encontrado ningún municipio."]);
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

  function methodologySection() {
    const content = element("div", { class: "ssm-methodology-content" }, [
      element("p", {}, [config.methodology.summary]),
      element("h3", {}, ["Fuentes principales"]),
      element("div", { class: "ssm-source-list" }, config.methodology.sources.map((source) =>
        element("div", {}, [element("strong", {}, [source.name]), element("p", {}, [source.role])]),
      )),
      element("h3", {}, ["Proceso"]),
      element("ol", {}, config.methodology.steps.map((step) => element("li", {}, [step]))),
      element("div", { class: "ssm-methodology-links" }, config.methodology.links.map((link) =>
        element("a", { href: link.url, target: "_blank", rel: "noopener noreferrer" }, [link.label]),
      )),
    ]);
    return element("details", { class: "ssm-methodology" }, [
      element("summary", {}, ["Datos y metodología"]),
      content,
    ]);
  }

  function buildConsole() {
    const rail = $("#ssm-rail");
    rail.replaceChildren();
    rail.append(element("header", { class: "ssm-brand" }, [
      element("h1", {}, [
        element("span", { class: "ssm-brand-name" }, [config.branding.title]),
        element("span", { class: "ssm-version" }, [`v${config.branding.version}`]),
      ]),
      element("p", {}, [config.branding.subtitle]),
    ]));
    rail.append(element("p", { class: "ssm-status" }, [coverageStatus()]));
    rail.append(element("p", { class: "ssm-notice" }, [config.branding.notice]));
    rail.append(methodologySection());
    const searchFeedback = element("div", { class: "ssm-search-feedback", "aria-live": "polite" });
    const renderSearchFeedback = () => {
      searchFeedback.replaceChildren();
      if (!state.query.trim()) return;
      searchFeedback.append(
        element("h2", { class: "ssm-section-title" }, ["Coincidencias"]),
        resultList(12),
      );
    };
    const searchInput = element("input", {
      class: "ssm-search", type: "search", value: state.query, placeholder: "Buscar municipio…",
      "aria-label": "Buscar municipio", autocomplete: "off",
      oninput: (event) => {
        state.query = event.target.value;
        renderSearchFeedback();
      },
    });
    rail.append(element("form", {
      class: "ssm-search-form",
      onsubmit: (event) => {
        event.preventDefault();
        const match = matchingZones()[0];
        if (match && state.query.trim()) focusZone(match);
      },
    }, [searchInput]), searchFeedback);
    renderSearchFeedback();

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
          renderSearchFeedback();
          if (state.selected) showDetail(state.selected);
        } });
        sliders.append(element("label", { class: "ssm-slider" }, [element("span", {}, [factor.label]), output, input]));
      }
      rail.append(element("section", { class: "ssm-section" }, [element("h2", { class: "ssm-section-title" }, [group]), sliders]));
    }
    if (!state.query.trim()) {
      rail.append(element("section", { class: "ssm-section" }, [element("h2", { class: "ssm-section-title" }, ["Mejor índice actual"]), resultList()]));
    }
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
    addOrientationLayers();
    buildConsole();
    state.map.fitBounds(state.layer.getBounds(), { padding: [12, 12] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($("#ssm-glossary").classList.contains("open")) closeGlossary();
    else closeDetail();
  });
})();
