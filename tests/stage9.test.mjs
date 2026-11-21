import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWebsiteServer } from "../scripts/website-server.mjs";

const ROOT = process.cwd();

test("Supabase schema, GitHub workflows, env template, and SETUP.md are present and valid", () => {
  const schema = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  assert.ok(schema.includes("create table if not exists public.profiles"));
  assert.ok(schema.includes("create table if not exists public.screenshots"));
  assert.ok(schema.includes("create table if not exists public.releases"));
  assert.ok(schema.includes("not ilike '%.jar%'"));
  assert.ok(schema.includes("insert into storage.buckets"));

  const releaseWf = fs.readFileSync(path.join(ROOT, ".github/workflows/release.yml"), "utf8");
  assert.ok(releaseWf.includes("windows-latest"));
  assert.ok(releaseWf.includes("npm run tauri:build"));
  assert.ok(releaseWf.includes("SHA256SUMS.txt"));

  assert.ok(fs.existsSync(path.join(ROOT, ".github/workflows/ci.yml")));
  assert.ok(fs.existsSync(path.join(ROOT, "apps/website/.env.example")));
  assert.ok(fs.existsSync(path.join(ROOT, "SETUP.md")));
});

test("Admin RBAC rejects non-admins (403), allows admin release publishing (blocking .jar), moderation, and role promotion", async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "7xair-admin-test-"));
  process.env.SEVENXAIR_WEB_DATA_DIR = tmpData;
  process.env.SEVENXAIR_ADMIN_EMAILS = "boss@7xair.dev";

  const server = createWebsiteServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Regular user signup -> 403 on /api/admin
    const userRes = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signup",
        username: "RegularUser",
        email: "player@7xair.dev",
        password: "Password123!",
      }),
    });
    const userData = await userRes.json();
    assert.equal(userData.user.role, "user");

    const forbidden = await fetch(`${base}/api/admin`, {
      headers: { Authorization: `Bearer ${userData.token}` },
    });
    assert.equal(forbidden.status, 403);

    // 2. Admin user signup -> 200 on /api/admin
    const adminRes = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signup",
        username: "AirAdmin",
        email: "boss@7xair.dev",
        password: "AdminPassword123!",
      }),
    });
    const adminData = await adminRes.json();
    assert.equal(adminData.user.role, "admin");

    const adminGet = await fetch(`${base}/api/admin`, {
      headers: { Authorization: `Bearer ${adminData.token}` },
    });
    assert.equal(adminGet.status, 200);

    // 3. Reject any .jar release URL (400)
    const jarReject = await fetch(`${base}/api/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminData.token}`,
      },
      body: JSON.stringify({
        action: "publish_release",
        version: "0.2.0",
        channel: "stable",
        windowsInstallerUrl: "https://example.com/7xair-client.jar",
        windowsInstallerSha256: "a".repeat(64),
        releaseNotes: "Should be blocked",
      }),
    });
    assert.equal(jarReject.status, 400);

    // 4. Publish valid Windows EXE release -> reflected in /api/releases
    const pubOk = await fetch(`${base}/api/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminData.token}`,
      },
      body: JSON.stringify({
        action: "publish_release",
        version: "0.2.0",
        channel: "stable",
        windowsInstallerUrl: "https://github.com/7xair/7xair/releases/download/v0.2.0/7xAir-Setup-0.2.0.exe",
        windowsInstallerSha256: "b".repeat(64),
        releaseNotes: "Stage 9 release",
        highlights: ["Connected Supabase, Vercel, and GitHub Actions."],
      }),
    });
    assert.equal(pubOk.status, 201);

    const relData = await (await fetch(`${base}/api/releases`)).json();
    assert.equal(relData.latestVersion, "0.2.0");
    assert.equal(relData.windowsDownload.filename, "7xAir-Setup-0.2.0.exe");

    // 5. Promote regular user to admin
    const promoteRes = await fetch(`${base}/api/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminData.token}`,
      },
      body: JSON.stringify({
        action: "set_user_role",
        userId: userData.user.id,
        role: "admin",
      }),
    });
    assert.equal(promoteRes.status, 200);
    assert.equal((await promoteRes.json()).user.role, "admin");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpData, { recursive: true, force: true });
    delete process.env.SEVENXAIR_ADMIN_EMAILS;
  }
});
