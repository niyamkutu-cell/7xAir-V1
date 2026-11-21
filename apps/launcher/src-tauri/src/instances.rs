use crate::client_manager::sync_managed_client;
use crate::config::SUPPORTED_MC_TARGETS;
use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use uuid::Uuid;

fn default_true() -> bool {
    true
}

#[derive(Debug, Error)]
pub enum InstanceError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid instance input: {0}")]
    Validation(String),
    #[error("instance not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ClientOverrideMode {
    #[default]
    Inherit,
    ForceOn,
    ForceOff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String, // "fabric" | "vanilla"
    pub fabric_loader_version: Option<String>,
    #[serde(default = "default_true")]
    pub auto_install_fabric_loader: bool,
    #[serde(default = "default_true")]
    pub auto_install_fabric_api: bool,
    pub auto_install_client: bool,
    #[serde(default)]
    pub client_override: ClientOverrideMode,
    pub ram_mb_override: Option<u32>,
    pub java_path_override: Option<String>,
    pub jvm_args_override: Option<String>,
    pub instance_dir: String,
    #[serde(default)]
    pub modpack_id: Option<String>,
    #[serde(default)]
    pub modpack_name: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
    #[serde(default)]
    pub modpack_icon_url: Option<String>,
    #[serde(default)]
    pub modpack_status: Option<String>,
    pub created_at_epoch: u64,
    pub last_played_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceStore {
    pub instances: Vec<GameInstance>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceRequest {
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub fabric_loader_version: Option<String>,
    pub auto_install_fabric_loader: Option<bool>,
    pub auto_install_fabric_api: Option<bool>,
    pub auto_install_client: bool,
    pub client_override: Option<ClientOverrideMode>,
    pub ram_mb_override: Option<u32>,
    pub java_path_override: Option<String>,
    pub instance_dir_override: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstanceRequest {
    pub id: String,
    pub name: Option<String>,
    pub fabric_loader_version: Option<String>,
    pub auto_install_fabric_loader: Option<bool>,
    pub auto_install_fabric_api: Option<bool>,
    pub auto_install_client: Option<bool>,
    pub client_override: Option<ClientOverrideMode>,
    pub ram_mb_override: Option<u32>,
    pub java_path_override: Option<String>,
    pub jvm_args_override: Option<String>,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if (ch == ' ' || ch == '-' || ch == '_') && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "instance".to_string()
    } else {
        trimmed.chars().take(32).collect()
    }
}

fn ensure_instance_dirs(instance_dir: &Path) -> std::io::Result<()> {
    for sub in ["mods", "resourcepacks", "saves", "config", "logs", "natives"] {
        fs::create_dir_all(instance_dir.join(sub))?;
    }
    let manifest_path = instance_dir.join("content-manifest.json");
    if !manifest_path.exists() {
        fs::write(&manifest_path, "{\"items\":[]}")?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

pub fn load_or_init_instances(paths: &LauncherPaths) -> Result<InstanceStore, InstanceError> {
    let file = paths.instances_file_path();
    if !file.exists() {
        let store = InstanceStore {
            instances: Vec::new(),
        };
        save_instances_atomic(&file, &store)?;
        return Ok(store);
    }
    let raw = fs::read_to_string(&file)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn save_instances_atomic(
    path: &PathBuf,
    store: &InstanceStore,
) -> Result<(), InstanceError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(store)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn create_new_instance(
    paths: &LauncherPaths,
    store: &mut InstanceStore,
    req: CreateInstanceRequest,
    global_auto_install: bool,
) -> Result<GameInstance, InstanceError> {
    let name = req.name.trim();
    if name.len() < 2 || name.len() > 48 {
        return Err(InstanceError::Validation(
            "instance name must be 2–48 characters".to_string(),
        ));
    }
    if !SUPPORTED_MC_TARGETS.contains(&req.mc_version.as_str()) {
        return Err(InstanceError::Validation(format!(
            "unsupported Minecraft version '{}'; 7xAir supports 1.21.11 and 26.2",
            req.mc_version
        )));
    }
    if !matches!(req.loader.as_str(), "fabric" | "vanilla" | "forge" | "neoforge" | "quilt") {
        return Err(InstanceError::Validation(
            "loader must be 'fabric', 'vanilla', 'forge', 'neoforge', or 'quilt'".to_string(),
        ));
    }

    let id = format!("{}-{}", slugify(name), &Uuid::new_v4().to_string()[..8]);
    let instance_dir = req
        .instance_dir_override
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.instances_path().join(&id));
    ensure_instance_dirs(&instance_dir)?;

    let override_mode = req.client_override.unwrap_or_else(|| {
        if req.loader != "fabric" {
            ClientOverrideMode::ForceOff
        } else if req.auto_install_client == global_auto_install {
            ClientOverrideMode::Inherit
        } else if req.auto_install_client {
            ClientOverrideMode::ForceOn
        } else {
            ClientOverrideMode::ForceOff
        }
    });

    let effective_auto = req.loader == "fabric"
        && match override_mode {
            ClientOverrideMode::Inherit => global_auto_install,
            ClientOverrideMode::ForceOn => true,
            ClientOverrideMode::ForceOff => false,
        };

    // Independent Fabric Loader and Fabric API settings (default ON for Fabric, OFF for Vanilla)
    let auto_fabric_loader = req.loader == "fabric" && req.auto_install_fabric_loader.unwrap_or(true);
    let auto_fabric_api = req.loader == "fabric" && req.auto_install_fabric_api.unwrap_or(true);

    let instance = GameInstance {
        id,
        name: name.to_string(),
        mc_version: req.mc_version,
        loader: req.loader,
        fabric_loader_version: req.fabric_loader_version,
        auto_install_fabric_loader: auto_fabric_loader,
        auto_install_fabric_api: auto_fabric_api,
        auto_install_client: effective_auto,
        client_override: override_mode,
        ram_mb_override: req.ram_mb_override,
        java_path_override: req
            .java_path_override
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        jvm_args_override: None,
        instance_dir: instance_dir.to_string_lossy().to_string(),
        modpack_id: None,
        modpack_name: None,
        modpack_version: None,
        modpack_icon_url: None,
        modpack_status: None,
        created_at_epoch: now_epoch(),
        last_played_epoch: None,
    };

    let _ = sync_managed_client(paths, &instance, global_auto_install);

    store.instances.push(instance.clone());
    save_instances_atomic(&paths.instances_file_path(), store)?;
    Ok(instance)
}

/// Clones an instance into a fully independent directory copying mods, resource packs, config, and manifest.
pub fn clone_existing_instance(
    paths: &LauncherPaths,
    store: &mut InstanceStore,
    source_id: &str,
    new_name: &str,
) -> Result<GameInstance, InstanceError> {
    let clean_name = new_name.trim();
    if clean_name.len() < 2 || clean_name.len() > 48 {
        return Err(InstanceError::Validation(
            "cloned instance name must be 2–48 characters".to_string(),
        ));
    }
    let source = store
        .instances
        .iter()
        .find(|i| i.id == source_id)
        .cloned()
        .ok_or_else(|| InstanceError::NotFound(source_id.to_string()))?;

    let new_id = format!("{}-{}", slugify(clean_name), &Uuid::new_v4().to_string()[..8]);
    let new_dir = paths.instances_path().join(&new_id);
    ensure_instance_dirs(&new_dir)?;

    let src_dir = PathBuf::from(&source.instance_dir);
    for sub in ["mods", "resourcepacks", "config"] {
        copy_dir_recursive(&src_dir.join(sub), &new_dir.join(sub))?;
    }
    for file in ["content-manifest.json", "options.txt"] {
        let src_file = src_dir.join(file);
        if src_file.exists() {
            let _ = fs::copy(&src_file, new_dir.join(file));
        }
    }

    let cloned = GameInstance {
        id: new_id,
        name: clean_name.to_string(),
        mc_version: source.mc_version,
        loader: source.loader,
        fabric_loader_version: source.fabric_loader_version,
        auto_install_fabric_loader: source.auto_install_fabric_loader,
        auto_install_fabric_api: source.auto_install_fabric_api,
        auto_install_client: source.auto_install_client,
        client_override: source.client_override,
        ram_mb_override: source.ram_mb_override,
        java_path_override: source.java_path_override,
        jvm_args_override: source.jvm_args_override,
        instance_dir: new_dir.to_string_lossy().to_string(),
        modpack_id: source.modpack_id,
        modpack_name: source.modpack_name,
        modpack_version: source.modpack_version,
        modpack_icon_url: source.modpack_icon_url,
        modpack_status: source.modpack_status,
        created_at_epoch: now_epoch(),
        last_played_epoch: None,
    };

    store.instances.push(cloned.clone());
    save_instances_atomic(&paths.instances_file_path(), store)?;
    Ok(cloned)
}

pub fn update_existing_instance(
    paths: &LauncherPaths,
    store: &mut InstanceStore,
    req: UpdateInstanceRequest,
    global_auto_install: bool,
) -> Result<GameInstance, InstanceError> {
    let instance = store
        .instances
        .iter_mut()
        .find(|i| i.id == req.id)
        .ok_or_else(|| InstanceError::NotFound(req.id.clone()))?;

    if let Some(name) = req.name {
        let trimmed = name.trim();
        if trimmed.len() >= 2 && trimmed.len() <= 48 {
            instance.name = trimmed.to_string();
        }
    }
    if let Some(loader_ver) = req.fabric_loader_version {
        instance.fabric_loader_version = Some(loader_ver);
    }
    if let Some(auto_loader) = req.auto_install_fabric_loader {
        instance.auto_install_fabric_loader = instance.loader == "fabric" && auto_loader;
    }
    if let Some(auto_api) = req.auto_install_fabric_api {
        instance.auto_install_fabric_api = instance.loader == "fabric" && auto_api;
    }
    if let Some(override_mode) = req.client_override {
        instance.client_override = override_mode;
    } else if let Some(auto_client) = req.auto_install_client {
        instance.client_override = if auto_client {
            ClientOverrideMode::ForceOn
        } else {
            ClientOverrideMode::ForceOff
        };
    }

    instance.auto_install_client = instance.loader == "fabric"
        && match instance.client_override {
            ClientOverrideMode::Inherit => global_auto_install,
            ClientOverrideMode::ForceOn => true,
            ClientOverrideMode::ForceOff => false,
        };

    if req.ram_mb_override.is_some() {
        instance.ram_mb_override = req.ram_mb_override;
    }
    if let Some(java_override) = req.java_path_override {
        let trimmed = java_override.trim();
        instance.java_path_override = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(jvm_override) = req.jvm_args_override {
        let trimmed = jvm_override.trim();
        instance.jvm_args_override = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }

    let _ = sync_managed_client(paths, instance, global_auto_install);

    let updated = instance.clone();
    save_instances_atomic(&paths.instances_file_path(), store)?;
    Ok(updated)
}

pub fn delete_existing_instance(
    paths: &LauncherPaths,
    store: &mut InstanceStore,
    instance_id: &str,
) -> Result<(), InstanceError> {
    let idx = store
        .instances
        .iter()
        .position(|i| i.id == instance_id)
        .ok_or_else(|| InstanceError::NotFound(instance_id.to_string()))?;

    let removed = store.instances.remove(idx);
    let dir = PathBuf::from(&removed.instance_dir);
    if dir.exists() && dir.starts_with(paths.instances_path()) {
        let _ = fs::remove_dir_all(&dir);
    }
    save_instances_atomic(&paths.instances_file_path(), store)?;
    Ok(())
}

pub fn register_modpack_instance(
    paths: &LauncherPaths,
    store: &mut InstanceStore,
    name: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    instance_dir: PathBuf,
    modpack_id: String,
    modpack_name: String,
    modpack_version: String,
    modpack_icon_url: Option<String>,
) -> Result<GameInstance, InstanceError> {
    let clean_name = name.trim();
    if clean_name.len() < 2 || clean_name.len() > 64 {
        return Err(InstanceError::Validation(
            "modpack instance name must be 2–64 characters".to_string(),
        ));
    }
    ensure_instance_dirs(&instance_dir)?;
    let id = format!("{}-{}", slugify(clean_name), &Uuid::new_v4().to_string()[..8]);
    let instance = GameInstance {
        id,
        name: clean_name.to_string(),
        mc_version,
        loader: loader.clone(),
        fabric_loader_version: loader_version,
        auto_install_fabric_loader: loader == "fabric",
        auto_install_fabric_api: false, // Modpacks bundle their own exact Fabric API version
        auto_install_client: false,
        client_override: ClientOverrideMode::ForceOff,
        ram_mb_override: None,
        java_path_override: None,
        jvm_args_override: None,
        instance_dir: instance_dir.to_string_lossy().to_string(),
        modpack_id: Some(modpack_id),
        modpack_name: Some(modpack_name),
        modpack_version: Some(modpack_version),
        modpack_icon_url,
        modpack_status: Some("installed".to_string()),
        created_at_epoch: now_epoch(),
        last_played_epoch: None,
    };
    store.instances.push(instance.clone());
    save_instances_atomic(&paths.instances_file_path(), store)?;
    Ok(instance)
}
