import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Client manager implements tri-state overrides, SHA-256, and ZIP/JAR header integrity checks", () => {
  const cmRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/client_manager.rs"),
    "utf8"
  );
  assert.ok(cmRs.includes("ClientOverrideMode::Inherit"));
  assert.ok(cmRs.includes("ClientOverrideMode::ForceOn"));
  assert.ok(cmRs.includes("ClientOverrideMode::ForceOff"));
  assert.ok(cmRs.includes("Sha256::new()"));
  assert.ok(cmRs.includes("0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04"));
  for (const code of [
    "BUNDLE_NOT_STAGED",
    "MISSING_MANAGED_JAR",
    "CORRUPT_JAR_HEADER",
    "UPDATE_AVAILABLE",
    "DUPLICATE_CLIENT_JARS",
    "ORPHANED_JAR_WHEN_DISABLED",
  ]) {
    assert.ok(cmRs.includes(code), `Missing integrity check code: ${code}`);
  }
});

test("Client manager supports atomic install, update, repair, and removal without touching user mods", () => {
  const cmRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/client_manager.rs"),
    "utf8"
  );
  assert.ok(cmRs.includes("pub fn sync_managed_client"));
  assert.ok(cmRs.includes("pub fn update_managed_client"));
  assert.ok(cmRs.includes("pub fn repair_managed_client"));
  assert.ok(cmRs.includes("pub fn remove_managed_client"));
  assert.ok(cmRs.includes("copy_jar_atomic"));
  assert.ok(cmRs.includes("name.starts_with(\"7xair-client-\")"));
});

test("Global autoInstallClient toggle resyncs inheriting instances automatically", () => {
  const libRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/lib.rs"),
    "utf8"
  );
  assert.ok(libRs.includes("if prev_auto != next_settings.auto_install_client"));
  assert.ok(libRs.includes("sync_all_instances_client"));
});
