import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FABRIC = path.join(ROOT, "client", "7xair-fabric");

test("Fabric mod defines multi-target builds for Minecraft 1.21.11 and 26.2", () => {
  const buildGradle = fs.readFileSync(path.join(FABRIC, "build.gradle"), "utf8");
  assert.ok(buildGradle.includes("versions/${targetId}.properties"));
  assert.ok(buildGradle.includes("fabric-loom"));

  const p121 = fs.readFileSync(path.join(FABRIC, "versions/1.21.11.properties"), "utf8");
  const p262 = fs.readFileSync(path.join(FABRIC, "versions/26.2.properties"), "utf8");
  assert.ok(p121.includes("minecraft_version=1.21.11"));
  assert.ok(p262.includes("minecraft_version=26.2"));
});

test("Fabric GlassRenderer enforces genuinely translucent alpha cap (no opaque cards)", () => {
  const airTheme = fs.readFileSync(
    path.join(FABRIC, "src/main/java/com/sevenxair/client/theme/AirTheme.java"),
    "utf8"
  );
  const glassRenderer = fs.readFileSync(
    path.join(FABRIC, "src/main/java/com/sevenxair/client/gui/GlassRenderer.java"),
    "utf8"
  );
  assert.ok(airTheme.includes("Math.min(0.72f, opacity)"));
  assert.ok(glassRenderer.includes("drawFloatingGlassPanel"));
  assert.ok(glassRenderer.includes("fillGradient"));
});

test("Fabric HudManager registers all 8 HUD modules and HudEditorScreen supports drag, snap, and scale", () => {
  const hudManager = fs.readFileSync(
    path.join(FABRIC, "src/main/java/com/sevenxair/client/hud/HudManager.java"),
    "utf8"
  );
  for (const id of ["fps", "cps", "ping", "coords", "toggle_sprint", "keystrokes", "armor", "potions"]) {
    assert.ok(hudManager.includes(`"${id}"`), `Missing HUD module: ${id}`);
  }

  const editor = fs.readFileSync(
    path.join(FABRIC, "src/main/java/com/sevenxair/client/gui/HudEditorScreen.java"),
    "utf8"
  );
  assert.ok(editor.includes("mouseDragged"));
  assert.ok(editor.includes("mouseScrolled"));
  assert.ok(editor.includes("snapToGrid"));
});

test("Fabric ClientConfig persists atomically and syncs initial theme from launcher", () => {
  const cfg = fs.readFileSync(
    path.join(FABRIC, "src/main/java/com/sevenxair/client/config/ClientConfig.java"),
    "utf8"
  );
  assert.ok(cfg.includes("7xair-client.json"));
  assert.ok(cfg.includes("ATOMIC_MOVE"));
  assert.ok(cfg.includes("syncInitialThemeFromLauncher"));
});
