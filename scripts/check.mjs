#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LAUNCHER = path.join(ROOT, "apps", "launcher");
const TAURI = path.join(LAUNCHER, "src-tauri");
const FABRIC = path.join(ROOT, "client", "7xair-fabric");

const errors = [];
const checks = [];

function pass(name) {
  checks.push({ ok: true, name });
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail });
  errors.push(`${name}: ${detail}`);
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function checkJson(relPath) {
  try {
    const parsed = JSON.parse(readText(relPath));
    pass(`Valid JSON: ${relPath}`);
    return parsed;
  } catch (err) {
    fail(`Valid JSON: ${relPath}`, err.message);
    return null;
  }
}

// 1. Validate core JSON files
checkJson("package.json");
checkJson("apps/launcher/package.json");
checkJson("apps/launcher/tsconfig.json");
checkJson("apps/launcher/tsconfig.node.json");
checkJson("apps/launcher/updates/latest.example.json");
checkJson("apps/website/package.json");
checkJson("apps/website/vercel.json");
checkJson("apps/website/public/releases/latest.json");
const tauriConf = checkJson("apps/launcher/src-tauri/tauri.conf.json");
const capabilities = checkJson("apps/launcher/src-tauri/capabilities/default.json");
checkJson("client/7xair-fabric/src/main/resources/fabric.mod.json");
checkJson("client/7xair-fabric/src/main/resources/7xair.mixins.json");
checkJson("client/7xair-fabric/src/main/resources/assets/sevenxair/lang/en_us.json");

// 2. Validate Tauri 2 config & Windows NSIS icons
if (tauriConf) {
  if (tauriConf.productName === "7xAir") pass("Tauri productName is 7xAir");
  else fail("Tauri productName", `expected 7xAir, got ${tauriConf.productName}`);

  const mainWin = tauriConf.app?.windows?.[0];
  if (mainWin?.decorations === false && mainWin?.transparent === true) {
    pass("Frameless transparent Windows window configured");
  } else {
    fail("Window config", "expected decorations=false and transparent=true");
  }

  if (tauriConf.bundle?.targets?.includes("nsis")) {
    pass("Windows NSIS EXE installer target configured");
  } else {
    fail("NSIS target", "bundle.targets missing 'nsis'");
  }

  for (const iconRel of tauriConf.bundle?.icon ?? []) {
    const abs = path.join(TAURI, iconRel);
    if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
      pass(`Icon exists: src-tauri/${iconRel}`);
    } else {
      fail(`Icon exists: src-tauri/${iconRel}`, "file missing or empty");
    }
  }
}

if (capabilities) {
  const requiredPerms = [
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
  ];
  const missing = requiredPerms.filter((p) => !capabilities.permissions?.includes(p));
  if (missing.length === 0) pass("Tauri 2 window capabilities complete");
  else fail("Tauri 2 capabilities", `missing: ${missing.join(", ")}`);
}

// 3. Verify 7-theme parity across Rust, TypeScript, CSS, Fabric Java, and Website CSS
const expectedThemes = [
  "azure-mountains",
  "emerald-wilderness",
  "midnight-forest",
  "dreamy-anime",
  "sunset-horizon",
  "frozen-peaks",
  "sakura-valley",
];

const configRs = readText("apps/launcher/src-tauri/src/config.rs");
const themesTs = readText("apps/launcher/src/theme/themes.ts");
const themesCss = readText("apps/launcher/src/styles/themes.css");
const webCss = readText("apps/website/public/styles.css");
const airThemeJava = readText(
  "client/7xair-fabric/src/main/java/com/sevenxair/client/theme/AirTheme.java"
);

const missingThemes = [];
for (const id of expectedThemes) {
  if (!configRs.includes(`"${id}"`)) missingThemes.push(`config.rs:${id}`);
  if (!themesTs.includes(`"${id}"`)) missingThemes.push(`themes.ts:${id}`);
  if (!themesCss.includes(`data-theme="${id}"`)) missingThemes.push(`themes.css:${id}`);
  if (!webCss.includes(`data-theme="${id}"`)) missingThemes.push(`website/styles.css:${id}`);
  if (!airThemeJava.includes(`"${id}"`)) missingThemes.push(`AirTheme.java:${id}`);
}
if (missingThemes.length === 0) {
  pass("All 7 color themes synchronized across Rust, TypeScript, CSS, Website, and Fabric Java");
} else {
  fail("Theme parity", `missing ${missingThemes.join(", ")}`);
}

// 4. Verify all Rust modules exist and are registered in lib.rs
const libRs = readText("apps/launcher/src-tauri/src/lib.rs");
const rustModules = [
  "auth",
  "client_manager",
  "config",
  "fabric",
  "instances",
  "java",
  "launch",
  "minecraft",
  "modrinth",
  "music",
  "performance",
  "updater",
  "windows",
];
const missingMods = rustModules.filter(
  (m) =>
    !fs.existsSync(path.join(TAURI, "src", `${m}.rs`)) ||
    !libRs.includes(`mod ${m};`)
);
if (missingMods.length === 0) {
  pass(`All ${rustModules.length} Rust backend modules present and registered`);
} else {
  fail("Rust modules", `missing ${missingMods.join(", ")}`);
}

