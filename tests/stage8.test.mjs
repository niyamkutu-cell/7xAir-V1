import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWebsiteServer } from "../scripts/website-server.mjs";

const ROOT = process.cwd();

test("Website strictly forbids separate client JAR downloads and serves Windows EXE only", async () => {
  const html = fs.readFileSync(path.join(ROOT, "apps/website/public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "apps/website/public/app.js"), "utf8");
  const latest = fs.readFileSync(
    path.join(ROOT, "apps/website/public/releases/latest.json"),
    "utf8"
  );

  assert.ok(!/\.jar["'\s)]/i.test(html), "Website HTML must not link to any .jar download");
  assert.ok(!/\.jar["'\s)]/i.test(js), "Website JS must not link to any .jar download");
  assert.ok(!/\.jar/i.test(latest), "Release manifest must not distribute a standalone .jar");
  assert.ok(html.includes(".exe"), "Website must offer Windows EXE installer");
});

test("Live website server handles signup, login, session auth, screenshot upload, gallery, changelog, and Windows downloads", async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "7xair-web-test-"));
  process.env.SEVENXAIR_WEB_DATA_DIR = tmpData;

  const server = createWebsiteServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Static homepage & release manifest
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.ok(homeHtml.includes("7xAir"));

    const manifestResp = await fetch(`${base}/releases/latest.json`);
    assert.equal(manifestResp.status, 200);
    const manifest = await manifestResp.json();
    assert.equal(manifest.stable.version, "0.1.0");

    // 2. Releases API (Windows download, version info 1.21.11 & 26.2, changelog)
    const relResp = await fetch(`${base}/api/releases`);
    assert.equal(relResp.status, 200);
    const rel = await relResp.json();
    assert.ok(rel.windowsDownload.filename.endsWith(".exe"));
    assert.equal(rel.compatibilityTargets.length, 2);
    assert.ok(rel.changelog.length >= 1);

    // 3. Signup -> Login -> Session verification
    const signupResp = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signup",
        username: "AirTester",
        email: "tester@7xair.dev",
        password: "StrongPassword123!",
      }),
    });
    assert.equal(signupResp.status, 201);
    const signupData = await signupResp.json();
    assert.ok(signupData.token);
    assert.equal(signupData.user.username, "AirTester");

    const badLogin = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "login",
        email: "tester@7xair.dev",
        password: "WrongPassword!",
      }),
    });
    assert.equal(badLogin.status, 401);

    const loginResp = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "login",
        email: "tester@7xair.dev",
        password: "StrongPassword123!",
      }),
    });
    assert.equal(loginResp.status, 200);
    const loginData = await loginResp.json();
    assert.ok(loginData.token);

    const sessionResp = await fetch(`${base}/api/auth`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const sessionData = await sessionResp.json();
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.user.username, "AirTester");

    // 4. Unauthenticated upload rejected (401)
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
    const unauthUpload = await fetch(`${base}/api/screenshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Unauthorized Shot",
        mcVersion: "1.21.11",
        theme: "azure-mountains",
        imageDataUrl: tinyPng,
      }),
    });
    assert.equal(unauthUpload.status, 401);

    // 5. Authenticated screenshot upload & gallery verification
    const uploadResp = await fetch(`${base}/api/screenshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        title: "Glass HUD 1.21.11 Capture",
        caption: "Testing translucent floating glass HUD",
        mcVersion: "1.21.11",
        theme: "emerald-wilderness",
        imageDataUrl: tinyPng,
      }),
    });
    assert.equal(uploadResp.status, 201);

    const galleryResp = await fetch(`${base}/api/screenshots`);
    assert.equal(galleryResp.status, 200);
    const gallery = await galleryResp.json();
    assert.equal(gallery.screenshots[0].title, "Glass HUD 1.21.11 Capture");
    assert.equal(gallery.screenshots[0].author, "AirTester");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpData, { recursive: true, force: true });
  }
});
