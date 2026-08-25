(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const tesela = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = tesela;
  tesela.adapters = Object.assign(tesela.adapters || {}, api);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  function populationDisplay(value) {
    if (value == null || value === "" || !Number.isFinite(Number(value))) return "sin dato";
    return Number(value).toLocaleString("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  function derive(indicator) {
    return {
      ...indicator,
      demographic_population_display: populationDisplay(indicator.demographic_population_current),
    };
  }

  function zonePoint(zone) {
    const lat = Number(zone?.ind?.capital_lat);
    const lon = Number(zone?.ind?.capital_lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function comarcaCapitalZones(zones, names, normalizeName) {
    const normalize = typeof normalizeName === "function"
      ? normalizeName
      : (value) => String(value ?? "").trim().toLocaleLowerCase("ca");
    const capitals = new Set((names || []).map((name) => normalize(name)));
    return (zones || []).filter((zone) => capitals.has(normalize(zone.name)) && zonePoint(zone));
  }

  function hutRestricted(zone) {
    return (zone?.ind?.hut_feasibility_score_0_100 ?? 100) < 100;
  }

  function riskReviewRequired(zone) {
    return zone?.ind?.natural_risk_risk_review_required === true;
  }

  function createNotice(document, text) {
    if (!document || !text) return null;
    const notice = document.createElement("p");
    notice.className = "ssm-notice";
    notice.textContent = text;
    return notice;
  }

  function scoredZones(config, weights) {
    const tesela = root.Tesela || root.SSM || {};
    const engine = tesela.engine || {};
    const namespace = config.branding?.dataNamespace || "MUNIALPHA_DATA";
    const bundle = root[namespace] || root.TESELA_DATA || root.SSM_DATA;
    if (!bundle || typeof engine.computeScores !== "function" || typeof engine.joinByKey !== "function") {
      return [];
    }
    const zones = engine.joinByKey(bundle.geo, bundle.indicators, config.join).zones;
    const scores = engine.computeScores(bundle.indicators, weights, config.scoring);
    const byKey = new Map(scores.map((score) => [String(score.key), score]));
    return zones.map((zone) => ({ zone, score: byKey.get(String(zone.key)) || null }));
  }

  function coverageText(config, weights) {
    const scored = scoredZones(config, weights);
    const available = scored.filter(({ score }) => score?.score != null).length;
    return `${scored.length} municipios · ${available} con cobertura suficiente en esta tesis`;
  }

  function createCoverageStatus(document, config, weights) {
    if (!document) return null;
    const status = document.createElement("p");
    status.className = "munialpha-coverage-status";
    status.textContent = coverageText(config, weights);
    return status;
  }

  function openZoneFromRanking(document, zone) {
    const input = document?.querySelector?.(".tesela-search input");
    if (!input) return;
    input.value = zone.name;
    input.dispatchEvent(new root.Event("input", { bubbles: true }));
    const result = [...document.querySelectorAll(".tesela-search-result")]
      .find((candidate) => candidate.textContent === zone.name);
    result?.click();
  }

  function renderRanking(document, container, config, weights) {
    if (!document || !container) return;
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.className = "ssm-section-title";
    heading.textContent = "Mejor índice actual";
    container.appendChild(heading);

    const ranked = scoredZones(config, weights)
      .filter(({ score }) => score?.score != null)
      .sort((left, right) => right.score.score - left.score.score
        || left.zone.name.localeCompare(right.zone.name, "ca"))
      .slice(0, 8);
    const list = document.createElement("div");
    list.className = "ssm-results";
    for (const { zone, score } of ranked) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ssm-result";
      button.addEventListener("click", () => openZoneFromRanking(document, zone));
      const name = document.createElement("span");
      name.className = "ssm-result-name";
      name.textContent = zone.name;
      const alerts = [];
      if (hutRestricted(zone)) alerts.push("HUT restringido");
      if (riskReviewRequired(zone)) alerts.push("Revisar riesgo");
      if (alerts.length) {
        const small = document.createElement("small");
        small.textContent = alerts.join(" · ");
        name.appendChild(small);
      }
      const value = document.createElement("strong");
      value.textContent = String(score.score);
      button.append(name, value);
      list.appendChild(button);
    }
    container.appendChild(list);
  }

  function createRanking(document, config, weights) {
    if (!document) return null;
    const ranking = document.createElement("section");
    ranking.className = "ssm-section munialpha-ranking";
    renderRanking(document, ranking, config, weights);
    return ranking;
  }

  function currentWeights(document, config) {
    const inputs = [...document.querySelectorAll(".ssm-slider input")];
    return Object.fromEntries((config?.scoring?.factors || []).map((factor, index) => [
      factor.key,
      Number(inputs[index]?.value) || 0,
    ]));
  }

  function decorateSearchResults(document, config, weights) {
    if (!document || !config) return;
    const byName = new Map(scoredZones(config, weights).map((entry) => [entry.zone.name, entry]));
    for (const button of document.querySelectorAll(".tesela-search-result")) {
      if (button.dataset.munialphaDecorated === "true") continue;
      const entry = byName.get(button.textContent);
      if (!entry) continue;
      button.dataset.munialphaDecorated = "true";
      button.replaceChildren();
      const name = document.createElement("span");
      name.className = "ssm-result-name";
      name.textContent = entry.zone.name;
      const alerts = [];
      if (hutRestricted(entry.zone)) alerts.push("HUT restringido");
      if (riskReviewRequired(entry.zone)) alerts.push("Revisar riesgo");
      if (alerts.length) {
        const small = document.createElement("small");
        small.textContent = alerts.join(" · ");
        name.appendChild(small);
      }
      const value = document.createElement("strong");
      value.textContent = String(entry.score?.score ?? "—");
      button.append(name, value);
    }
  }

  function createDetailSummary(document, zone, score) {
    if (!document) return null;
    const summary = document.createElement("section");
    summary.className = "munialpha-detail-summary";

    const scoreLine = document.createElement("p");
    scoreLine.className = "munialpha-score";
    scoreLine.textContent = score?.score == null
      ? "Índice no disponible por cobertura insuficiente"
      : `Índice relativo: ${score.score}/100 · cobertura ${Math.round(score.coverage * 100)}%`;
    summary.appendChild(scoreLine);

    const badges = [];
    if (hutRestricted(zone)) badges.push("HUT restringido");
    if (riskReviewRequired(zone)) badges.push("Revisar riesgo");
    if (badges.length) {
      const badgeList = document.createElement("div");
      badgeList.className = "munialpha-badges";
      for (const text of badges) {
        const badge = document.createElement("span");
        badge.className = "munialpha-badge";
        badge.textContent = text;
        badgeList.appendChild(badge);
      }
      summary.appendChild(badgeList);
    }
    return summary;
  }

  const slots = {
    "sidebar.afterStatus": ({ config, state }) => [
      createCoverageStatus(root.document, config, state.weights),
      createNotice(root.document, config.branding?.notice),
    ],
    "sidebar.afterControls": ({ config, state }) =>
      createRanking(root.document, config, state.weights),
    "detail.beforeFields": ({ zone, score }) => createDetailSummary(root.document, zone, score),
  };

  function installShellEnhancements(document) {
    if (!document?.addEventListener) return () => {};
    const onInput = (event) => {
      if (!event.target?.matches?.(".ssm-slider input")) return;
      for (const preset of document.querySelectorAll(".ssm-preset.active")) {
        preset.classList.remove("active");
      }
      const config = root.TESELA_CONFIG || root.SSM_CONFIG;
      const weights = currentWeights(document, config);
      const status = document.querySelector(".munialpha-coverage-status");
      if (status && config) status.textContent = coverageText(config, weights);
      const ranking = document.querySelector(".munialpha-ranking");
      if (ranking && config) renderRanking(document, ranking, config, weights);
    };
    document.addEventListener("input", onInput);
    const rail = document.getElementById("ssm-rail");
    const observer = rail && typeof root.MutationObserver === "function"
      ? new root.MutationObserver(() => {
          const config = root.TESELA_CONFIG || root.SSM_CONFIG;
          decorateSearchResults(document, config, currentWeights(document, config));
        })
      : null;
    observer?.observe(rail, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("input", onInput);
      observer?.disconnect();
    };
  }

  installShellEnhancements(root.document);

  return {
    comarcaCapitalZones,
    coverageText,
    createCoverageStatus,
    createDetailSummary,
    createNotice,
    createRanking,
    decorateSearchResults,
    derive,
    hutRestricted,
    installShellEnhancements,
    populationDisplay,
    riskReviewRequired,
    slots,
    zonePoint,
  };
});