// 5. Verify Tauri IPC command parity between Rust lib.rs and TS tauriBridge.ts
const bridgeTs = readText("apps/launcher/src/lib/tauriBridge.ts");
const ipcCommands = [
  "get_app_info",
  "load_settings",
  "save_settings",
  "get_system_snapshot",
  "get_minecraft_metadata",
  "detect_java",
  "get_fabric_loaders",
  "list_profiles",
  "create_offline_profile",
  "set_active_profile",
  "delete_profile",
  "get_msa_auth_status",
  "sign_in_microsoft_browser",
  "start_microsoft_login",
  "poll_microsoft_login",
  "list_instances",
  "create_instance",
  "clone_instance",
  "update_instance",
  "delete_instance",
  "open_instance_folder",
  "open_instance_mods_folder",
  "get_instance_fabric_api_status",
  "sync_instance_fabric_api",
  "get_client_integrity",
  "sync_instance_client_cmd",
  "update_instance_client",
  "repair_instance_client",
  "remove_instance_client",
  "set_instance_client_override",
  "sync_all_clients",
  "get_performance_telemetry",
  "get_optimization_recommendations",
  "apply_performance_preset",
  "run_diagnostics",
  "audit_instance_mods",
  "get_instance_graphics_options",
  "save_instance_graphics_options_cmd",
  "set_gpu_high_performance_preference",
  "analyze_crash_logs",
  "check_launcher_update",
  "download_launcher_update",
  "get_updater_status",
  "install_launcher_update",
  "rollback_launcher_update",
  "search_modrinth",
  "get_modrinth_versions",
  "install_modrinth_content",
  "install_modrinth_modpack",
  "get_modpack_install_progress",
  "get_modpack_status",
  "check_modpack_update",
  "update_modrinth_modpack",
  "rollback_modpack_update",
  "list_instance_content",
  "toggle_instance_content",
  "remove_instance_content",
  "check_instance_updates",
  "update_instance_content",
  "check_instance_compatibility",
  "launch_instance",
  "get_launch_status",
  "stop_instance",
  "music_get_state",
  "music_save_preferences",
  "music_record_played",
  "music_fetch_discovery",
  "music_search",
  "music_fetch_collection_tracks",
  "music_set_spotify_client_id",
  "music_connect_spotify",
  "music_disconnect_spotify",
  "music_spotify_control",
  "list_custom_wallpapers",
  "upload_custom_wallpaper",
  "delete_custom_wallpaper",
  "load_customization",
  "save_customization",
  "get_system_memory_audit",
  "scan_cleanup_center",
  "run_safe_cleanup",
  "validate_jvm_args_cmd",
  "get_jvm_backups",
  "backup_and_apply_jvm_profile",
  "revert_jvm_backup",
];
const missingIpc = ipcCommands.filter(
  (cmd) => !libRs.includes(`fn ${cmd}`) || !bridgeTs.includes(`"${cmd}"`)
);
if (missingIpc.length === 0) {
  pass(`All ${ipcCommands.length} Tauri IPC commands synchronized between Rust and TypeScript`);
} else {
  fail("IPC parity", `missing ${missingIpc.join(", ")}`);
}

// 6. Verify Fabric mod targets
for (const targetFile of ["versions/1.21.11.properties", "versions/26.2.properties"]) {
  if (fs.existsSync(path.join(FABRIC, targetFile))) {
    pass(`Fabric build target exists: ${targetFile}`);
  } else {
    fail(`Fabric build target`, `missing ${targetFile}`);
  }
}

// 7. Verify all relative imports in apps/launcher/src resolve to actual files
const srcDir = path.join(LAUNCHER, "src");
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const tsFiles = walk(srcDir);
const brokenImports = [];
const importRe = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g;
for (const file of tsFiles) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  while ((match = importRe.exec(text)) !== null) {
    const spec = match[1] || match[2];
    const base = path.resolve(path.dirname(file), spec);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.css`];
    if (!candidates.some((c) => fs.existsSync(c))) {
      brokenImports.push(`${path.relative(ROOT, file)} -> ${spec}`);
    }
  }
}
if (brokenImports.length === 0) {
  pass(`All relative imports resolved across ${tsFiles.length} TS/TSX modules`);
} else {
  fail("Relative imports", brokenImports.join("; "));
}

// 8. Verify required project docs exist
for (const doc of ["TODO.md", "BUILD_STATUS.md", "ARCHITECTURE.md"]) {
  if (fs.existsSync(path.join(ROOT, doc))) pass(`Required doc exists: ${doc}`);
  else fail(`Required doc exists: ${doc}`, "missing");
}

for (const c of checks) {
  console.log(`${c.ok ? "[PASS]" : "[FAIL]"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed.`);
