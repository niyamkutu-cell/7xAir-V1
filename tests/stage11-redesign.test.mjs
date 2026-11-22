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

test("Task 1: Liquid-glass Obsidian Violet & Sky Blue themes, 7-section nav, Client Settings, and Instance Cards UI", () => {
  const themesCss = read("apps/launcher/src/styles/themes.css");
  const sidebar = read("apps/launcher/src/components/Sidebar.tsx");
  const defaults = read("apps/launcher/src/lib/defaults.ts");
  const instances = read("apps/launcher/src/pages/InstancesPage.tsx");
  const clientPage = read("apps/launcher/src/pages/ClientSettingsPage.tsx");

  assert.ok(themesCss.includes('data-theme="obsidian-violet"'), "Missing obsidian-violet theme");
  assert.ok(themesCss.includes('data-theme="midnight-sky"'), "Missing midnight-sky theme");
  for (const label of ["Home", "Instances", "Modrinth", "Performance Center", "Client Settings", "Account", "Settings"]) {
    assert.ok(defaults.includes(`"${label}"`), `Missing nav label ${label}`);
  }
  assert.ok(sidebar.includes("nav-item--active"), "Sidebar missing active glow indicator class");
  assert.ok(clientPage.includes("syncAllClients") && clientPage.includes("setInstanceClientOverride"), "ClientSettingsPage must wire real IPC commands");
  assert.ok(instances.includes("instance-cards-grid") && instances.includes("listInstanceContent") && instances.includes("updateInstance") && instances.includes("Confirm Delete"), "InstancesPage missing card grid, mod count, edit modal, or delete confirmation");
});

test("Task 2: Instance-specific MODS view, safe .disabled toggle, Open Mods Folder, and AUTO-INSTALL 7XAIR CLIENT MOD", () => {
  const modsView = read("apps/launcher/src/components/InstanceModsView.tsx");
  const instancesPage = read("apps/launcher/src/pages/InstancesPage.tsx");
  const modrinthRs = read("apps/launcher/src-tauri/src/modrinth.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");

  assert.ok(instancesPage.includes("MODS") && instancesPage.includes("InstanceModsView"), "InstancesPage must expose MODS button opening InstanceModsView");
  assert.ok(modsView.includes("AUTO-INSTALL 7XAIR CLIENT MOD"), "InstanceModsView missing AUTO-INSTALL 7XAIR CLIENT MOD setting");
  assert.ok(modsView.includes("openInstanceModsFolder") && modsView.includes("toggleInstanceContent"), "InstanceModsView must wire Open Mods Folder and ON/OFF toggles");
  assert.ok(modrinthRs.includes("read_fabric_mod_meta") && modrinthRs.includes(".disabled"), "modrinth.rs must read fabric.mod.json and use safe .disabled renaming");
  assert.ok(libRs.includes("fn open_instance_mods_folder"), "lib.rs must register open_instance_mods_folder");
});

test("Task 3: Official Modrinth cards, filters, Details modal, Instance-Selection Install modal, and Mods Manager link", () => {
  const page = read("apps/launcher/src/pages/ModrinthPage.tsx");
  const installModal = read("apps/launcher/src/components/ModrinthInstallModal.tsx");
  const detailsModal = read("apps/launcher/src/components/ModrinthDetailsModal.tsx");

  assert.ok(page.includes("Popular") && page.includes("Recently Updated"), "ModrinthPage missing Popular / Recently Updated tabs");
  assert.ok(page.includes("neoforge") && page.includes("forge") && page.includes("fabric"), "ModrinthPage missing loader filters");
  assert.ok(detailsModal.includes("getModrinthVersions") && detailsModal.includes("Dependencies"), "ModrinthDetailsModal must display versions and dependencies");
  assert.ok(installModal.includes("Select Target Instance") && installModal.includes("Confirm overwrite") && installModal.includes("Open in Instance Mods Manager"), "ModrinthInstallModal missing instance selection, overwrite confirmation, or Mods Manager link");
});

test("Task 4: Microsoft OAuth ownership check, browser launch, Account UI skin/switch/signout, and Website EXE login gate", () => {
  const authRs = read("apps/launcher/src-tauri/src/auth.rs");
  const profilesTsx = read("apps/launcher/src/pages/ProfilesPage.tsx");
  const webAppJs = read("apps/website/public/app.js");

  assert.ok(authRs.includes("entitlements/mcstore"), "auth.rs must verify Minecraft ownership via /entitlements/mcstore");
  assert.ok(authRs.includes("open_verification_browser"), "auth.rs must open official Microsoft login page in browser");
  assert.ok(profilesTsx.includes("Switch Account") && profilesTsx.includes("Sign Out") && profilesTsx.includes("minotar.net/helm"), "ProfilesPage must show player skin, Sign Out, and Account Switching");
  assert.ok(webAppJs.includes("Launching Soon"), "Website download button must display Launching Soon");
});

test("Task 5: 8-module Performance Center with 4 profiles, Memory/Java/JVM config, and read-only Crash Analyzer", () => {
  const perfRs = read("apps/launcher/src-tauri/src/performance.rs");
  const perfTsx = read("apps/launcher/src/pages/PerformancePage.tsx");

  for (const name of ["Balanced", "Maximum FPS", "Low Resource Usage", "PvP Performance"]) {
    assert.ok(perfRs.includes(`"${name}"`), `Missing profile ${name} in performance.rs`);
  }
  for (const heading of [
    "FPS Boost",
    "Memory Management",
    "Java Configuration & JVM Arguments",
    "Performance Profiles",
    "Crash Analyzer (Read-Only)",
    "Startup Optimization",
    "Background Resource Management",
  ]) {
    assert.ok(perfTsx.includes(heading), `Missing Performance Center module: ${heading}`);
  }
});

