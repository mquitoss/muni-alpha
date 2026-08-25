"use strict";

const { createReadStream, existsSync, lstatSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, relative, resolve, sep } = require("node:path");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function contentType(path) {
  return mimeTypes[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer(root) {
  const publicRoot = resolve(root);
  return createServer((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const path = resolve(publicRoot, requested);
    const relativePath = relative(publicRoot, path);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)
      || !existsSync(path) || !lstatSync(path).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentType(path),
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path).pipe(response);
  });
}

function parseArguments(argv) {
  const rootIndex = argv.indexOf("--root");
  const portIndex = argv.indexOf("--port");
  return {
    root: resolve(rootIndex >= 0 ? argv[rootIndex + 1] : "dist"),
    port: Number(portIndex >= 0 ? argv[portIndex + 1] : 4173),
  };
}

if (require.main === module) {
  const options = parseArguments(process.argv.slice(2));
  if (!Number.isInteger(options.port) || options.port <= 0 || !existsSync(options.root)) {
    throw new Error("Uso: serve_static.js --root <directorio> --port <puerto>");
  }
  createStaticServer(options.root).listen(options.port, "127.0.0.1", () => {
    console.log(`Serving ${options.root} at http://127.0.0.1:${options.port}`);
  });
}

module.exports = { contentType, createStaticServer, parseArguments };
