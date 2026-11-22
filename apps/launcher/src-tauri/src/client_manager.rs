use crate::instances::{ClientOverrideMode, GameInstance};
use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use zip::ZipArchive;

#[derive(Debug, Error)]
pub enum ClientManagerError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("instance '{0}' uses vanilla loader; 7xAir client requires Fabric")]
    VanillaUnsupported(String),
    #[error("no compatible 7xAir client build is available for Minecraft {0} in client-bundles/")]
    BundleMissing(String),
    #[error("client bundle JAR for Minecraft {0} failed integrity or metadata validation: {1}")]
    CorruptBundle(String, String),
    #[error("pre-launch 7xAir client validation failed: {0}")]
    ValidationFailed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientBundleCatalogEntry {
    pub mc_version: String,
    pub client_version: String,
    pub filename: String,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientBundleCatalog {
    pub bundles: Vec<ClientBundleCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedClientState {
    pub enabled: bool,
    pub override_mode: ClientOverrideMode,
    pub client_id: String,
    pub client_version: Option<String>,
    pub mc_version: String,
    pub fabric_loader: Option<String>,
    pub installed_filename: Option<String>,
    pub installed_sha256: Option<String>,
    pub expected_sha256: Option<String>,
    #[serde(default)]
    pub last_backup_path: Option<String>,
    pub updated_at_epoch: u64,
}

#[derive(Debug, Clone)]
pub struct ParsedFabricModMeta {
    pub id: String,
    pub version: String,
    pub minecraft_constraints: Vec<String>,
    pub fabric_loader_constraints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientIntegrityReport {
    pub instance_id: String,
    pub mc_version: String,
    pub loader: String,
    pub override_mode: ClientOverrideMode,
    pub effective_enabled: bool,
    pub bundle_available: bool,
    pub bundle_version: Option<String>,
    pub bundle_sha256: Option<String>,
    pub installed: bool,
    pub installed_filename: Option<String>,
    pub installed_version: Option<String>,
    pub installed_sha256: Option<String>,
    pub mods_dir: String,
    pub valid_zip_header: bool,
    pub metadata_valid: bool,
    pub mc_compatible: bool,
    pub fabric_loader_compatible: bool,
    pub duplicate_count: usize,
    pub hash_matches_bundle: bool,
    pub update_available: bool,
    pub last_backup_path: Option<String>,
    pub status_message: String,
    pub healthy: bool,
    pub issues: Vec<String>,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn bundles_dir(paths: &LauncherPaths) -> PathBuf {
    PathBuf::from(&paths.root_dir).join("client-bundles")
}

pub fn managed_jar_name(mc_version: &str) -> String {
    format!("7xair-client-{mc_version}.jar")
}

pub fn instance_mods_dir(instance: &GameInstance) -> PathBuf {
    Path::new(&instance.instance_dir).join("mods")
}

pub fn instance_client_backups_dir(instance: &GameInstance) -> PathBuf {
    Path::new(&instance.instance_dir).join(".7xair-client-backups")
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

/// Verifies both the ZIP local header signature and that the JAR archive's central directory opens cleanly.
pub fn has_valid_jar_zip_header(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    if bytes.len() < 22
        || bytes[0] != 0x50
        || bytes[1] != 0x4B
        || bytes[2] != 0x03
        || bytes[3] != 0x04
    {
        return false;
    }
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    ZipArchive::new(file).is_ok()
}

fn extract_constraint_list(val: Option<&serde_json::Value>) -> Vec<String> {
    match val {
        Some(serde_json::Value::String(s)) => vec![s.trim().to_string()],
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

/// Opens a JAR archive and parses `fabric.mod.json` metadata to validate mod ID, version, and dependencies.
pub fn inspect_client_jar_metadata(path: &Path) -> Result<ParsedFabricModMeta, String> {
    let file = fs::File::open(path).map_err(|e| format!("unable to open JAR: {e}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("corrupted or truncated ZIP/JAR archive: {e}"))?;
    let mut entry = archive
        .by_name("fabric.mod.json")
        .map_err(|_| "missing fabric.mod.json inside JAR".to_string())?;
    let mut raw = String::new();
    entry
        .read_to_string(&mut raw)
        .map_err(|e| format!("unreadable fabric.mod.json: {e}"))?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid JSON in fabric.mod.json: {e}"))?;

    let id = parsed
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let version = parsed
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if id.is_empty() {
        return Err("fabric.mod.json missing 'id' field".to_string());
    }

    let depends = parsed.get("depends");
    let minecraft_constraints =
        extract_constraint_list(depends.and_then(|d| d.get("minecraft")));
    let fabric_loader_constraints =
        extract_constraint_list(depends.and_then(|d| d.get("fabricloader")));

    Ok(ParsedFabricModMeta {
        id,
        version,
        minecraft_constraints,
        fabric_loader_constraints,
    })
}

fn is_sevenxair_mod_id(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    lower == "sevenxair" || lower == "7xair" || lower == "7xair-client"
}

fn parse_numeric_version(raw: &str) -> Option<Vec<u64>> {
    let core = raw
        .trim()
        .split(['+', '-'])
        .next()
        .unwrap_or("")
        .trim();
    if core.is_empty() {
        return None;
    }
    let mut parts = Vec::new();
    for seg in core.split('.') {
        if seg.eq_ignore_ascii_case("x") || seg == "*" {
            break;
        }
        let num = seg.parse::<u64>().ok()?;
        parts.push(num);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

fn compare_versions(a: &[u64], b: &[u64]) -> std::cmp::Ordering {
    let len = a.len().max(b.len());
    for i in 0..len {
        let av = *a.get(i).unwrap_or(&0);
        let bv = *b.get(i).unwrap_or(&0);
        match av.cmp(&bv) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

fn matches_single_clause(target: &[u64], clause: &str) -> bool {
    let c = clause.trim();
    if c.is_empty() || c == "*" {
        return true;
    }
    if let Some(rest) = c.strip_prefix(">=") {
        return parse_numeric_version(rest)
            .map(|v| compare_versions(target, &v) != std::cmp::Ordering::Less)
            .unwrap_or(false);
    }
    if let Some(rest) = c.strip_prefix("<=") {
        return parse_numeric_version(rest)
            .map(|v| compare_versions(target, &v) != std::cmp::Ordering::Greater)
            .unwrap_or(false);
    }
    if let Some(rest) = c.strip_prefix('>') {
        return parse_numeric_version(rest)
            .map(|v| compare_versions(target, &v) == std::cmp::Ordering::Greater)
            .unwrap_or(false);
    }
    if let Some(rest) = c.strip_prefix('<') {
        return parse_numeric_version(rest)
            .map(|v| compare_versions(target, &v) == std::cmp::Ordering::Less)
            .unwrap_or(false);
    }
    if let Some(rest) = c.strip_prefix('~').or_else(|| c.strip_prefix('^')) {
        let Some(base) = parse_numeric_version(rest) else {
            return false;
        };
        if compare_versions(target, &base) == std::cmp::Ordering::Less {
            return false;
        }
        let target_major = *target.first().unwrap_or(&0);
        let base_major = *base.first().unwrap_or(&0);
        return target_major == base_major;
    }
    let clean = c.strip_prefix('=').unwrap_or(c).trim();
    if clean.ends_with(".x") || clean.ends_with(".*") {
        let prefix = clean.trim_end_matches(".x").trim_end_matches(".*");
        let Some(base) = parse_numeric_version(prefix) else {
            return false;
        };
        return base
            .iter()
            .enumerate()
            .all(|(idx, val)| *target.get(idx).unwrap_or(&0) == *val);
    }
    parse_numeric_version(clean)
        .map(|v| compare_versions(target, &v) == std::cmp::Ordering::Equal)
        .unwrap_or(false)
}

/// Evaluates Fabric dependency ranges (e.g. `">=1.21.11 <1.22"`, `">=26.2 <26.3"`, `">=0.16.10"`).
pub fn version_satisfies_fabric_constraints(target_version: &str, constraints: &[String]) -> bool {
    if constraints.is_empty() {
        return true;
    }
    let Some(target_nums) = parse_numeric_version(target_version) else {
        return false;
    };
    // Fabric allows OR across array entries, AND across space-separated tokens within one entry
    constraints.iter().any(|entry| {
        let tokens: Vec<&str> = entry.split_whitespace().collect();
        if tokens.is_empty() {
            return true;
        }
        tokens
            .iter()
            .all(|tok| matches_single_clause(&target_nums, tok))
    })
}

/// Checks that a parsed `fabric.mod.json` is genuinely a 7xAir client build targeting `mc_version`.
pub fn metadata_matches_mc_version(meta: &ParsedFabricModMeta, mc_version: &str) -> bool {
    if !is_sevenxair_mod_id(&meta.id) {
        return false;
    }
    // If version embeds `+mc<ver>`, enforce exact MC target match (never allow 1.21.11 JAR in 26.2!)
    if let Some((_, suffix)) = meta.version.split_once("+mc") {
        let embedded_mc = suffix
            .split(['-', '_', ' '])
            .next()
            .unwrap_or("")
            .trim();
        if !embedded_mc.is_empty() && !embedded_mc.eq_ignore_ascii_case(mc_version) {
            return false;
        }
    }
    if meta.minecraft_constraints.is_empty() {
        return false;
    }
    version_satisfies_fabric_constraints(mc_version, &meta.minecraft_constraints)
}

/// Checks that a parsed `fabric.mod.json` is compatible with the instance's Fabric Loader version.
pub fn metadata_matches_fabric_loader(
    meta: &ParsedFabricModMeta,
    fabric_loader_version: Option<&str>,
) -> bool {
    let Some(loader_ver) = fabric_loader_version.map(|s| s.trim()).filter(|s| !s.is_empty()) else {
        return true;
    };
    if meta.fabric_loader_constraints.is_empty() {
        return true;
    }
    version_satisfies_fabric_constraints(loader_ver, &meta.fabric_loader_constraints)
}

pub fn resolve_effective_client_enabled(
    instance: &GameInstance,
    global_auto_install: bool,
) -> bool {
    if instance.loader != "fabric" {
        return false;
    }
    match instance.client_override {
        ClientOverrideMode::Inherit => global_auto_install,
        ClientOverrideMode::ForceOn => true,
        ClientOverrideMode::ForceOff => false,
    }
}

fn load_bundle_catalog(paths: &LauncherPaths) -> ClientBundleCatalog {
    let catalog_path = bundles_dir(paths).join("catalog.json");
    if !catalog_path.exists() {
        return ClientBundleCatalog::default();
    }
    fs::read_to_string(&catalog_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ClientBundleCatalog>(&raw).ok())
        .unwrap_or_default()
}

fn validate_staged_bundle(bundle_path: &Path, mc_version: &str) -> Result<Option<ParsedFabricModMeta>, String> {
    if !has_valid_jar_zip_header(bundle_path) {
        return Err("ZIP/JAR archive header or central directory is corrupted".to_string());
    }
    match inspect_client_jar_metadata(bundle_path) {
        Ok(meta) => {
            if !is_sevenxair_mod_id(&meta.id) {
                return Err(format!(
                    "JAR mod id '{}' is not 7xAir client ('sevenxair')",
                    meta.id
                ));
            }
            if !metadata_matches_mc_version(&meta, mc_version) {
                return Err(format!(
                    "JAR metadata (version '{}', minecraft {:?}) does not match Minecraft {}",
                    meta.version, meta.minecraft_constraints, mc_version
                ));
            }
            Ok(Some(meta))
        }
        Err(err) => Err(err),
    }
}

/// Strictly resolves a compatible 7xAir client bundle for the exact `mc_version`.
/// Never falls back from 26.2 to 1.21.11 or vice versa.
fn resolve_bundle_info(
    paths: &LauncherPaths,
    mc_version: &str,
) -> Option<(PathBuf, String, String)> {
    let dir = bundles_dir(paths);
    let catalog = load_bundle_catalog(paths);

    if let Some(entry) = catalog.bundles.iter().find(|b| b.mc_version == mc_version) {
        let candidate = dir.join(&entry.filename);
        if candidate.exists() {
            if let Ok(meta_opt) = validate_staged_bundle(&candidate, mc_version) {
                if let Ok(actual_sha) = sha256_file(&candidate) {
                    let version = meta_opt
                        .map(|m| m.version)
                        .filter(|v| !v.is_empty())
                        .unwrap_or_else(|| entry.client_version.clone());
                    return Some((candidate, version, actual_sha));
                }
            }
        }
    }

    let default_jar = dir.join(managed_jar_name(mc_version));
    if default_jar.exists() {
        if let Ok(meta_opt) = validate_staged_bundle(&default_jar, mc_version) {
            if let Ok(actual_sha) = sha256_file(&default_jar) {
                let version = meta_opt
                    .map(|m| m.version)
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| format!("0.1.0+mc{mc_version}"));
                return Some((default_jar, version, actual_sha));
            }
        }
    }
    None
}

/// Lists all 7xAir client JARs inside an instance's `mods/` directory — matching both
/// `7xair-client-*.jar` filenames AND any `.jar` whose `fabric.mod.json` declares `id == "sevenxair"`.
fn list_managed_jars_in_mods(mods_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(mods_dir) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let lower = name.to_ascii_lowercase();
        if lower.starts_with("7xair-client-")
            && (lower.ends_with(".jar") || lower.ends_with(".jar.disabled"))
        {
            found.push(p);
            continue;
        }
        if lower.ends_with(".jar") {
            if let Ok(meta) = inspect_client_jar_metadata(&p) {
                if is_sevenxair_mod_id(&meta.id) {
                    found.push(p);
                }
            }
        }
    }
    found.sort();
    found
}

fn read_state_marker(mods_dir: &Path) -> Option<ManagedClientState> {
    let path = mods_dir.join(".7xair-client-state.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ManagedClientState>(&raw).ok())
}

fn write_state_marker(mods_dir: &Path, state: &ManagedClientState) -> Result<(), ClientManagerError> {
    fs::create_dir_all(mods_dir)?;
    let path = mods_dir.join(".7xair-client-state.json");
    let tmp = mods_dir.join(".7xair-client-state.json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(state)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Safely backs up an existing client JAR into `<instance_dir>/.7xair-client-backups/`
/// before replacing it, preserving all instance configs under `config/`.
fn backup_existing_jar(instance: &GameInstance, existing_jar: &Path) -> Result<Option<String>, ClientManagerError> {
    if !existing_jar.exists() {
        return Ok(None);
    }
    let backups_dir = instance_client_backups_dir(instance);
    fs::create_dir_all(&backups_dir)?;
    let fname = existing_jar
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("7xair-client.jar");
    let backup_path = backups_dir.join(format!("{fname}.{}.bak", now_epoch()));
    fs::copy(existing_jar, &backup_path)?;

    // Prune older backups, keeping the 5 most recent
    if let Ok(entries) = fs::read_dir(&backups_dir) {
        let mut backups: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("bak"))
            .collect();
        backups.sort();
        if backups.len() > 5 {
            for old in &backups[..backups.len() - 5] {
                let _ = fs::remove_file(old);
            }
        }
    }

    Ok(Some(backup_path.to_string_lossy().to_string()))
}

fn copy_jar_atomic(src: &Path, dst: &Path) -> std::io::Result<()> {
    let tmp = dst.with_extension("jar.tmp");
    fs::copy(src, &tmp)?;
    fs::rename(&tmp, dst)?;
    Ok(())
}

/// Runs full integrity, metadata, compatibility, and duplicate checks for the 7xAir Fabric client
/// strictly inside the instance's own `mods/` directory.
pub fn check_client_integrity(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> ClientIntegrityReport {
    let effective_enabled = resolve_effective_client_enabled(instance, global_auto_install);
    let mods_dir = instance_mods_dir(instance);
    let mods_dir_str = mods_dir.to_string_lossy().to_string();
    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);
    let managed_jars = list_managed_jars_in_mods(&mods_dir);
    let state_marker = read_state_marker(&mods_dir);

    let bundle_info = resolve_bundle_info(paths, &instance.mc_version);
    let (bundle_available, bundle_version, bundle_sha256) = match bundle_info {
        Some((_, ver, sha)) => (true, Some(ver), Some(sha)),
        None => (false, None, None),
    };

    // Detect if either the expected JAR or any other 7xAir client JAR is present in this instance's mods/
    let primary_jar = if target_jar.exists() {
        Some(target_jar.clone())
    } else {
        managed_jars.first().cloned()
    };

    let installed = primary_jar.is_some();
    let installed_filename = primary_jar
        .as_ref()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    let valid_zip_header = primary_jar
        .as_ref()
        .map(|p| has_valid_jar_zip_header(p))
        .unwrap_or(false);
    let installed_sha256 = primary_jar.as_ref().and_then(|p| sha256_file(p).ok());

    let parsed_meta = primary_jar
        .as_ref()
        .filter(|_| valid_zip_header)
        .map(|p| inspect_client_jar_metadata(p));

    let mut installed_version = state_marker.as_ref().and_then(|s| s.client_version.clone());
    let mut metadata_valid = false;
    let mut mc_compatible = !installed;
    let mut fabric_loader_compatible = !installed;
    let mut issues = Vec::new();

    if instance.loader != "fabric" && instance.client_override == ClientOverrideMode::ForceOn {
        issues.push(
            "VANILLA_INCOMPATIBLE: Switch instance loader to Fabric to use 7xAir Client."
                .to_string(),
        );
    }

    if let Some(meta_result) = &parsed_meta {
        match meta_result {
            Ok(meta) => {
                if !meta.version.is_empty() {
                    installed_version = Some(meta.version.clone());
                }
                mc_compatible = metadata_matches_mc_version(meta, &instance.mc_version);
                fabric_loader_compatible = metadata_matches_fabric_loader(
                    meta,
                    instance.fabric_loader_version.as_deref(),
                );
                metadata_valid =
                    is_sevenxair_mod_id(&meta.id) && mc_compatible && fabric_loader_compatible;

                if !mc_compatible {
                    issues.push(format!(
                        "INCOMPATIBLE_MC_VERSION: Installed 7xAir JAR '{}' (version '{}', targets {:?}) is incompatible with Minecraft {}.",
                        installed_filename.as_deref().unwrap_or("unknown"),
                        meta.version,
                        meta.minecraft_constraints,
                        instance.mc_version
                    ));
                }
                if !fabric_loader_compatible {
                    issues.push(format!(
                        "INCOMPATIBLE_FABRIC_LOADER: Installed 7xAir JAR requires Fabric Loader {:?}, but instance uses '{}'.",
                        meta.fabric_loader_constraints,
                        instance
                            .fabric_loader_version
                            .as_deref()
                            .unwrap_or("unknown")
                    ));
                }
            }
            Err(err) => {
                mc_compatible = false;
                fabric_loader_compatible = false;
                issues.push(format!(
                    "INVALID_CLIENT_METADATA: Installed 7xAir JAR metadata check failed ({err}); run Repair."
                ));
            }
        }
    } else if installed && !valid_zip_header {
        mc_compatible = false;
        fabric_loader_compatible = false;
        issues.push(
            "CORRUPT_JAR_FILE: Installed 7xAir client JAR is corrupted or truncated; run Repair."
                .to_string(),
        );
    }

    let duplicate_count = managed_jars.len().saturating_sub(1);
    if managed_jars.len() > 1 {
        let names: Vec<String> = managed_jars
            .iter()
            .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(|s| s.to_string()))
            .collect();
        issues.push(format!(
            "DUPLICATE_CLIENT_JARS: {} 7xAir client JARs found in instance mods/ ({}); run Repair.",
            managed_jars.len(),
            names.join(", ")
        ));
    }

    let hash_matches_bundle = match (&installed_sha256, &bundle_sha256) {
        (Some(inst), Some(bun)) => inst.eq_ignore_ascii_case(bun),
        _ => false,
    };
    let update_available =
        installed && bundle_available && !hash_matches_bundle && valid_zip_header && mc_compatible;

    if effective_enabled {
        if !bundle_available {
            issues.push(format!(
                "NO_COMPATIBLE_BUILD: No compatible 7xAir client build is available for Minecraft {} yet. No incompatible JAR was installed.",
                instance.mc_version
            ));
        } else if !installed {
            issues.push(format!(
                "MISSING_MANAGED_JAR: '{}' is not installed in this instance's mods/ folder yet.",
                expected_name
            ));
        } else if update_available {
            issues.push(format!(
                "UPDATE_AVAILABLE: Compatible 7xAir client update {} is available (installed: {}).",
                bundle_version.as_deref().unwrap_or("latest"),
                installed_version.as_deref().unwrap_or("unknown")
            ));
        }
    }

    // Healthy when:
    // - Auto-install ON + bundle available: installed, valid ZIP, valid metadata (MC + Fabric Loader), matches bundle, no duplicates
    // - Auto-install ON + no compatible bundle available yet: no corrupt/incompatible/duplicate JARs
    // - Auto-install OFF: preserves any already-installed valid compatible JAR without error; only flags corrupt/incompatible/duplicate JARs
    let healthy = if effective_enabled {
        if bundle_available {
            installed
                && valid_zip_header
                && metadata_valid
                && mc_compatible
                && fabric_loader_compatible
                && hash_matches_bundle
                && duplicate_count == 0
        } else {
            duplicate_count == 0 && (!installed || (valid_zip_header && metadata_valid))
        }
    } else {
        duplicate_count == 0 && (!installed || (valid_zip_header && metadata_valid))
    };

    let status_message = if instance.loader != "fabric" {
        "Vanilla instance — 7xAir Client requires Fabric Loader.".to_string()
    } else if !effective_enabled {
        if installed && healthy {
            format!(
                "Auto-Install OFF — existing 7xAir Client ({}) preserved in instance mods/.",
                installed_version.as_deref().unwrap_or(&expected_name)
            )
        } else if installed {
            "Auto-Install OFF — existing client JAR has validation issues (run Repair or Remove)."
                .to_string()
        } else {
            "Auto-Install OFF — 7xAir Client will not be installed automatically.".to_string()
        }
    } else if !bundle_available {
        format!(
            "No compatible 7xAir Client build available for Minecraft {} yet.",
            instance.mc_version
        )
    } else if update_available {
        format!(
            "Update available: {} → {} (previous JAR will be backed up safely).",
            installed_version.as_deref().unwrap_or("installed"),
            bundle_version.as_deref().unwrap_or("latest")
        )
    } else if healthy && installed {
        format!(
            "Verified 7xAir Client {} installed in instance mods/.",
            installed_version.as_deref().unwrap_or(&expected_name)
        )
    } else {
        issues
            .first()
            .cloned()
            .unwrap_or_else(|| "7xAir Client check pending.".to_string())
    };

    ClientIntegrityReport {
        instance_id: instance.id.clone(),
        mc_version: instance.mc_version.clone(),
        loader: instance.loader.clone(),
        override_mode: instance.client_override.clone(),
        effective_enabled,
        bundle_available,
        bundle_version,
        bundle_sha256,
        installed,
        installed_filename,
        installed_version,
        installed_sha256,
        mods_dir: mods_dir_str,
        valid_zip_header,
        metadata_valid,
        mc_compatible,
        fabric_loader_compatible,
        duplicate_count,
        hash_matches_bundle,
        update_available,
        last_backup_path: state_marker.and_then(|s| s.last_backup_path),
        status_message,
        healthy,
        issues,
    }
}

/// Automatically installs or updates the version-matched 7xAir client inside the instance's own `mods/` folder.
/// When `AUTO-INSTALL 7XAIR CLIENT MOD` is OFF, preserves any already-installed JAR (never deletes unexpectedly).
pub fn sync_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let effective_enabled = resolve_effective_client_enabled(instance, global_auto_install);
    let mods_dir = instance_mods_dir(instance);
    fs::create_dir_all(&mods_dir)?;

    // Requirement 4: When switched OFF, do NOT unexpectedly delete an already-installed JAR.
    if !effective_enabled {
        return Ok(check_client_integrity(paths, instance, global_auto_install));
    }

    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);

    let mut installed_ver = None;
    let mut installed_sha = None;
    let mut expected_sha = None;
    let mut last_backup = read_state_marker(&mods_dir).and_then(|s| s.last_backup_path);

    if let Some((bundle_path, bundle_ver, bundle_sha)) =
        resolve_bundle_info(paths, &instance.mc_version)
    {
        if let Err(reason) = validate_staged_bundle(&bundle_path, &instance.mc_version) {
            return Err(ClientManagerError::CorruptBundle(
                instance.mc_version.clone(),
                reason,
            ));
        }
        expected_sha = Some(bundle_sha.clone());
        installed_ver = Some(bundle_ver);

        // Remove duplicate or wrong-version 7xAir client JARs inside this instance's mods/
        for jar in list_managed_jars_in_mods(&mods_dir) {
            if jar != target_jar {
                let _ = backup_existing_jar(instance, &jar);
                let _ = fs::remove_file(&jar);
            }
        }

        let target_valid = target_jar.exists()
            && has_valid_jar_zip_header(&target_jar)
            && inspect_client_jar_metadata(&target_jar)
                .map(|m| metadata_matches_mc_version(&m, &instance.mc_version))
                .unwrap_or(false);

        let needs_copy = !target_valid
            || sha256_file(&target_jar)
                .map(|s| !s.eq_ignore_ascii_case(&bundle_sha))
                .unwrap_or(true);

        if needs_copy {
            if target_jar.exists() {
                if let Some(bak) = backup_existing_jar(instance, &target_jar)? {
                    last_backup = Some(bak);
                }
            }
            copy_jar_atomic(&bundle_path, &target_jar)?;
        }
        installed_sha = sha256_file(&target_jar).ok();
    }

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: true,
            override_mode: instance.client_override.clone(),
            client_id: "sevenxair".to_string(),
            client_version: installed_ver,
            mc_version: instance.mc_version.clone(),
            fabric_loader: instance.fabric_loader_version.clone(),
            installed_filename: if target_jar.exists() {
                Some(expected_name)
            } else {
                None
            },
            installed_sha256: installed_sha,
            expected_sha256: expected_sha,
            last_backup_path: last_backup,
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Safely updates the managed client JAR from the latest compatible staged bundle:
/// verifies compatibility, backs up the previous JAR, replaces atomically, and preserves all configs.
pub fn update_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    if instance.loader != "fabric" {
        return Err(ClientManagerError::VanillaUnsupported(instance.name.clone()));
    }
    let (bundle_path, bundle_ver, bundle_sha) =
        resolve_bundle_info(paths, &instance.mc_version)
            .ok_or_else(|| ClientManagerError::BundleMissing(instance.mc_version.clone()))?;

    let meta = validate_staged_bundle(&bundle_path, &instance.mc_version).map_err(|reason| {
        ClientManagerError::CorruptBundle(instance.mc_version.clone(), reason)
    })?;

    if let Some(ref m) = meta {
        if !metadata_matches_fabric_loader(m, instance.fabric_loader_version.as_deref()) {
            return Err(ClientManagerError::ValidationFailed(format!(
                "7xAir client {} requires Fabric Loader {:?}, but instance '{}' uses '{}'.",
                bundle_ver,
                m.fabric_loader_constraints,
                instance.name,
                instance
                    .fabric_loader_version
                    .as_deref()
                    .unwrap_or("unknown")
            )));
        }
    }

    let mods_dir = instance_mods_dir(instance);
    fs::create_dir_all(&mods_dir)?;
    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);

    let mut last_backup = read_state_marker(&mods_dir).and_then(|s| s.last_backup_path);
    if target_jar.exists() {
        if let Some(bak) = backup_existing_jar(instance, &target_jar)? {
            last_backup = Some(bak);
        }
    }

    for jar in list_managed_jars_in_mods(&mods_dir) {
        if jar != target_jar {
            let _ = backup_existing_jar(instance, &jar);
            let _ = fs::remove_file(&jar);
        }
    }

    copy_jar_atomic(&bundle_path, &target_jar)?;
    let actual_sha = sha256_file(&target_jar)?;

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: true,
            override_mode: instance.client_override.clone(),
            client_id: "sevenxair".to_string(),
            client_version: Some(bundle_ver),
            mc_version: instance.mc_version.clone(),
            fabric_loader: instance.fabric_loader_version.clone(),
            installed_filename: Some(expected_name),
            installed_sha256: Some(actual_sha),
            expected_sha256: Some(bundle_sha),
            last_backup_path: last_backup,
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Repairs the managed client by backing up and purging corrupt/duplicate/incompatible client JARs
/// and cleanly reinstalling the verified version-matched JAR when enabled.
pub fn repair_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let mods_dir = instance_mods_dir(instance);
    fs::create_dir_all(&mods_dir)?;
    for jar in list_managed_jars_in_mods(&mods_dir) {
        let _ = backup_existing_jar(instance, &jar);
        let _ = fs::remove_file(&jar);
    }

    if resolve_effective_client_enabled(instance, global_auto_install)
        && resolve_bundle_info(paths, &instance.mc_version).is_some()
    {
        update_managed_client(paths, instance, global_auto_install)
    } else {
        Ok(check_client_integrity(paths, instance, global_auto_install))
    }
}

/// Explicitly removes all managed 7xAir client JARs from an instance without touching user mods or configs.
pub fn remove_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let mods_dir = instance_mods_dir(instance);
    fs::create_dir_all(&mods_dir)?;
    let mut last_backup = read_state_marker(&mods_dir).and_then(|s| s.last_backup_path);
    for jar in list_managed_jars_in_mods(&mods_dir) {
        if let Ok(Some(bak)) = backup_existing_jar(instance, &jar) {
            last_backup = Some(bak);
        }
        let _ = fs::remove_file(&jar);
    }

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: false,
            override_mode: instance.client_override.clone(),
            client_id: "sevenxair".to_string(),
            client_version: None,
            mc_version: instance.mc_version.clone(),
            fabric_loader: instance.fabric_loader_version.clone(),
            installed_filename: None,
            installed_sha256: None,
            expected_sha256: None,
            last_backup_path: last_backup,
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Pre-launch validation for Requirement 6:
/// - Syncs when AUTO-INSTALL is ON
/// - Verifies per-instance `mods/` isolation
/// - Blocks launch on duplicate, corrupted, wrong-Minecraft-version, or incompatible-Fabric-Loader client JARs
/// - If no compatible build exists for this Minecraft version, returns a clean report with a clear message instead of installing an incompatible JAR.
pub fn validate_client_before_launch(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let report = sync_managed_client(paths, instance, global_auto_install)?;

    if instance.loader != "fabric" {
        return Ok(report);
    }

    if report.duplicate_count > 0 {
        return Err(ClientManagerError::ValidationFailed(format!(
            "Duplicate 7xAir client JARs detected in '{}'. Run Repair in Client Settings or Instance Mods before launching.",
            report.mods_dir
        )));
    }

    if report.installed && !report.valid_zip_header {
        return Err(ClientManagerError::ValidationFailed(format!(
            "Corrupted 7xAir client JAR '{}' detected in '{}'. Run Repair before launching.",
            report.installed_filename.as_deref().unwrap_or("unknown"),
            report.mods_dir
        )));
    }

    if report.installed && !report.mc_compatible {
        return Err(ClientManagerError::ValidationFailed(format!(
            "Incompatible 7xAir client JAR '{}' is installed in this Minecraft {} instance. Never mix 1.21.11 and 26.2 client JARs — run Repair or Remove.",
            report.installed_filename.as_deref().unwrap_or("unknown"),
            instance.mc_version
        )));
    }

    if report.installed && !report.fabric_loader_compatible {
        return Err(ClientManagerError::ValidationFailed(format!(
            "Installed 7xAir client JAR is incompatible with Fabric Loader '{}'. Update Fabric Loader or run Repair.",
            instance
                .fabric_loader_version
                .as_deref()
                .unwrap_or("unknown")
        )));
    }

    Ok(report)
}

/// Synchronizes all instances (used when toggling global AUTO-INSTALL 7XAIR CLIENT MOD ON/OFF).
/// Preserves existing installed JARs when toggled OFF.
pub fn sync_all_instances_client(
    paths: &LauncherPaths,
    instances: &[GameInstance],
    global_auto_install: bool,
) -> Vec<ClientIntegrityReport> {
    instances
        .iter()
        .map(|inst| {
            sync_managed_client(paths, inst, global_auto_install)
                .unwrap_or_else(|_| check_client_integrity(paths, inst, global_auto_install))
        })
        .collect()
}