test("Task 6: Fabric client ClickGUI has categories, search, animations, HUD shadow/color customization, and crash guard", () => {
  const clickGui = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/AirClickGuiScreen.java");
  const hudEditor = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/HudEditorScreen.java");
  const hudModule = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudModule.java");
  const airTheme = read("client/7xair-fabric/src/main/java/com/sevenxair/client/theme/AirTheme.java");
  const cfg = read("client/7xair-fabric/src/main/java/com/sevenxair/client/config/ClientConfig.java");

  assert.ok(airTheme.includes("CRIMSON_OBSIDIAN") && airTheme.includes("OBSIDIAN_VIOLET") && airTheme.includes("MIDNIGHT_SKY"), "AirTheme.java missing Crimson Obsidian / Obsidian Violet / Midnight Sky");
  assert.ok(cfg.includes("textShadow") && cfg.includes("textColorRgb") && cfg.includes("opacityOverride"), "ClientConfig.java missing per-module shadow/color/opacity");
  assert.ok((clickGui.includes("visibleModules") || clickGui.includes("filteredModules")) && clickGui.includes("searchQuery") && clickGui.includes("smoothGuiAnimations"), "AirClickGuiScreen missing search, categories, or animation");
  assert.ok(hudEditor.includes("Shadow") && hudEditor.includes("COLOR_CYCLE"), "HudEditorScreen missing shadow and color controls");
  assert.ok(hudModule.includes("catch (Throwable "), "HudModule must guard render against crashes");
});

