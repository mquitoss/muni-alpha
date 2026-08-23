(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ssm = root.SSM || (root.SSM = {});
  ssm.engine = Object.assign(ssm.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const endpoint = "https://commons.wikimedia.org/w/api.php";
  const excludedTitles = /\b(escuts?|banderes?|banderas?|blasons?|coat of arms|flags?|mapes?|mapas?|maps?|locator|localitzaci[oó]|ubicaci[oó]|logos?|emblems?|seals?|icons?)\b/i;
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  function buildCommonsUrl({ name, lat, lon, searchLimit = 16 }) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "720",
    });
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      params.set("generator", "geosearch");
      params.set("ggsprimary", "all");
      params.set("ggsnamespace", "6");
      params.set("ggscoord", `${lat}|${lon}`);
      params.set("ggsradius", "10000");
      params.set("ggslimit", String(searchLimit));
    } else {
      params.set("generator", "search");
      params.set("gsrsearch", `"${name}" Catalunya`);
      params.set("gsrnamespace", "6");
      params.set("gsrlimit", String(searchLimit));
    }
    return `${endpoint}?${params.toString()}`;
  }

  function plainMetadata(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function displayTitle(title) {
    return String(title ?? "")
      .replace(/^File:/i, "")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/_/g, " ")
      .trim();
  }

  function titleSignature(title) {
    return displayTitle(title)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^\d+\s+/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function safeExternalUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value).startsWith("//") ? `https:${value}` : value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function selectCommonsImages(payload, limit = 3) {
    const pages = Object.values(payload?.query?.pages || {}).sort(
      (left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    );
    const selected = [];
    const seen = new Set();
    const seenTitles = new Set();
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info || !allowedMimeTypes.has(info.mime) || excludedTitles.test(page.title)) continue;
      const url = safeExternalUrl(info.thumburl || info.url);
      const sourceUrl = safeExternalUrl(info.descriptionurl);
      const signature = titleSignature(page.title);
      if (!url || !sourceUrl || seen.has(url) || seenTitles.has(signature)) continue;
      seen.add(url);
      seenTitles.add(signature);
      const metadata = info.extmetadata || {};
      selected.push({
        url,
        sourceUrl,
        title: displayTitle(page.title),
        author: plainMetadata(metadata.Artist?.value) || "Autor no indicado",
        license: plainMetadata(metadata.LicenseShortName?.value) || "Consulta la licencia en Commons",
        licenseUrl: safeExternalUrl(metadata.LicenseUrl?.value) || sourceUrl,
      });
      if (selected.length >= limit) break;
    }
    return selected;
  }

  async function fetchCommonsImages(subject, options = {}, fetcher = fetch) {
    const response = await fetcher(buildCommonsUrl({ ...subject, searchLimit: options.searchLimit }));
    if (!response.ok) throw new Error(`Wikimedia Commons responded with ${response.status}`);
    return selectCommonsImages(await response.json(), options.limit);
  }

  return {
    buildCommonsUrl, plainMetadata, titleSignature, safeExternalUrl,
    selectCommonsImages, fetchCommonsImages,
  };
});
