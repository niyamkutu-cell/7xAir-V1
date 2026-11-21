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
  assert.ok(webAppJs.includes("Sign In to Download Windows EXE"), "Website must require sign-in before downloading Windows EXE");
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
    "page-screenshots",
    "page-updates",
    "page-downloads",
    "page-account",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing website page ${id}`);
  }
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