test("Task 7: 8-page Black & Sky Blue website and server-verified /api/download endpoint (401 unauth -> 200 auth)", async () => {
  const html = read("apps/website/public/index.html");
  const css = read("apps/website/public/styles.css");
  for (const id of [
    "page-home",
    "page-features",
    "page-performance",
    "page-client",
    "page-updates",
    "page-downloads",
    "page-account",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing website page ${id}`);
  }
  assert.ok(!html.includes('id="page-music"') && !html.includes('id="web-wp-upload-input"') && !html.includes('id="screenshot-form"'), "Website must not include music page or screenshot/image upload UI");
  assert.ok(html.includes("Built-In Music Player in Launcher"), "Features tab must list Built-In Music Player in Launcher");
  assert.ok(css.includes(".nav-link.active") && css.includes("midnight-sky"), "Website CSS missing glowing active nav or Black & Sky Blue theme");

  const { createWebsiteServer } = await import("../scripts/website-server.mjs");
  const server = createWebsiteServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const unauth = await fetch(`${base}/api/download`);
    assert.equal(unauth.status, 401, "Unauthenticated /api/download must return 401");

    const email = `dltest_${Date.now()}@example.com`;
    const signup = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signup", username: `DlTest_${String(Date.now()).slice(-6)}`, email, password: "Password123!" }),
    });
    assert.equal(signup.status, 201);
    const { token } = await signup.json();

    const authDl = await fetch(`${base}/api/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(authDl.status, 200, "Authenticated /api/download must return 200");
    const dlData = await authDl.json();
    assert.equal(dlData.authorized, true);
    assert.ok(dlData.downloadUrl.endsWith(".exe"), "Protected download must serve Windows .exe");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Client Part 3: All 8 categories, duplicate-registration guard, descriptions, and per-module keybinds", () => {
  const hudMod = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudModule.java");
  const hudMgr = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudManager.java");
  const keybinds = read("client/7xair-fabric/src/main/java/com/sevenxair/client/input/AirKeybinds.java");
  const clickGui = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/AirClickGuiScreen.java");

  for (const cat of ["COMBAT", "MOVEMENT", "RENDER", "PLAYER", "WORLD", "UTILITY", "HUD", "MISCELLANEOUS"]) {
    assert.ok(hudMod.includes(cat), `Missing category ${cat} in HudModule.java`);
  }
  assert.ok(hudMgr.includes("registeredIds") && hudMgr.includes("registerModule"), "HudManager must prevent duplicate registrations");
  assert.ok(keybinds.includes("keybindCode") && keybinds.includes("PRESSED_MODULE_KEYS"), "AirKeybinds must handle per-module keybinds");
  assert.ok(clickGui.includes("listeningForKeybind") && clickGui.includes("categoryAnim"), "AirClickGuiScreen missing keybind binder or smooth category transition");
});

test("Client Part 4: All 4 new module batches registered without duplicates (43 total real modules)", () => {
  const hudMgr = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudManager.java");
  const combat = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/CombatModules.java");
  const movWorld = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/MovementWorldModules.java");
  const rendPlayer = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/RenderPlayerModules.java");
  const utilMisc = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/UtilityMiscModules.java");

  assert.ok(hudMgr.includes("CombatModules.registerAll(this)"), "CombatModules not registered");
  assert.ok(hudMgr.includes("MovementWorldModules.registerAll(this)"), "MovementWorldModules not registered");
  assert.ok(hudMgr.includes("RenderPlayerModules.registerAll(this)"), "RenderPlayerModules not registered");
  assert.ok(hudMgr.includes("UtilityMiscModules.registerAll(this)"), "UtilityMiscModules not registered");
  assert.ok(combat.includes("target_hud") && combat.includes("crosshair_customizer"), "Missing Combat modules");
  assert.ok(movWorld.includes("speed_display") && movWorld.includes("biome_display"), "Missing Movement/World modules");
  assert.ok(rendPlayer.includes("inventory_display") && rendPlayer.includes("durability_display"), "Missing Render/Player modules");
  assert.ok(utilMisc.includes("module_list") && utilMisc.includes("notification_center"), "Missing Utility/Misc modules");
});

test("Client Part 5: Animated toggles, drag sliders, dropdowns, numeric/text inputs, focus, and validation", () => {
  const cfg = read("client/7xair-fabric/src/main/java/com/sevenxair/client/config/ClientConfig.java");
  const gui = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/AirClickGuiScreen.java");
  const gr = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/GlassRenderer.java");

  assert.ok(cfg.includes("displayStyle") && cfg.includes("paddingPx") && cfg.includes("customPrefix"), "ClientConfig missing dropdown/numeric/text fields");
  assert.ok(gr.includes("drawAnimatedToggleSwitch"), "GlassRenderer missing animated toggle switch");
  assert.ok(gui.includes("styleDropdownOpen") && gui.includes("FocusField") && gui.includes("ActiveSlider") && gui.includes("commitPaddingDraft"), "AirClickGuiScreen missing dropdown, keyboard focus, drag sliders, or numeric validation");
});

test("Client Part 6: Custom HUD Editor with corner resize, alignment guides, per-element reset, and screen clamping", () => {
  const ed = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/HudEditorScreen.java");
  const hm = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudModule.java");

  assert.ok(ed.includes("resizingModule") && ed.includes("snapGuideX") && ed.includes("clampModuleToScreen"), "HudEditorScreen missing resize handle, alignment guides, or screen clamping");
  assert.ok(ed.includes('"Opacity"') && ed.includes('"Reset All"') && ed.includes('"Reset"'), "HudEditorScreen missing opacity, individual reset, or full layout reset");
  assert.ok(hm.includes("clampedX") && hm.includes("getScaledWidth"), "HudModule must clamp rendered positions to scaled screen bounds");
});

test("Client Part 7: Premium animations, scissor clipping, Z-layering, scaled mouse mapping, and resource cleanup", () => {
  const animator = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/GuiAnimator.java");
  const glass = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/GlassRenderer.java");
  const gui = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/AirClickGuiScreen.java");
  const hud = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/HudEditorScreen.java");

  assert.ok(animator.includes("smoothStep") && animator.includes("easeOutCubic"));
  assert.ok(animator.includes("toScaledSpace") && animator.includes("withScissor"));
  assert.ok(animator.includes("enableScissor") && animator.includes("disableScissor"));
  assert.ok(animator.includes("BRAND_ICON_TEXTURE"));
  assert.ok(glass.includes("drawGlidingIndicator") && glass.includes("scaleAlpha"));
  assert.ok(gui.includes("openCloseAnim") && gui.includes("closing") && gui.includes("finalizeClose"));
  assert.ok(gui.includes("cardHoverAnim") && gui.includes("styleDropdownAnim") && gui.includes("settingsPanelAnim"));
  assert.ok(gui.includes("searchFocusAnim") && gui.includes("sidebarIndicatorY") && gui.includes("mapMouseX"));
  assert.ok(gui.includes("withScissor") && gui.includes("removed()") && gui.includes("translate(0.0f, 0.0f, 120.0f)"));
  assert.ok(hud.includes("editorAnim") && hud.includes("inspectorAnim") && hud.includes("guideAnim"));
  assert.ok(hud.includes("resize(MinecraftClient") && hud.includes("removed()"));
});

test("Client Part 8: Performance caching, RendererCompat (Sodium/Iris/VulkanMod), fault quarantine, and shutdown disposal", () => {
  const compat = read("client/7xair-fabric/src/main/java/com/sevenxair/client/compat/RendererCompat.java");
  const entry = read("client/7xair-fabric/src/main/java/com/sevenxair/client/SevenXAirClient.java");
  const cfg = read("client/7xair-fabric/src/main/java/com/sevenxair/client/config/ClientConfig.java");
  const mgr = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudManager.java");
  const mod = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/HudModule.java");
  const anim = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/GuiAnimator.java");
  const keys = read("client/7xair-fabric/src/main/java/com/sevenxair/client/input/AirKeybinds.java");

  assert.ok(compat.includes("isModLoaded(\"sodium\")") && compat.includes("isModLoaded(\"vulkanmod\")") && compat.includes("isModLoaded(\"iris\")"));
  assert.ok(compat.includes("supportsScissorClip") && compat.includes("supportsZLayerOffset") && compat.includes("supportsSoftOuterGlow"));
  assert.ok(compat.includes("reportModuleFault") && compat.includes("isModuleQuarantined"));
  assert.ok(entry.includes("RendererCompat.detect()") && entry.includes("CLIENT_STOPPING"));
  assert.ok(cfg.includes("cachedTheme") && cfg.includes("saveDebounced") && cfg.includes("flushPendingSave"));
  assert.ok(mgr.includes("CACHE_TTL_MS") && mgr.includes("refreshCacheIfNeeded"));
  assert.ok(mod.includes("isModuleQuarantined") && mod.includes("reportModuleFault"));
  assert.ok(anim.includes("TEXTURE_CACHE") && anim.includes("cachedTexture") && anim.includes("reportScissorFault"));
  assert.ok(keys.includes("dispose()") && keys.includes("saveDebounced"));
});

test("Client Part 9: Mod icon texture exists, world join/leave and resource reload hooks wired, zero missing assets", () => {
  const iconPath = path.join(ROOT, "client/7xair-fabric/src/main/resources/assets/sevenxair/icon.png");
  assert.ok(fs.existsSync(iconPath), "Missing client mod icon.png texture");
  const iconBuf = fs.readFileSync(iconPath);
  assert.equal(iconBuf.subarray(0, 4).toString("hex"), "89504e47", "icon.png must be a valid PNG");

  const modJson = read("client/7xair-fabric/src/main/resources/fabric.mod.json");
  const entry = read("client/7xair-fabric/src/main/java/com/sevenxair/client/SevenXAirClient.java");
  const combat = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/CombatTracker.java");
  const cps = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/CpsTracker.java");

  assert.ok(modJson.includes("\"icon\": \"assets/sevenxair/icon.png\""));
  assert.ok(entry.includes("ClientPlayConnectionEvents.JOIN") && entry.includes("ClientPlayConnectionEvents.DISCONNECT"));
  assert.ok(entry.includes("ResourceManagerHelper") && entry.includes("SimpleSynchronousResourceReloadListener"));
  assert.ok(combat.includes("resetSession()") && cps.includes("reset()"));
});

test("Launcher Instance Versions & Independent Fabric Loader/API: 1.21.11 + 26.2 isolation, Java metadata, validation, and UI", () => {
  const mcRs = read("apps/launcher/src-tauri/src/minecraft.rs");
  const fabricRs = read("apps/launcher/src-tauri/src/fabric.rs");
  const instRs = read("apps/launcher/src-tauri/src/instances.rs");
  const launchRs = read("apps/launcher/src-tauri/src/launch.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const pageTsx = read("apps/launcher/src/pages/InstancesPage.tsx");
  const bridgeTs = read("apps/launcher/src/lib/tauriBridge.ts");

  assert.ok(mcRs.includes("VersionJavaRequirement") && mcRs.includes("required_java_major"));
  assert.ok(fabricRs.includes("FABRIC_API_MODRINTH_ID") && fabricRs.includes("fabric-loader-{loader_version}-{mc_version}"));
  assert.ok(fabricRs.includes("ensure_fabric_api_installed") && fabricRs.includes("inspect_fabric_api_status"));
  assert.ok(fabricRs.includes("Sha512") && fabricRs.includes("gv == mc_version"));
  assert.ok(instRs.includes("auto_install_fabric_loader") && instRs.includes("auto_install_fabric_api"));
  assert.ok(instRs.includes("instance_dir_override") && instRs.includes("java_path_override"));
  assert.ok(launchRs.includes("required_java_major(&version_details)") && launchRs.includes("auto_install_fabric_loader") && launchRs.includes("auto_install_fabric_api"));
  assert.ok(libRs.includes("fn get_instance_fabric_api_status") && libRs.includes("fn sync_instance_fabric_api"));
  assert.ok(bridgeTs.includes("get_instance_fabric_api_status") && bridgeTs.includes("sync_instance_fabric_api"));
  assert.ok(pageTsx.includes("Auto-Install Fabric Loader") && pageTsx.includes("Auto-Install Fabric API"));
  assert.ok(pageTsx.includes("Edit Instance") && pageTsx.includes("Open Folder") && pageTsx.includes("Fabric API"));
});

test("Modrinth Modpacks Part 1: Mods + Modpacks navigation, .mrpack manifest/SHA-512/path-traversal engine, Details & Install modals, and Instances display", () => {
  const modrinthRs = read("apps/launcher/src-tauri/src/modrinth.rs");
  const instRs = read("apps/launcher/src-tauri/src/instances.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const pageTsx = read("apps/launcher/src/pages/ModrinthPage.tsx");
  const detailsTsx = read("apps/launcher/src/components/ModpackDetailsModal.tsx");
  const installTsx = read("apps/launcher/src/components/ModpackInstallModal.tsx");
  const instancesTsx = read("apps/launcher/src/pages/InstancesPage.tsx");

  assert.ok(modrinthRs.includes("MrpackManifest") && modrinthRs.includes("modrinth.index.json"));
  assert.ok(modrinthRs.includes("safe_join_under_root") && modrinthRs.includes("Rejected path traversal"));
  assert.ok(modrinthRs.includes("download_and_extract_modpack") && modrinthRs.includes("client-overrides/"));
  assert.ok(instRs.includes("register_modpack_instance") && instRs.includes("modpack_icon_url"));
  assert.ok(libRs.includes("fn install_modrinth_modpack") && libRs.includes("fn get_modpack_install_progress"));
  assert.ok(pageTsx.includes("Modpacks") && pageTsx.includes("ModpackDetailsModal") && pageTsx.includes("ModpackInstallModal"));
  assert.ok(pageTsx.includes("Page {page + 1}") && pageTsx.includes("Minecraft 1.21.11") && pageTsx.includes("Minecraft 26.2"));
  assert.ok(detailsTsx.includes("Changelog") && detailsTsx.includes("Compatible Modpack Releases"));
  assert.ok(installTsx.includes("installModrinthModpack") && installTsx.includes("getModpackInstallProgress"));
  assert.ok(instancesTsx.includes("inst.modpackIconUrl") && instancesTsx.includes("inst.modpackName"));
});

test("Modrinth Modpacks Part 2 & Website Download Fix: File protection, conflicts, updates, rollback, and GitHub Releases EXE URL", () => {
  const modrinthRs = read("apps/launcher/src-tauri/src/modrinth.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const modsView = read("apps/launcher/src/components/InstanceModsView.tsx");
  const webLatest = read("apps/website/public/releases/latest.json");
  const webStore = read("apps/website/api/_store.mjs");

  assert.ok(modrinthRs.includes("ModpackTrackingManifest") && modrinthRs.includes("inspect_modpack_status"));
  assert.ok(modrinthRs.includes("check_modpack_update_for_instance") && modrinthRs.includes("update_modpack_in_instance"));
  assert.ok(modrinthRs.includes("rollback_modpack_in_instance") && modrinthRs.includes("ensure_sufficient_disk_space"));
  assert.ok(modrinthRs.includes(".7xair-modpack-backup") && modrinthRs.includes("user_modified_files"));
  assert.ok(libRs.includes("fn get_modpack_status") && libRs.includes("fn check_modpack_update") && libRs.includes("fn update_modrinth_modpack") && libRs.includes("fn rollback_modpack_update"));
  assert.ok(modsView.includes("Modpack Information") && modsView.includes("File Conflict Report") && modsView.includes("Open Modpack Page") && modsView.includes("Rollback"));
  assert.ok(webLatest.includes("github.com/niyamkutu-cell/7xAir-V1/releases/latest/download/7xAir-Setup-0.1.0.exe"));
  assert.ok(webStore.includes("github.com/niyamkutu-cell/7xAir-V1/releases/latest/download/7xAir-Setup-"));
});

test("Microsoft Auth Client ID Fix: Multi-source env/build/dotenv/config resolution, UUID validation, XSTS diagnostics, skin URL, .env.example, and setup doc", () => {
  const authRs = read("apps/launcher/src-tauri/src/auth.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const profilesTsx = read("apps/launcher/src/pages/ProfilesPage.tsx");
  const releaseYml = read(".github/workflows/release.yml");
  const envEx = read(".env.example");
  const setupDoc = read("docs/MICROSOFT_AUTH_SETUP.md");

  assert.ok(authRs.includes("resolve_msa_client_id") && authRs.includes('option_env!("SEVENXAIR_MSA_CLIENT_ID")'));
  assert.ok(authRs.includes("read_dotenv_client_id") && authRs.includes("msa-config.json"));
  assert.ok(authRs.includes("is_valid_client_id") && authRs.includes("describe_xsts_error"));
  assert.ok(authRs.includes("authorization_declined") && authRs.includes("expired_token"));
  assert.ok(authRs.includes("skin_url") && authRs.includes("entitlements/mcstore"));
  assert.ok(libRs.includes("fn get_msa_auth_status"));
  assert.ok(profilesTsx.includes("getMsaAuthStatus") && profilesTsx.includes("Microsoft Sign-In Setup Required"));
  assert.ok(releaseYml.includes("SEVENXAIR_MSA_CLIENT_ID: ${{ secrets.SEVENXAIR_MSA_CLIENT_ID }}"));
  assert.ok(envEx.includes("SEVENXAIR_MSA_CLIENT_ID=") && setupDoc.includes("Allow public client flows"));
});

test("Performance Part 1: 7xAir MAXIMUM PERFORMANCE, ZGC/Java-aware flags, dedicated GPU preference, Mod Audit, Graphics Presets, and HUD Performance Monitor", () => {
  const perfRs = read("apps/launcher/src-tauri/src/performance.rs");
  const launchRs = read("apps/launcher/src-tauri/src/launch.rs");
  const perfPage = read("apps/launcher/src/pages/PerformancePage.tsx");
  const glassJava = read("client/7xair-fabric/src/main/java/com/sevenxair/client/gui/GlassRenderer.java");
  const perfMon = read("client/7xair-fabric/src/main/java/com/sevenxair/client/hud/PerformanceMonitor.java");

  assert.ok(perfRs.includes("7xAir MAXIMUM PERFORMANCE") && perfRs.includes("UseZGC"));
  assert.ok(perfRs.includes("audit_instance_optimization_mods") && perfRs.includes("set_windows_high_perf_gpu_preference"));
  assert.ok(perfRs.includes("read_instance_graphics_options") && perfRs.includes("save_instance_graphics_options"));
  assert.ok(perfRs.includes("System::new_with_specifics") && !perfRs.includes("System::new_all()"));
  assert.ok(launchRs.includes("__NV_PRIME_RENDER_OFFLOAD") && launchRs.includes("BufWriter"));
  assert.ok(perfPage.includes("Use Dedicated GPU for Java") && perfPage.includes("Configurable Graphics Presets") && perfPage.includes("Benchmark Comparator"));
  assert.ok(glassJava.includes("performanceMode") && perfMon.includes("getOnePercentLowFps"));
});

test("Part 2 Instance-Specific 7xAir Client Mod: Per-instance isolation, fabric.mod.json validation, safe backup-update, non-destructive OFF toggle, and pre-launch checks", () => {
  const cmRs = read("apps/launcher/src-tauri/src/client_manager.rs");
  const launchRs = read("apps/launcher/src-tauri/src/launch.rs");
  const modsView = read("apps/launcher/src/components/InstanceModsView.tsx");
  const settingsTsx = read("apps/launcher/src/pages/SettingsPage.tsx");
  const clientSettingsTsx = read("apps/launcher/src/pages/ClientSettingsPage.tsx");
  const typesTs = read("apps/launcher/src/types/launcher.ts");

  assert.ok(cmRs.includes("inspect_client_jar_metadata") && cmRs.includes("fabric.mod.json"));
  assert.ok(cmRs.includes("metadata_matches_mc_version") && cmRs.includes("metadata_matches_fabric_loader"));
  assert.ok(cmRs.includes("backup_existing_jar") && cmRs.includes(".7xair-client-backups"));
  assert.ok(cmRs.includes("validate_client_before_launch") && cmRs.includes("NO_COMPATIBLE_BUILD"));
  assert.ok(cmRs.includes("INCOMPATIBLE_MC_VERSION") && cmRs.includes("DUPLICATE_CLIENT_JARS") && cmRs.includes("CORRUPT_JAR_FILE"));
  // Ensure OFF toggle never deletes already-installed JARs during sync
  assert.ok(!cmRs.includes("if !effective_enabled {\n        return remove_managed_client"));
  assert.ok(launchRs.includes("validate_client_before_launch"));
  assert.ok(modsView.includes("syncInstanceClient(instance.id)") && modsView.includes("AUTO-INSTALL 7XAIR CLIENT MOD"));
  assert.ok(settingsTsx.includes("AUTO-INSTALL 7XAIR CLIENT MOD") && clientSettingsTsx.includes("AUTO-INSTALL 7XAIR CLIENT MOD"));
  assert.ok(typesTs.includes("metadataValid") && typesTs.includes("lastBackupPath") && typesTs.includes("duplicateCount"));
});

test("Part 3 Integrated Music Player: Official Audius/Deezer/Spotify PKCE backend, persistent audio engine, Mini + Full player, and background playback hooks", () => {
  const musicRs = read("apps/launcher/src-tauri/src/music.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const ctxTsx = read("apps/launcher/src/context/MusicPlayerContext.tsx");
  const barTsx = read("apps/launcher/src/components/MusicPlayerBar.tsx");
  const pageTsx = read("apps/launcher/src/pages/MusicPage.tsx");
  const appTsx = read("apps/launcher/src/App.tsx");
  const sidebarTsx = read("apps/launcher/src/components/Sidebar.tsx");

  assert.ok(musicRs.includes("discoveryprovider.audius.co/v1") && musicRs.includes("api.deezer.com"));
  assert.ok(musicRs.includes("accounts.spotify.com/authorize") && musicRs.includes("code_challenge_method=S256"));
  assert.ok(musicRs.includes("connect_spotify_pkce") && musicRs.includes("control_spotify_connect"));
  assert.ok(musicRs.includes("pause_on_minecraft_launch") && musicRs.includes("stop_on_launcher_close"));
  assert.ok(libRs.includes("mod music;") && libRs.includes("fn music_connect_spotify") && libRs.includes("fn music_search"));
  assert.ok(ctxTsx.includes("new Audio()") && ctxTsx.includes("onMinecraftLaunch") && ctxTsx.includes("toggleShuffle") && ctxTsx.includes("cycleRepeat"));
  assert.ok(barTsx.includes("music-mini-player") && barTsx.includes("music-full-overlay") && barTsx.includes("Seek track position"));
  assert.ok(pageTsx.includes("Popular Music") && pageTsx.includes("Recommended Music") && pageTsx.includes("Recently Played") && pageTsx.includes("Music Services"));
  assert.ok(pageTsx.includes("Pause Music When Minecraft Launches") && pageTsx.includes("Spotify Official OAuth 2.0 (PKCE)"));
  assert.ok(appTsx.includes("MusicPlayerProvider") && appTsx.includes("MusicPlayerBar") && appTsx.includes("onMinecraftLaunch()"));
  assert.ok(sidebarTsx.includes("music: <Music2"));
});

test("Part 4 Website Music Integration & Interactive Sound Design: /api/music proxy, 7 UI sounds, Sound Settings, Mini + Expanded player, and smooth nav", async () => {
  const indexHtml = read("apps/website/public/index.html");
  const soundJs = read("apps/website/public/sound.js");
  const musicJs = read("apps/website/public/music.js");
  const appJs = read("apps/website/public/app.js");
  const css = read("apps/website/public/styles.css");
  const musicApi = read("apps/website/api/music.mjs");

  // Website showcases Built-In Launcher Music in Features (no website music player/nav)
  assert.ok(!indexHtml.includes('data-page="music"') && !indexHtml.includes('id="page-music"'));
  assert.ok(!indexHtml.includes('id="web-music-mini"') && !indexHtml.includes('id="web-music-expanded"'));
  assert.ok(indexHtml.includes("Built-In Music Player in Launcher"));
  assert.ok(indexHtml.includes('id="sound-settings-modal"') && indexHtml.includes('id="nav-sound-btn"'));
  assert.ok(musicJs.includes('audio.preload = "none"') && musicJs.includes("startSpotifyPkce"));
  assert.ok(!musicJs.includes("client_secret") && !musicApi.includes("client_secret"));

  // All 7 UI interaction sounds + anti-overlap + persisted settings
  for (const kind of ['"button"', '"nav"', '"page"', '"modalClose"', '"dropdown"', '"success"', '"error"']) {
    assert.ok(soundJs.includes(kind), `Missing UI sound kind: ${kind}`);
  }
  assert.ok(soundJs.includes("MIN_GAP_MS") && soundJs.includes("MAX_VOICES") && soundJs.includes("masterVolume"));
  assert.ok(appJs.includes('SevenXAirSound.play("nav")') && !appJs.includes("screenshot-form"));
  assert.ok(css.includes("@keyframes pageFadeSlide") && css.includes("@media (max-width: 760px)"));

  // Live /api/music?action=status HTTP test via website server
  const { createWebsiteServer } = await import("../scripts/website-server.mjs");
  const srv = createWebsiteServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  try {
    const resp = await fetch(`http://127.0.0.1:${addr.port}/api/music?action=status`);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.ok(Array.isArray(data.providers) && data.providers.length === 3);
    assert.ok(data.spotify && data.spotify.premiumRequiredNote.includes("Spotify Premium"));
    const soundResp = await fetch(`http://127.0.0.1:${addr.port}/sound.js`);
    assert.equal(soundResp.status, 200);
    const musicResp = await fetch(`http://127.0.0.1:${addr.port}/music.js`);
    assert.equal(musicResp.status, 200);
  } finally {
    srv.close();
  }
});

test("Premium UI & Design System Upgrade: 8 anime wallpapers, serde-safe font/wallpaper settings, ThemesPage preview cards, and shared glass design system", () => {
  const expectedWallpapers = [
    "anime-crimson-eclipse.jpg",
    "anime-moonlit-window.jpg",
    "anime-azure-peaks.jpg",
    "anime-sakura-shrine.jpg",
    "anime-indigo-shrine.jpg",
    "anime-starlit-curtains.jpg",
    "anime-midnight-headphones.jpg",
    "anime-emerald-lanterns.jpg",
  ];
  for (const file of expectedWallpapers) {
    const abs = path.join(ROOT, "apps/launcher/public/backgrounds", file);
    assert.ok(fs.existsSync(abs) && fs.statSync(abs).size > 10000, `Missing anime wallpaper: ${file}`);
  }
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const backdrop = read("apps/launcher/src/components/NatureBackdrop.tsx");
  const themesPage = read("apps/launcher/src/pages/ThemesPage.tsx");
  const glassCss = read("apps/launcher/src/styles/glass.css");
  const webCss = read("apps/website/public/styles.css");

  assert.ok(configRs.includes("default_wallpaper_id") && configRs.includes("default_wallpaper_dim") && configRs.includes("default_font_size"));
  assert.ok(backdrop.includes("anime-wallpaper-layer") && backdrop.includes("anime-wallpaper-scrim"));
  assert.ok(themesPage.includes("Font Size") && themesPage.includes("Wallpaper Engine") && themesPage.includes("theme-mini-preview"));
  assert.ok(!themesPage.includes("PalSupervisor") && !themesPage.includes("Palworld"));
  assert.ok(glassCss.includes("--ui-font-scale") && glassCss.includes("wallpaper-grid") && glassCss.includes(":focus-visible"));
  assert.ok(webCss.includes("7xAir Shared Premium Glassmorphism") && webCss.includes(":focus-visible"));
});

test("Anime Themes & Wallpaper Engine: 3 new themes, Theme 1..12 naming, custom JPG/PNG/WebP uploads, filters, auto theme switching, and separate website engine", async () => {
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const themesTs = read("apps/launcher/src/theme/themes.ts");
  const themesCss = read("apps/launcher/src/styles/themes.css");
  const airJava = read("client/7xair-fabric/src/main/java/com/sevenxair/client/theme/AirTheme.java");
  const themesPage = read("apps/launcher/src/pages/ThemesPage.tsx");
  const appTsx = read("apps/launcher/src/App.tsx");
  const webHtml = read("apps/website/public/index.html");
  const webWpJs = read("apps/website/public/wallpaper.js");
  const webCss = read("apps/website/public/styles.css");

  for (const id of ["midnight-anime", "serenity-nature", "anime-glass"]) {
    assert.ok(configRs.includes(`"${id}"`), `config.rs missing ${id}`);
    assert.ok(themesTs.includes(`"${id}"`), `themes.ts missing ${id}`);
    assert.ok(themesCss.includes(`data-theme="${id}"`), `themes.css missing ${id}`);
    assert.ok(airJava.includes(`"${id}"`), `AirTheme.java missing ${id}`);
    assert.ok(webCss.includes(`data-theme="${id}"`), `website styles.css missing ${id}`);
  }

  for (let i = 1; i <= 12; i++) {
    assert.ok(themesTs.includes(`name: "Theme ${i}"`), `themes.ts missing Theme ${i}`);
  }
  for (let i = 1; i <= 9; i++) {
    assert.ok(webHtml.includes(`>Theme ${i}<`), `website index.html missing Theme ${i}`);
  }

  assert.ok(fs.existsSync(path.join(ROOT, "apps/launcher/public/backgrounds/anime-serenity-nature.jpg")));
  assert.ok(fs.existsSync(path.join(ROOT, "apps/website/public/backgrounds/anime-serenity-nature.jpg")));
  assert.ok(configRs.includes("save_persisted_wallpaper") && configRs.includes("remove_persisted_wallpaper"));
  assert.ok(themesPage.includes("Upload Wallpaper") && themesPage.includes("Restore Default") && themesPage.includes("Automatic Theme Switching"));
  assert.ok(appTsx.includes("prefers-color-scheme: dark") && appTsx.includes("themeSwitchMode"));
  assert.ok(webWpJs.includes("sevenxair.web.wallpaper.v1") && webWpJs.includes("prefers-color-scheme: dark"));

  const { createWebsiteServer } = await import("../scripts/website-server.mjs");
  const srv = createWebsiteServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  try {
    const resp = await fetch(`http://127.0.0.1:${addr.port}/wallpaper.js`);
    assert.equal(resp.status, 200);
  } finally {
    srv.close();
  }
});

test("Advanced Atmosphere & Animation Engine: Midnight/Serenity overlays, vector rockets/aircraft/helicopters/birds/butterflies, 6 glossy reaction icons, and FX controls", async () => {
  const overlay = read("apps/launcher/src/components/AtmosphereOverlay.tsx");
  const appTsx = read("apps/launcher/src/App.tsx");
  const themesPage = read("apps/launcher/src/pages/ThemesPage.tsx");
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const webAtmo = read("apps/website/public/atmosphere.js");
  const webHtml = read("apps/website/public/index.html");

  for (const fn of ["drawRocket", "drawAirplane", "drawHelicopter", "drawBirdFlock", "drawButterfly", "drawReactionIcon"]) {
    assert.ok(overlay.includes(`function ${fn}`), `AtmosphereOverlay missing ${fn}`);
  }
  assert.ok(overlay.includes("smokePool") && overlay.includes("rainPool") && overlay.includes("particlePool"));
  assert.ok(overlay.includes("cancelAnimationFrame") && overlay.includes('pointerEvents: "none"'));
  assert.ok(overlay.includes("REACTION_ICON_CATALOG") && overlay.includes("sparkle-joy") && overlay.includes("cool-shades"));
  assert.ok(appTsx.includes("<AtmosphereOverlay") && appTsx.includes("paused={animationsPaused}"));
  assert.ok(themesPage.includes("Atmosphere &amp; Animation Engine Controls") && themesPage.includes("Low Effects") && themesPage.includes("Maximum Effects"));
  assert.ok(configRs.includes("fx_quality") && configRs.includes("fx_density") && configRs.includes("fx_speed") && configRs.includes("fx_flying_objects"));
  assert.ok(webHtml.includes('id="web-atmosphere-canvas"') && webHtml.includes('id="web-fx-modal"'));
  assert.ok(webAtmo.includes("drawRocket") && webAtmo.includes("drawHelicopter") && webAtmo.includes("drawGlossyReaction"));

  const { createWebsiteServer } = await import("../scripts/website-server.mjs");
  const srv = createWebsiteServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  try {
    const resp = await fetch(`http://127.0.0.1:${addr.port}/atmosphere.js`);
    assert.equal(resp.status, 200);
  } finally {
    srv.close();
  }
});

test("Advanced Customization Center: All 27 verified fonts, HEX/RGB/HSL + WCAG contrast, Custom Themes CRUD, granular animations, 3 sound packs, and persistence", async () => {
  const custTs = read("apps/launcher/src/lib/customization.ts");
  const soundTs = read("apps/launcher/src/lib/launcherSound.ts");
  const centerTsx = read("apps/launcher/src/components/CustomizationCenter.tsx");
  const configRs = read("apps/launcher/src-tauri/src/config.rs");
  const webCustJs = read("apps/website/public/customization.js");
  const webHtml = read("apps/website/public/index.html");

  const requiredFonts = [
    "Inter", "Manrope", "Plus Jakarta Sans", "DM Sans", "Outfit", "Sora", "Space Grotesk",
    "Urbanist", "Rubik", "Nunito Sans", "Poppins", "Montserrat", "Lato", "Roboto",
    "Open Sans", "IBM Plex Sans", "Source Sans 3", "Geist", "Fira Sans", "Work Sans",
    "Lexend", "Exo 2", "Rajdhani", "Oxanium", "JetBrains Mono", "Fira Code", "Space Mono",
  ];
  for (const font of requiredFonts) {
    assert.ok(custTs.includes(`"${font}"`), `Launcher FONT_LIBRARY missing ${font}`);
    assert.ok(webCustJs.includes(`"${font}"`), `Website WEB_FONTS missing ${font}`);
  }

  assert.ok(custTs.includes("parseColorToHex") && custTs.includes("computeContrastRatio") && custTs.includes("registerCustomFontFace"));
  assert.ok(soundTs.includes("glass-chime") && soundTs.includes("cyber-pulse") && soundTs.includes("soft-nature"));
  assert.ok(centerTsx.includes("Create Custom Theme") && centerTsx.includes("Confirm Delete") && centerTsx.includes("Restore Defaults"));
  assert.ok(centerTsx.includes("Rocket Frequency") && centerTsx.includes("Helicopter Frequency") && centerTsx.includes("Falling Leaf Intensity"));
  assert.ok(configRs.includes("load_customization_json") && configRs.includes("save_customization_json"));
  assert.ok(!webHtml.includes('id="web-customization-modal"') && !webHtml.includes('id="open-web-cust-btn"'), "Website must not show Customization Center");

  const { createWebsiteServer } = await import("../scripts/website-server.mjs");
  const srv = createWebsiteServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  try {
    const resp = await fetch(`http://127.0.0.1:${addr.port}/customization.js`);
    assert.equal(resp.status, 200);
  } finally {
    srv.close();
  }
});

test("Built-In Performance Optimizer: Real process/Java audit, honest unavailable metrics, safe Cleanup Center preview+confirm, 5 profiles, JVM validator & backup/revert", () => {
  const perfRs = read("apps/launcher/src-tauri/src/performance.rs");
  const panelTsx = read("apps/launcher/src/components/PerformanceOptimizerPanel.tsx");
  const pageTsx = read("apps/launcher/src/pages/PerformancePage.tsx");

  assert.ok(perfRs.includes("audit_system_memory_and_processes") && perfRs.includes("is_protected_process_name"));
  assert.ok(perfRs.includes("scan_safe_cleanup_candidates") && perfRs.includes("execute_safe_cleanup"));
  assert.ok(perfRs.includes("is_forbidden_personal_or_game_path") && perfRs.includes("validate_jvm_arguments"));
  assert.ok(perfRs.includes("record_jvm_backup") && perfRs.includes("gpu_usage_percent: None"));
  assert.ok(panelTsx.includes("Unavailable on OS API") && panelTsx.includes("Safe Cleanup Center") && panelTsx.includes("Confirm Delete Selected Temp/Cache Files"));
  assert.ok(panelTsx.includes("Maximum Performance") && panelTsx.includes("Visual Quality") && panelTsx.includes("Competitive PvP") && panelTsx.includes("Revert"));
  assert.ok(pageTsx.includes("<PerformanceOptimizerPanel"));
});

test("Premium Interaction & Audio System: Metallic 7-sound synthesis, gesture unlock, Custom Playlists + Equalizer, InteractionLayer, and loading/scrollbar/skeleton polish", () => {
  const soundTs = read("apps/launcher/src/lib/launcherSound.ts");
  const interTsx = read("apps/launcher/src/components/InteractionLayer.tsx");
  const musicCtx = read("apps/launcher/src/context/MusicPlayerContext.tsx");
  const musicBar = read("apps/launcher/src/components/MusicPlayerBar.tsx");
  const musicPage = read("apps/launcher/src/pages/MusicPage.tsx");
  const appTsx = read("apps/launcher/src/App.tsx");
  const glassCss = read("apps/launcher/src/styles/glass.css");
  const webSound = read("apps/website/public/sound.js");

  for (const kind of ["button", "nav", "card", "toggle", "dropdown", "notification", "important"]) {
    assert.ok(soundTs.includes(`${kind}:`), `launcherSound.ts missing metallic spec: ${kind}`);
  }
  assert.ok(soundTs.includes("unlockedByGesture") && soundTs.includes("MAX_VOICES") && soundTs.includes("metallic-pro"));
  assert.ok(interTsx.includes("--card-mx") && interTsx.includes("custom-cursor-ring") && interTsx.includes("unlockLauncherAudio"));
  assert.ok(musicCtx.includes("createCustomPlaylist") && musicCtx.includes("addTrackToCustomPlaylist"));
  assert.ok(musicBar.includes("eq-bars") && musicPage.includes("My Custom Playlists"));
  assert.ok(appTsx.includes("<InteractionLayer") && appTsx.includes("theme-loading-screen"));
  assert.ok(glassCss.includes("::-webkit-scrollbar") && glassCss.includes("skeleton-shimmer") && glassCss.includes("progress-track-animated"));
  assert.ok(webSound.includes('"cardHover"') && webSound.includes('"toggle"') && webSound.includes('"important"'));
});

test("Microsoft 1-Click Browser PKCE OAuth: Local loopback callback, prompt=select_account, rundll32 Windows URL opener, and IPC wiring", () => {
  const authRs = read("apps/launcher/src-tauri/src/auth.rs");
  const libRs = read("apps/launcher/src-tauri/src/lib.rs");
  const bridgeTs = read("apps/launcher/src/lib/tauriBridge.ts");
  const modalTsx = read("apps/launcher/src/components/AuthQuickModal.tsx");
  const profTsx = read("apps/launcher/src/pages/ProfilesPage.tsx");

  assert.ok(authRs.includes("pub async fn sign_in_microsoft_browser") && authRs.includes('TcpListener::bind("127.0.0.1:0")'));
  assert.ok(authRs.includes("code_challenge_method=S256") && authRs.includes("prompt=select_account"));
  assert.ok(authRs.includes("rundll32.exe") && authRs.includes("FileProtocolHandler"));
  assert.ok(libRs.includes("async fn sign_in_microsoft_browser"));
  assert.ok(bridgeTs.includes("sign_in_microsoft_browser"));
  assert.ok(modalTsx.includes("signInMicrosoftBrowser") && profTsx.includes("signInMicrosoftBrowser"));
});

test("Built-In Managed Java Runtime & Rust Compile Guards: Auto-downloads Eclipse Temurin JRE 21 on launch, sysinfo 0.31.4 & Deserialize fixed", () => {
  const javaRs = read("apps/launcher/src-tauri/src/java.rs");
  const launchRs = read("apps/launcher/src-tauri/src/launch.rs");
  const perfRs = read("apps/launcher/src-tauri/src/performance.rs");
  const webHtml = read("apps/website/public/index.html");

  assert.ok(javaRs.includes("pub async fn ensure_managed_java_runtime") && javaRs.includes("api.adoptium.net/v3/binary/latest"));
  assert.ok(launchRs.includes("ensure_managed_java_runtime(paths, req)"));
  assert.ok(perfRs.includes("use serde::{Deserialize, Serialize};"));
  assert.ok(perfRs.includes("sys.refresh_processes(sysinfo::ProcessesToUpdate::All);"));
  assert.ok(!perfRs.includes("ProcessesToUpdate::All, true"));
  assert.ok(webHtml.includes("Launching Soon") && webHtml.includes('disabled aria-disabled="true"'));
});
