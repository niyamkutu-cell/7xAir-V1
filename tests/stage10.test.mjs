import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Complete source ZIP exists, has valid ZIP header, and has matching SHA-256 checksum file", () => {
  const zipPath = path.join(ROOT, "dist/7xAir-source-v0.1.0.zip");
  const shaPath = path.join(ROOT, "dist/7xAir-source-v0.1.0.zip.sha256");

  assert.ok(fs.existsSync(zipPath), "Expected dist/7xAir-source-v0.1.0.zip to exist");
  assert.ok(fs.existsSync(shaPath), "Expected dist/7xAir-source-v0.1.0.zip.sha256 to exist");

  const header = fs.readFileSync(zipPath).subarray(0, 4);
  assert.deepEqual([...header], [0x50, 0x4b, 0x03, 0x04]);

  const shaLine = fs.readFileSync(shaPath, "utf8").trim();
  assert.match(shaLine, /^[a-f0-9]{64}\s+7xAir-source-v0\.1\.0\.zip$/);
});

test("Release documentation and Windows build script are present", () => {
  for (const rel of [
    "README.md",
    "RELEASE_NOTES.md",
    "SETUP.md",
    "ARCHITECTURE.md",
    "BUILD_STATUS.md",
    "TODO.md",
    "scripts/build-release.ps1",
    "scripts/package-source-zip.py",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `Missing release artifact: ${rel}`);
  }
});
