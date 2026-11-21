use crate::instances::{ClientOverrideMode, GameInstance};
use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ClientManagerError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("instance '{0}' uses vanilla loader; 7xAir client requires Fabric")]
    VanillaUnsupported(String),
    #[error("staged 7xAir client bundle for Minecraft {0} not found in client-bundles/")]
    BundleMissing(String),
    #[error("client bundle JAR for Minecraft {0} failed ZIP header integrity check")]
    CorruptBundle(String),
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
    pub updated_at_epoch: u64,
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
    pub installed_sha256: Option<String>,
    pub valid_zip_header: bool,
    pub hash_matches_bundle: bool,
    pub update_available: bool,
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

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn has_valid_jar_zip_header(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04
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

fn resolve_bundle_info(
    paths: &LauncherPaths,
    mc_version: &str,
) -> Option<(PathBuf, String, String)> {
    let dir = bundles_dir(paths);
    let catalog = load_bundle_catalog(paths);

    if let Some(entry) = catalog.bundles.iter().find(|b| b.mc_version == mc_version) {
        let candidate = dir.join(&entry.filename);
        if candidate.exists() {
            if let Ok(actual_sha) = sha256_file(&candidate) {
                return Some((candidate, entry.client_version.clone(), actual_sha));
            }
        }
    }

    let default_jar = dir.join(managed_jar_name(mc_version));
    if default_jar.exists() {
        if let Ok(actual_sha) = sha256_file(&default_jar) {
            return Some((default_jar, format!("0.1.0+mc{mc_version}"), actual_sha));
        }
    }
    None
}

fn list_managed_jars_in_mods(mods_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(mods_dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|name| {
                    name.starts_with("7xair-client-")
                        && (name.ends_with(".jar") || name.ends_with(".jar.disabled"))
                })
                .unwrap_or(false)
        })
        .collect()
}

