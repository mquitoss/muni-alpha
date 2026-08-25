const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const projectRoot = resolve(__dirname, "..");
const submodulePath = resolve(projectRoot, "vendor/tesela");
const metadata = require("../package.json").tesela;

function git(args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertTeselaInitialized(path = submodulePath) {
  const requiredPaths = [
    resolve(path, "tesela.assets.json"),
    resolve(path, "src/app.js"),
  ];
  if (requiredPaths.some((requiredPath) => !existsSync(requiredPath))) {
    throw new Error(
      "Tesela no está inicializado en vendor/tesela. Ejecuta: git submodule update --init --recursive",
    );
  }
}

function verifyTesela() {
  assertTeselaInitialized();

  const configuredUrl = git([
    "config", "-f", ".gitmodules", "--get", "submodule.vendor/tesela.url",
  ]);
  if (configuredUrl !== "https://github.com/mquitoss/tesela.git") {
    throw new Error(`La URL del submódulo debe ser HTTPS; se encontró: ${configuredUrl}`);
  }

  const manifest = readJson(resolve(submodulePath, "tesela.assets.json"));
  const packageVersion = readJson(resolve(submodulePath, "package.json")).version;
  if (manifest.version !== metadata.version || packageVersion !== metadata.version) {
    throw new Error(
      `La versión de Tesela no coincide: se esperaba ${metadata.version}, `
        + `manifiesto=${manifest.version}, package=${packageVersion}`,
    );
  }

  const tagCommit = git(["-C", "vendor/tesela", "rev-parse", `${metadata.tag}^{commit}`]);
  const headCommit = git(["-C", "vendor/tesela", "rev-parse", "HEAD"]);
  const indexEntry = git(["ls-files", "--stage", "--", "vendor/tesela"]);
  const [mode, gitlinkCommit] = indexEntry.split(/\s+/);

  if (mode !== "160000") {
    throw new Error("vendor/tesela no está registrado como gitlink");
  }
  if ([tagCommit, headCommit, gitlinkCommit].some((commit) => commit !== metadata.commit)) {
    throw new Error(
      `El gitlink debe apuntar a ${metadata.tag} (${metadata.commit}); `
        + `tag=${tagCommit}, HEAD=${headCommit}, gitlink=${gitlinkCommit}`,
    );
  }

  return {
    version: metadata.version,
    tag: metadata.tag,
    commit: metadata.commit,
    url: configuredUrl,
  };
}

if (require.main === module) {
  try {
    const result = verifyTesela();
    console.log(`Tesela ${result.tag} verificado en ${result.commit}.`);
  } catch (error) {
    console.error(`Error de Tesela: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertTeselaInitialized, verifyTesela };
