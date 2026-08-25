const { expect, test } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");
const parityBaseline = require("../frontend/fixtures/munialpha-parity-v0.5.0.json");

const bundleLine = readFileSync(resolve(__dirname, "../../data/map_bundle.js"), "utf8")
  .split("\n", 1)[0];
const bundle = JSON.parse(bundleLine.slice("window.MUNIALPHA_DATA = ".length, -1));
const namesByCode = new Map(bundle.geo.features.map((feature) => [
  String(feature.properties.CODIMUNI),
  feature.properties.NOMMUNI,
]));
const expectedInitialRanking = parityBaseline.presets.equilibrado.topCodes
  .map((code) => namesByCode.get(code));

const photoPayload = {
  query: {
    pages: Object.fromEntries([1, 2, 3].map((index) => [index, {
      index,
      title: `File:Abrera ${index}.jpg`,
      imageinfo: [{
        mime: "image/jpeg",
        thumburl: `https://upload.wikimedia.org/abrera-${index}.jpg`,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:Abrera_${index}.jpg`,
        extmetadata: {
          Artist: { value: `Autora ${index}` },
          LicenseShortName: { value: "CC BY-SA 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
        },
      }],
    }])),
  },
};

async function verifyShell(page, url) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("https://commons.wikimedia.org/**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(photoPayload),
  }));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tesela-zone-path")).toHaveCount(947);
  await expect(page.locator(".ssm-preset")).toHaveCount(7);
  await expect(page.locator(".munialpha-coverage-status")).toContainText("358 con cobertura");
  await expect(page.locator(".munialpha-ranking .ssm-result")).toHaveCount(8);
  expect(await page.locator(".munialpha-ranking .ssm-result-name").evaluateAll((elements) =>
    elements.map((element) => element.childNodes[0].textContent))).toEqual(expectedInitialRanking);
  await expect(page.locator(".leaflet-control-layers-overlays label")).toHaveCount(2);
  await expect(page.locator(".ssm-map-label-capital")).toHaveCount(44);
  await expect(page.locator(".ssm-notice")).toContainText("No constituye asesoramiento");

  await page.locator(".tesela-methodology summary").click();
  await expect(page.locator(".tesela-source-list > div")).toHaveCount(4);
  await expect(page.locator(".tesela-methodology-content li")).toHaveCount(6);

  await page.locator(".tesela-search input").fill("Abrera");
  await expect(page.locator(".tesela-search-result").first()).toContainText("HUT restringido");
  await expect(page.locator(".tesela-search-result").first()).toContainText("Revisar riesgo");
  await page.locator(".tesela-search-result").first().click();
  await expect(page.locator("#ssm-detail")).toHaveClass(/open/);
  await expect(page.locator("#ssm-detail h2")).toHaveText("Abrera");
  await expect(page.locator(".munialpha-score")).toContainText("cobertura");
  await expect(page.locator(".munialpha-badge")).toHaveText(["HUT restringido", "Revisar riesgo"]);
  await expect(page.locator(".tesela-detail-row")).toHaveCount(32);
  await expect(page.locator(".tesela-media-card")).toHaveCount(3);
  await expect(page.locator(".leaflet-tesela-selection-pane path")).toHaveCount(1);

  await page.locator(".tesela-glossary-trigger").click();
  await expect(page.locator("#ssm-glossary")).toHaveClass(/open/);
  await expect(page.locator(".tesela-glossary-row")).toHaveCount(32);
  await expect(page.locator(".tesela-glossary-intro")).toContainText("0 a 100");
  await page.keyboard.press("Escape");
  await expect(page.locator("#ssm-glossary")).not.toHaveClass(/open/);

  await page.locator(".ssm-preset", { hasText: "Turístico" }).click();
  await expect(page.locator(".ssm-preset.active")).toHaveText("Turístico");
  await expect(page.locator(".munialpha-coverage-status")).toContainText("486 con cobertura");
  await page.locator(".ssm-slider input").first().evaluate((input) => {
    input.value = "0.9";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator(".ssm-preset.active")).toHaveCount(0);
  await page.locator("#ssm-detail > .tesela-detail-head .tesela-panel-close").click();
  await expect(page.locator("#ssm-detail")).not.toHaveClass(/open/);
  await expect(page.locator(".leaflet-tesela-selection-pane path")).toHaveCount(0);
  expect(errors).toEqual([]);
}

test("shell MuniAlpha sobre Tesela por HTTP", async ({ page }) => {
  await verifyShell(page, "http://127.0.0.1:4173/index.html");
});

test("servidor estático publica MIME correctos", async ({ request }) => {
  const expected = {
    "/": "text/html",
    "/index.html": "text/html",
    "/app.config.js": "text/javascript",
    "/src/styles.css": "text/css",
    "/favicon.svg": "image/svg+xml",
    "/data/map_bundle.js": "text/javascript",
    "/vendor/tesela/src/app.js": "text/javascript",
  };
  for (const [path, mime] of Object.entries(expected)) {
    const response = await request.get(`http://127.0.0.1:4173${path}`);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(mime);
    expect(response.headers()["x-content-type-options"], path).toBe("nosniff");
  }
});

test("shell MuniAlpha sobre Tesela mediante file://", async ({ page }) => {
  const url = pathToFileURL(resolve(__dirname, "../../dist/index.html")).href;
  await verifyShell(page, url);
});

test("tema MuniAlpha permanece utilizable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://commons.wikimedia.org/**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ query: { pages: {} } }),
  }));
  await page.goto("http://127.0.0.1:4173/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tesela-zone-path")).toHaveCount(947);
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).display))
    .toBe("block");
  expect((await page.locator("#ssm-map").boundingBox()).height).toBeGreaterThanOrEqual(430);
  await page.locator(".tesela-search input").fill("Abrera");
  await page.locator(".tesela-search-result").first().click();
  const detail = await page.locator("#ssm-detail").boundingBox();
  expect(detail.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".munialpha-score")).toContainText("cobertura");
});
