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
    command: "npm run build && node scripts/serve_static.js --root dist --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
});
