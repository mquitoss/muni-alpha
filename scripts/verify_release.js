const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { runInNewContext } = require("node:vm");

const projectRoot = resolve(__dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readBrowserConfig(root) {
  const context = { self: {} };
  runInNewContext(readFileSync(resolve(root, "app.config.js"), "utf8"), context);
  return context.self.TESELA_CONFIG;
}

function verifyRelease(root = projectRoot) {
  const packageConfig = readJson(resolve(root, "package.json"));
  const lock = readJson(resolve(root, "package-lock.json"));
  const version = packageConfig.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Versión semántica inválida: ${version}`);
  }

  const configVersion = readBrowserConfig(root)?.branding?.version;
  const lockVersion = lock.version;
  const lockRootVersion = lock.packages?.[""]?.version;
  if ([configVersion, lockVersion, lockRootVersion].some((value) => value !== version)) {
    throw new Error(
      `Versiones desincronizadas: package=${version}, config=${configVersion}, `
        + `lock=${lockVersion}, lockRoot=${lockRootVersion}`,
    );
  }

  const fixtureName = `munialpha-parity-v${version}.json`;
  const fixturePath = resolve(root, "tests/frontend/fixtures", fixtureName);
  if (!existsSync(fixturePath)) throw new Error(`Falta el fixture de release: ${fixtureName}`);
  const fixture = readJson(fixturePath);
  if (fixture.applicationVersion !== version) {
    throw new Error(`El fixture declara ${fixture.applicationVersion}; se esperaba ${version}`);
  }

  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  if (!changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md no contiene la release ${version}`);
  }
  return { version, tag: `v${version}`, fixture: fixtureName };
}

if (require.main === module) {
  try {
    const release = verifyRelease();
    console.log(`MuniAlpha ${release.tag} preparado con ${release.fixture}.`);
  } catch (error) {
    console.error(`Error de release: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { readBrowserConfig, verifyRelease };