fn write_state_marker(mods_dir: &Path, state: &ManagedClientState) -> Result<(), ClientManagerError> {
    fs::create_dir_all(mods_dir)?;
    let path = mods_dir.join(".7xair-client-state.json");
    let tmp = mods_dir.join(".7xair-client-state.json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(state)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

fn copy_jar_atomic(src: &Path, dst: &Path) -> std::io::Result<()> {
    let tmp = dst.with_extension("jar.tmp");
    fs::copy(src, &tmp)?;
    fs::rename(&tmp, dst)?;
    Ok(())
}

/// Runs full integrity checks for the 7xAir managed Fabric client on a specific instance.
pub fn check_client_integrity(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> ClientIntegrityReport {
    let effective_enabled = resolve_effective_client_enabled(instance, global_auto_install);
    let mods_dir = Path::new(&instance.instance_dir).join("mods");
    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);
    let managed_jars = list_managed_jars_in_mods(&mods_dir);

    let bundle_info = resolve_bundle_info(paths, &instance.mc_version);
    let (bundle_available, bundle_version, bundle_sha256) = match bundle_info {
        Some((_, ver, sha)) => (true, Some(ver), Some(sha)),
        None => (false, None, None),
    };

    let installed = target_jar.exists();
    let valid_zip_header = installed && has_valid_jar_zip_header(&target_jar);
    let installed_sha256 = if installed {
        sha256_file(&target_jar).ok()
    } else {
        None
    };

    let hash_matches_bundle = match (&installed_sha256, &bundle_sha256) {
        (Some(inst), Some(bun)) => inst.eq_ignore_ascii_case(bun),
        _ => false,
    };
    let update_available = installed && bundle_available && !hash_matches_bundle && valid_zip_header;

    let mut issues = Vec::new();
    if instance.loader != "fabric" && instance.client_override == ClientOverrideMode::ForceOn {
        issues.push("VANILLA_INCOMPATIBLE: Switch instance loader to Fabric to use 7xAir Client.".to_string());
    }

    if effective_enabled {
        if !bundle_available {
            issues.push(format!(
                "BUNDLE_NOT_STAGED: Build or stage '{}' in client-bundles/.",
                expected_name
            ));
        }
        if !installed {
            issues.push(format!(
                "MISSING_MANAGED_JAR: '{}' is not installed in instance mods/.",
                expected_name
            ));
        } else if !valid_zip_header {
            issues.push("CORRUPT_JAR_HEADER: Installed client JAR is not a valid ZIP/JAR archive; run Repair.".to_string());
        } else if bundle_available && !hash_matches_bundle {
            issues.push("UPDATE_AVAILABLE: Installed client JAR SHA-256 differs from staged bundle; run Update or Repair.".to_string());
        }
        if managed_jars.len() > 1 {
            issues.push("DUPLICATE_CLIENT_JARS: Multiple 7xair-client JARs detected in mods/; run Repair.".to_string());
        }
    } else if !managed_jars.is_empty() {
        issues.push("ORPHANED_JAR_WHEN_DISABLED: Managed client JAR exists while client is OFF; run Remove or Sync.".to_string());
    }

    let healthy = if effective_enabled {
        installed && valid_zip_header && (!bundle_available || hash_matches_bundle) && managed_jars.len() <= 1
    } else {
        managed_jars.is_empty()
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
        installed_filename: if installed { Some(expected_name) } else { None },
        installed_sha256,
        valid_zip_header,
        hash_matches_bundle,
        update_available,
        healthy,
        issues,
    }
}

/// Automatically installs, updates, or removes the managed 7xAir client according to global + per-instance override.
pub fn sync_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let effective_enabled = resolve_effective_client_enabled(instance, global_auto_install);
    let mods_dir = Path::new(&instance.instance_dir).join("mods");
    fs::create_dir_all(&mods_dir)?;

    if !effective_enabled {
        return remove_managed_client(paths, instance, global_auto_install);
    }

    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);

    // Clean any stale versions for other MC targets
    for jar in list_managed_jars_in_mods(&mods_dir) {
        if jar != target_jar {
            let _ = fs::remove_file(jar);
        }
    }

    let mut installed_ver = None;
    let mut installed_sha = None;
    let mut expected_sha = None;

    if let Some((bundle_path, bundle_ver, bundle_sha)) =
        resolve_bundle_info(paths, &instance.mc_version)
    {
        if !has_valid_jar_zip_header(&bundle_path) {
            return Err(ClientManagerError::CorruptBundle(
                instance.mc_version.clone(),
            ));
        }
        expected_sha = Some(bundle_sha.clone());
        installed_ver = Some(bundle_ver);

        let needs_copy = !target_jar.exists()
            || !has_valid_jar_zip_header(&target_jar)
            || sha256_file(&target_jar)
                .map(|s| !s.eq_ignore_ascii_case(&bundle_sha))
                .unwrap_or(true);

        if needs_copy {
            copy_jar_atomic(&bundle_path, &target_jar)?;
        }
        installed_sha = sha256_file(&target_jar).ok();
    }

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: true,
            override_mode: instance.client_override.clone(),
            client_id: "7xair-fabric-client".to_string(),
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
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Forces an update of the managed client JAR from the latest staged bundle.
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

    if !has_valid_jar_zip_header(&bundle_path) {
        return Err(ClientManagerError::CorruptBundle(
            instance.mc_version.clone(),
        ));
    }

    let mods_dir = Path::new(&instance.instance_dir).join("mods");
    fs::create_dir_all(&mods_dir)?;
    let expected_name = managed_jar_name(&instance.mc_version);
    let target_jar = mods_dir.join(&expected_name);

    for jar in list_managed_jars_in_mods(&mods_dir) {
        if jar != target_jar {
            let _ = fs::remove_file(jar);
        }
    }
    copy_jar_atomic(&bundle_path, &target_jar)?;
    let actual_sha = sha256_file(&target_jar)?;

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: true,
            override_mode: instance.client_override.clone(),
            client_id: "7xair-fabric-client".to_string(),
            client_version: Some(bundle_ver),
            mc_version: instance.mc_version.clone(),
            fabric_loader: instance.fabric_loader_version.clone(),
            installed_filename: Some(expected_name),
            installed_sha256: Some(actual_sha),
            expected_sha256: Some(bundle_sha),
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Repairs the managed client by purging corrupt/duplicate client JARs and cleanly reinstalling.
pub fn repair_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let mods_dir = Path::new(&instance.instance_dir).join("mods");
    fs::create_dir_all(&mods_dir)?;
    for jar in list_managed_jars_in_mods(&mods_dir) {
        let _ = fs::remove_file(jar);
    }

    if resolve_effective_client_enabled(instance, global_auto_install) {
        update_managed_client(paths, instance, global_auto_install)
    } else {
        remove_managed_client(paths, instance, global_auto_install)
    }
}

/// Cleanly removes all managed 7xAir client JARs from an instance without touching user mods.
pub fn remove_managed_client(
    paths: &LauncherPaths,
    instance: &GameInstance,
    global_auto_install: bool,
) -> Result<ClientIntegrityReport, ClientManagerError> {
    let mods_dir = Path::new(&instance.instance_dir).join("mods");
    fs::create_dir_all(&mods_dir)?;
    for jar in list_managed_jars_in_mods(&mods_dir) {
        let _ = fs::remove_file(jar);
    }

    write_state_marker(
        &mods_dir,
        &ManagedClientState {
            enabled: false,
            override_mode: instance.client_override.clone(),
            client_id: "7xair-fabric-client".to_string(),
            client_version: None,
            mc_version: instance.mc_version.clone(),
            fabric_loader: instance.fabric_loader_version.clone(),
            installed_filename: None,
            installed_sha256: None,
            expected_sha256: None,
            updated_at_epoch: now_epoch(),
        },
    )?;

    Ok(check_client_integrity(paths, instance, global_auto_install))
}

/// Synchronizes all instances (used when toggling global autoInstallClient ON/OFF).
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
