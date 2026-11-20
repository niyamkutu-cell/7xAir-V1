import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("Redesign: All 7 anime nature themes and legacy migrations are configured", () => {
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const themesTs = read("apps/launcher/src/theme/themes.ts");
  const backdrop = read("apps/launcher/src/components/NatureBackdrop.tsx");
  const expected = [
    "azure-mountains",
    "sakura-valley",
    "emerald-wilderness",
    "frozen-peaks",
    "sunset-horizon",
    "midnight-forest",
    "dreamy-anime",
  ];
  for (const id of expected) {
    assert.ok(configRs.includes(`"${id}"`), `Missing ${id} in config.rs`);
    assert.ok(themesTs.includes(`"${id}"`), `Missing ${id} in themes.ts`);
    assert.ok(backdrop.includes(`"${id}"`), `Missing ${id} in NatureBackdrop.tsx`);
  }
  assert.ok(configRs.includes("migrate_legacy_theme"), "Missing legacy theme migration");
});

test("Redesign: Home screen includes 3D skin viewer, top-right SIGN IN & PLAY LOCALLY, and PLAY hero", () => {
  const home = read("apps/launcher/src/pages/HomePage.tsx");
  const viewer = read("apps/launcher/src/components/SkinViewer3D.tsx");
  const modal = read("apps/launcher/src/components/AuthQuickModal.tsx");
  const pkg = JSON.parse(read("apps/launcher/package.json"));

  assert.ok(pkg.dependencies?.skinview3d, "skinview3d dependency missing");
  assert.ok(home.includes("SIGN IN") && home.includes("PLAY LOCALLY"), "Top-right auth buttons missing");
  assert.ok(home.includes("SkinViewer3D"), "HomePage must render SkinViewer3D");
  assert.ok(viewer.includes("IdleAnimation") && viewer.includes("viewer.dispose()"), "SkinViewer3D animation/cleanup missing");
  assert.ok(viewer.includes("viewer.renderPaused = paused"), "SkinViewer3D must pause WebGL loop when paused");
  assert.ok(viewer.includes("buildFallbackSkinDataUrl"), "SkinViewer3D default skin fallback missing");
  assert.ok(viewer.includes("slim") && viewer.includes("default"), "SkinViewer3D classic/slim support missing");
  assert.ok(modal.includes("startMicrosoftLogin") && modal.includes("onCreateOffline"), "AuthQuickModal must wire Microsoft & offline auth");
});

test("Redesign: Settings persistence and window-minimized / in-game animation pausing work end-to-end", () => {
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const settingsTsx = read("apps/launcher/src/pages/SettingsPage.tsx");
  const appTsx = read("apps/launcher/src/App.tsx");
  const glassCss = read("apps/launcher/src/styles/glass.css");

  for (const field of [
    "background_animations",
    "particle_effects",
    "player_rotation",
    "startup_route",
    "launch_on_startup",
    "pause_effects_in_game",
  ]) {
    assert.ok(configRs.includes(field), `Missing ${field} in Rust config.rs`);
  }
  assert.ok(settingsTsx.includes("Background Animations"), "Missing Background Animations toggle");
  assert.ok(settingsTsx.includes("Particle Effects"), "Missing Particle Effects toggle");
  assert.ok(settingsTsx.includes("3D Player Idle Rotation"), "Missing 3D Player Rotation toggle");
  assert.ok(settingsTsx.includes("Reset All Settings"), "Missing Reset Settings button");
  assert.ok(appTsx.includes("visibilitychange"), "App.tsx must listen to visibilitychange to pause when minimized");
  assert.ok(appTsx.includes("data-animations-paused"), "App.tsx must set data-animations-paused attribute");
  assert.ok(glassCss.includes('data-animations-paused="true"'), "glass.css must pause animations when paused");
});

test("Redesign: 7X branding PNG/ICO/favicon assets exist and have valid headers", () => {
  const pngFiles = [
    "apps/launcher/public/logo-7x.png",
    "apps/launcher/src-tauri/icons/icon.png",
    "apps/launcher/src-tauri/icons/32x32.png",
    "apps/launcher/src-tauri/icons/128x128.png",
    "apps/launcher/src-tauri/icons/128x128@2x.png",
    "apps/website/public/logo-7x.png",
    "apps/website/public/favicon.png",
  ];
  for (const rel of pngFiles) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${rel} is not a valid PNG`);
  }

  const icoFiles = [
    "apps/launcher/src-tauri/icons/icon.ico",
    "apps/launcher/public/favicon.ico",
    "apps/website/public/favicon.ico",
  ];
  for (const rel of icoFiles) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.deepEqual([...buf.subarray(0, 4)], [0x00, 0x00, 0x01, 0x00], `${rel} is not a valid ICO`);
  }

  const titleBar = read("apps/launcher/src/components/TitleBar.tsx");
  const tauriConf = JSON.parse(read("apps/launcher/src-tauri/tauri.conf.json"));
  assert.ok(titleBar.includes("/logo-7x.png"), "TitleBar must render /logo-7x.png");
  assert.equal(tauriConf.bundle.windows.nsis.installerIcon, "icons/icon.ico", "NSIS installerIcon must be icons/icon.ico");
  assert.equal(tauriConf.app.windows[0].resizable, true, "Window must remain resizable");
});

test("Redesign: GitHub Releases auto-updater, safe restart helper, and pre-release test workflow are present", () => {
  const updater = read("apps/launcher/src-tauri/src/updater.rs");
  const workflow = read(".github/workflows/updater-test-release.yml");
  const mc = read("apps/launcher/src-tauri/src/minecraft.rs");

  assert.ok(updater.includes("api.github.com/repos/"), "updater.rs must support GitHub Releases API");
  assert.ok(updater.includes("MissingChecksum"), "updater.rs must refuse unverified updates without SHA-256");
  assert.ok(updater.includes("apply-update-and-restart.cmd"), "updater.rs must write safe Windows restart helper");
  assert.ok(workflow.includes("prerelease: true"), "updater-test-release.yml must publish separate prereleases");
  assert.ok(workflow.includes("SHA256SUMS.txt"), "updater-test-release.yml must publish SHA256SUMS.txt");
  assert.ok(mc.includes("SUPPORTED_MC_TARGETS") || mc.includes("1.21.11"), "minecraft.rs must lock versions to 1.21.11 and 26.2");
  assert.ok(read("apps/launcher/src-tauri/src/config.rs").includes('["1.21.11", "26.2"]'), "config.rs must define SUPPORTED_MC_TARGETS");
});
