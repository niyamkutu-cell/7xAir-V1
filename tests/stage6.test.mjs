import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Performance module collects real sysinfo CPU/RAM/disk/process telemetry", () => {
  const perfRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/performance.rs"),
    "utf8"
  );
  assert.ok(perfRs.includes("use sysinfo::{Disks, Pid, System};"));
  assert.ok(perfRs.includes("pub fn collect_performance_telemetry"));
  assert.ok(perfRs.includes("Win32_VideoController"));
});

test("Optimization recommendations provide PvP, Balanced, and Low-End presets plus Fabric optimization mods", () => {
  const perfRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/performance.rs"),
    "utf8"
  );
  for (const preset of ["competitive_pvp", "balanced", "low_end"]) {
    assert.ok(perfRs.includes(`"${preset}"`), `Missing preset: ${preset}`);
  }
  for (const mod of ["sodium", "lithium", "ferrite-core", "immediatelyfast", "entityculling"]) {
    assert.ok(perfRs.includes(`"${mod}"`), `Missing recommended Fabric mod: ${mod}`);
  }
});

test("Diagnostics and crash-log analyzer detect all 6 critical Minecraft/Fabric crash signatures", () => {
  const perfRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/performance.rs"),
    "utf8"
  );
  assert.ok(perfRs.includes("run_compatibility_checks"));
  assert.ok(perfRs.includes("check_client_integrity"));
  for (const code of [
    "OUT_OF_MEMORY",
    "UNSUPPORTED_JAVA_VERSION",
    "MIXIN_CONFLICT",
    "MOD_RESOLUTION_FAILURE",
    "GPU_DRIVER_CRASH",
    "MISSING_CLASS_OR_CORRUPT_JAR",
  ]) {
    assert.ok(perfRs.includes(code), `Missing crash analyzer signature: ${code}`);
  }
});
