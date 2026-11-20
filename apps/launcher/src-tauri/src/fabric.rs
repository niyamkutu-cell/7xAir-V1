use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub const FABRIC_META_BASE: &str = "https://meta.fabricmc.net/v2";

#[derive(Debug, Error)]
pub enum FabricError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricLoaderMeta {
    pub version: String,
    pub stable: bool,
    pub build: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct FabricLoaderResponseItem {
    loader: FabricLoaderMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricLoaderOption {
    pub version: String,
    pub stable: bool,
    pub recommended: bool,
    pub mc_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricProfileLibrary {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricProfileJson {
    pub id: String,
    pub main_class: String,
    #[serde(default)]
    pub libraries: Vec<FabricProfileLibrary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSyncMarker {
    pub enabled: bool,
    pub client_id: String,
    pub mc_version: String,
    pub fabric_loader: Option<String>,
    pub managed_jar_installed: bool,
}

fn fabric_cache_path(paths: &LauncherPaths, mc_version: &str) -> PathBuf {
    paths
        .cache_path()
        .join(format!("fabric_loaders_{mc_version}.json"))
}

pub async fn list_fabric_loaders(
    paths: &LauncherPaths,
    mc_version: &str,
) -> Vec<FabricLoaderOption> {
    let cache_file = fabric_cache_path(paths, mc_version);
    let url = format!("{FABRIC_META_BASE}/versions/loader/{mc_version}");

    let mut loaders: Vec<FabricLoaderMeta> = Vec::new();
    if let Ok(http) = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()
    {
        if let Ok(resp) = http.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(items) = resp.json::<Vec<FabricLoaderResponseItem>>().await {
                    loaders = items.into_iter().map(|i| i.loader).collect();
                    if let Ok(serialized) = serde_json::to_string_pretty(&loaders) {
                        let _ = fs::create_dir_all(paths.cache_path());
                        let _ = fs::write(&cache_file, serialized);
                    }
                }
            }
        }
    }

    if loaders.is_empty() && cache_file.exists() {
        if let Ok(raw) = fs::read_to_string(&cache_file) {
            if let Ok(cached) = serde_json::from_str::<Vec<FabricLoaderMeta>>(&raw) {
                loaders = cached;
            }
        }
    }

    if loaders.is_empty() {
        loaders = vec![
            FabricLoaderMeta {
                version: "0.16.10".to_string(),
                stable: true,
                build: Some(1),
            },
            FabricLoaderMeta {
                version: "0.16.9".to_string(),
                stable: true,
                build: Some(1),
            },
        ];
    }

    let first_stable_idx = loaders.iter().position(|l| l.stable).unwrap_or(0);
    loaders
        .into_iter()
        .take(15)
        .enumerate()
        .map(|(idx, item)| FabricLoaderOption {
            version: item.version,
            stable: item.stable,
            recommended: idx == first_stable_idx,
            mc_version: mc_version.to_string(),
        })
        .collect()
}

pub async fn fetch_fabric_profile(
    paths: &LauncherPaths,
    mc_version: &str,
    loader_version: &str,
) -> Result<FabricProfileJson, FabricError> {
    let cache_file = paths
        .cache_path()
        .join(format!("fabric_profile_{mc_version}_{loader_version}.json"));
    if cache_file.exists() {
        let raw = fs::read_to_string(&cache_file)?;
        return Ok(serde_json::from_str(&raw)?);
    }

    let url = format!(
        "{FABRIC_META_BASE}/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let profile: FabricProfileJson = http.get(&url).send().await?.error_for_status()?.json().await?;
    fs::create_dir_all(paths.cache_path())?;
    fs::write(&cache_file, serde_json::to_string_pretty(&profile)?)?;
    Ok(profile)
}

/// Converts a Maven coordinate (group:artifact:version) into its relative JAR path.
pub fn maven_coord_to_rel_path(coord: &str) -> Option<String> {
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group_path = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    Some(format!("{group_path}/{artifact}/{version}/{artifact}-{version}.jar"))
}

/// Synchronizes the automatic per-instance 7xAir Fabric client state respecting the ON/OFF toggle.
pub fn sync_instance_client(
    paths: &LauncherPaths,
    instance_dir: &Path,
    mc_version: &str,
    fabric_loader: Option<&str>,
    enabled: bool,
) -> Result<ClientSyncMarker, FabricError> {
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir)?;

    let managed_jar_name = format!("7xair-client-{mc_version}.jar");
    let target_jar = mods_dir.join(&managed_jar_name);
    let marker_path = mods_dir.join(".7xair-client-state.json");

    let mut managed_jar_installed = false;

    if enabled {
        let bundled_jar = PathBuf::from(&paths.root_dir)
            .join("client-bundles")
            .join(&managed_jar_name);
        if bundled_jar.exists() {
            fs::copy(&bundled_jar, &target_jar)?;
            managed_jar_installed = true;
        }
    } else if target_jar.exists() {
        let _ = fs::remove_file(&target_jar);
    }

    let marker = ClientSyncMarker {
        enabled,
        client_id: "7xair-fabric-client".to_string(),
        mc_version: mc_version.to_string(),
        fabric_loader: fabric_loader.map(str::to_string),
        managed_jar_installed,
    };
    fs::write(&marker_path, serde_json::to_string_pretty(&marker)?)?;
    Ok(marker)
}
