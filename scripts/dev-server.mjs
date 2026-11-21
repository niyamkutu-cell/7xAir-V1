#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 1420);
const HOST = process.env.HOST || "127.0.0.1";
const LAUNCHER_DIR = path.join(process.cwd(), "apps", "launcher");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function createDevServer() {
  return http.createServer((req, res) => {
    const urlPath = (req.url || "/").split("?")[0];
    if (urlPath === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", app: "7xAir", stage: 1 }));
      return;
    }

    const relPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const safePath = path.normalize(path.join(LAUNCHER_DIR, relPath));
    if (!safePath.startsWith(LAUNCHER_DIR) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(safePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(safePath).pipe(res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createDevServer();
  server.listen(PORT, HOST, () => {
    console.log(`7xAir dev preview server listening on http://${HOST}:${PORT}`);
  });
}
