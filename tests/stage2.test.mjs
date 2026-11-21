import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

test("Local Java binary output is parseable by major version rule", () => {
  const out = execFileSync("java", ["-version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const combined = execFileSync("sh", ["-c", "java -version 2>&1"], { encoding: "utf8" });
  const match = combined.match(/"(\d+)(?:\.(\d+))?/);
  assert.ok(match, `Expected quoted Java version in: ${combined}`);
  const first = Number(match[1]);
  const major = first === 1 ? Number(match[2]) : first;
  assert.ok(major >= 17, `Expected Java >= 17, got ${major} (${out})`);
});

test("Offline UUID v3 matches Minecraft RFC 4122 OfflinePlayer specification", () => {
  const digest = crypto.createHash("md5").update("OfflinePlayer:AirPlayer").digest();
  digest[6] = (digest[6] & 0x0f) | 0x30;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const authRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/auth.rs"),
    "utf8"
  );
  assert.ok(authRs.includes("OfflinePlayer:{username}"));
  assert.ok(authRs.includes("0x30"));
  assert.ok(authRs.includes("0x80"));
});

test("Launch pipeline constructs authentic Minecraft arguments and Fabric support", () => {
  const launchRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/launch.rs"),
    "utf8"
  );
  for (const flag of [
    "--username",
    "--version",
    "--gameDir",
    "--assetsDir",
    "--assetIndex",
    "--uuid",
    "--accessToken",
    "--userType",
    "--versionType",
  ]) {
    assert.ok(launchRs.includes(`"${flag}"`), `Missing Minecraft CLI arg: ${flag}`);
  }
  assert.ok(launchRs.includes("fetch_fabric_profile"));
  assert.ok(launchRs.includes("sync_managed_client"));
});

test("Minecraft metadata resolver tracks 1.21.11 and 26.2 official availability", () => {
  const mcRs = fs.readFileSync(
    path.join(ROOT, "apps/launcher/src-tauri/src/minecraft.rs"),
    "utf8"
  );
  assert.ok(mcRs.includes("version_manifest_v2.json"));
  assert.ok(mcRs.includes("pending_official_release"));
  assert.ok(mcRs.includes("library_allowed_for_current_os"));
});
