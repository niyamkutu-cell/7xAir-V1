import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createDevServer } from "../scripts/dev-server.mjs";

const ROOT = process.cwd();

test("Stage 1 icons are valid PNG and Windows ICO binaries", () => {
  const pngPath = path.join(ROOT, "apps/launcher/src-tauri/icons/128x128.png");
  const icoPath = path.join(ROOT, "apps/launcher/src-tauri/icons/icon.ico");
  const pngHeader = fs.readFileSync(pngPath).subarray(0, 8);
  assert.deepEqual([...pngHeader], [137, 80, 78, 71, 13, 10, 26, 10]);

  const icoHeader = fs.readFileSync(icoPath).subarray(0, 4);
  assert.deepEqual([...icoHeader], [0, 0, 1, 0]);
});

test("Seven themes are defined in CSS with required glass variables", () => {
  const css = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src/styles/themes.css"),
    "utf8"
  );
  const matches = css.match(/data-theme="[a-z-]+"/g) || [];
  assert.ok(matches.length >= 7, `Expected at least 7 themes, found ${matches.length}`);
  assert.ok(css.includes("--glass-tint-rgb"));
  assert.ok(css.includes("--accent-rgb"));
});

test("Glass design system uses translucent backdrop blur and alpha control", () => {
  const glass = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src/styles/glass.css"),
    "utf8"
  );
  assert.ok(glass.includes("backdrop-filter: blur("));
  assert.ok(glass.includes("--glass-alpha"));
  assert.ok(glass.includes("rgba(var(--glass-tint-rgb), var(--glass-alpha))"));
});

test("Dev preview server serves index.html, stylesheets, and /health", async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const get = (reqPath) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port, path: reqPath }, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        })
        .on("error", reject);
    });

  try {
    const health = await get("/health");
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).app, "7xAir");

    const index = await get("/");
    assert.equal(index.status, 200);
    assert.ok(index.body.includes("<title>7xAir Launcher</title>"));

    const glassCss = await get("/src/styles/glass.css");
    assert.equal(glassCss.status, 200);
    assert.ok(glassCss.body.includes(".glass-panel"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
