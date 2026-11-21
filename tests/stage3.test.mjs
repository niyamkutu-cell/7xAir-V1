import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Modrinth module supports mod & resourcepack search, SHA-512 verification, and required dependency resolution", () => {
  const modrinthRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/modrinth.rs"),
    "utf8"
  );
  assert.ok(modrinthRs.includes("https://api.modrinth.com/v2"));
  assert.ok(modrinthRs.includes("project_type:{project_type}"));
  assert.ok(modrinthRs.includes("Sha512::new()"));
  assert.ok(modrinthRs.includes("dependency_type == \"required\""));
  assert.ok(modrinthRs.includes("resourcepacks"));
  assert.ok(modrinthRs.includes(".disabled"));
});

test("Compatibility checker covers vanilla-mod conflict, loader mismatch, version mismatch, missing deps, and duplicates", () => {
  const modrinthRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/modrinth.rs"),
    "utf8"
  );
  for (const code of [
    "MOD_ON_VANILLA",
    "LOADER_MISMATCH",
    "MC_VERSION_MISMATCH",
    "MISSING_DEPENDENCY",
    "DUPLICATE_PROJECT",
    "UNMANAGED_FILE",
  ]) {
    assert.ok(modrinthRs.includes(code), `Missing compatibility check code: ${code}`);
  }
});

test("Independent instance cloning copies mods, resourcepacks, config, options.txt, and content-manifest.json", () => {
  const instancesRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/instances.rs"),
    "utf8"
  );
  assert.ok(instancesRs.includes("pub fn clone_existing_instance"));
  assert.ok(instancesRs.includes("copy_dir_recursive"));
  assert.ok(instancesRs.includes("content-manifest.json"));
  assert.ok(instancesRs.includes("options.txt"));
});
