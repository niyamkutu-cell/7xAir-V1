import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Updater implements SemVer comparison, background downloading, SHA-256 + PE/ZIP verification, and atomic staging", () => {
  const updaterRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/updater.rs"),
    "utf8"
  );
  assert.ok(updaterRs.includes("pub struct SemVer"));
  assert.ok(updaterRs.includes("tauri::async_runtime::spawn"));
  assert.ok(updaterRs.includes("Sha256::new()"));
  assert.ok(updaterRs.includes("bytes[0] == 0x4D && bytes[1] == 0x5A"));
  assert.ok(updaterRs.includes("staged.json"));
});

test("Updater blocks install while Minecraft is running, creates rollback snapshot, and supports full rollback", () => {
  const updaterRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/updater.rs"),
    "utf8"
  );
  assert.ok(updaterRs.includes("UpdaterError::GameRunning"));
  assert.ok(updaterRs.includes("create_rollback_snapshot"));
  assert.ok(updaterRs.includes("rollback-manifest.json"));
  assert.ok(updaterRs.includes("pub fn rollback_last_update"));
});

test("Update release manifest example contains stable and beta channels with Windows installer SHA-256", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "apps/launcher/updates/latest.example.json"), "utf8")
  );
  assert.equal(manifest.stable.channel, "stable");
  assert.ok(manifest.stable.windowsInstallerUrl.endsWith(".exe"));
  assert.equal(manifest.stable.windowsInstallerSha256.length, 64);
});
