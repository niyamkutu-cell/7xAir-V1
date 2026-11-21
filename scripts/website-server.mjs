#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import authHandler from "../apps/website/api/auth.mjs";
import screenshotsHandler from "../apps/website/api/screenshots.mjs";
import releasesHandler from "../apps/website/api/releases.mjs";
import adminHandler from "../apps/website/api/admin.mjs";
import downloadHandler from "../apps/website/api/download.mjs";

const PORT = Number(process.env.WEB_PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(process.cwd(), "apps", "website", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readRequestBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

export function createWebsiteServer() {
  return http.createServer(async (req, res) => {
    const urlPath = (req.url || "/").split("?")[0];

    if (urlPath.startsWith("/api/")) {
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        req.body = await readRequestBody(req);
      }
      if (urlPath === "/api/auth") return authHandler(req, res);
      if (urlPath === "/api/screenshots") return screenshotsHandler(req, res);
      if (urlPath === "/api/releases") return releasesHandler(req, res);
      if (urlPath === "/api/admin") return adminHandler(req, res);
      if (urlPath === "/api/download") return downloadHandler(req, res);
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API route not found" }));
      return;
    }

    const relPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
    if (!safePath.startsWith(PUBLIC_DIR) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
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
  const server = createWebsiteServer();
  server.listen(PORT, HOST, () => {
    console.log(`7xAir website server listening on http://${HOST}:${PORT}`);
  });
}
