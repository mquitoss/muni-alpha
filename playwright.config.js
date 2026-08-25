const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run build && uv run python -m http.server 4173 --directory dist",
    port: 4173,
    reuseExistingServer: true,
  },
});
