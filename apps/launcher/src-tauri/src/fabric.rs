use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub const FABRIC_META_BASE: &str = "https://meta.fabricmc.net/v2";
pub const FABRIC_API_MODRINTH_ID: &str = "P7dR8mSH";
pub const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Error)]
pub enum FabricError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Fabric validation failed: {0}")]
    Validation(String),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricApiMarker {
    pub mc_version: String,
    pub version_id: String,
    pub version_number: String,
    pub filename: String,
    pub sha512: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricApiStatus {
    pub instance_id: String,
    pub mc_version: String,
    pub auto_install_enabled: bool,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub installed_filename: Option<String>,
    pub compatible_with_mc_version: bool,
    pub latest_available_version: Option<String>,
    pub update_available: bool,
    /// "installed" | "not_installed" | "update_available" | "unavailable" | "disabled" | "vanilla"
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthApiFile {
    url: String,
    filename: String,
    primary: bool,
    #[serde(default)]
    hashes: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthApiVersion {
    id: String,
    version_number: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    files: Vec<ModrinthApiFile>,
}

fn fabric_cache_path(paths: &LauncherPaths, mc_version: &str) -> PathBuf {
    paths
        .cache_path()
        .join(format!("fabric_loaders_{mc_version}.json"))
}

/// Version-isolated Fabric Loader profile directory so 1.21.11 and 26.2 never mix profiles.
pub fn fabric_profile_path(
    paths: &LauncherPaths,
    mc_version: &str,
    loader_version: &str,
) -> PathBuf {
    let profile_id = format!("fabric-loader-{loader_version}-{mc_version}");
    paths
        .versions_path()
        .join(&profile_id)
        .join(format!("{profile_id}.json"))
}

pub fn load_installed_fabric_profile(
    paths: &LauncherPaths,
    mc_version: &str,
    loader_version: &str,
) -> Option<FabricProfileJson> {
    let versioned = fabric_profile_path(paths, mc_version, loader_version);
    if versioned.exists() {
        if let Ok(raw) = fs::read_to_string(&versioned) {
            if let Ok(parsed) = serde_json::from_str::<FabricProfileJson>(&raw) {
                return Some(parsed);
            }
        }
    }
    let legacy_cache = paths
        .cache_path()
        .join(format!("fabric_profile_{mc_version}_{loader_version}.json"));
    if legacy_cache.exists() {
        if let Ok(raw) = fs::read_to_string(&legacy_cache) {
            if let Ok(parsed) = serde_json::from_str::<FabricProfileJson>(&raw) {
                return Some(parsed);
            }
        }
    }
    None
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

/// Fetches and installs a version-isolated Fabric Loader profile for `(mc_version, loader_version)`.
pub async fn fetch_fabric_profile(
    paths: &LauncherPaths,
    mc_version: &str,
    loader_version: &str,
) -> Result<FabricProfileJson, FabricError> {
    if let Some(existing) = load_installed_fabric_profile(paths, mc_version, loader_version) {
        return Ok(existing);
    }

    let url = format!(
        "{FABRIC_META_BASE}/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let resp = http.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(FabricError::Validation(format!(
            "No official Fabric Loader {loader_version} profile is available for Minecraft {mc_version} (HTTP {}).",
            resp.status().as_u16()
        )));
    }
    let profile: FabricProfileJson = resp.json().await?;
    if profile.main_class.trim().is_empty() || profile.libraries.is_empty() {
        return Err(FabricError::Validation(format!(
            "Fabric Loader profile for Minecraft {mc_version} is incomplete."
        )));
    }

    let dest = fabric_profile_path(paths, mc_version, loader_version);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = dest.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&profile)?)?;
    fs::rename(&tmp, &dest)?;
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

fn is_valid_zip_jar(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    bytes.len() > 22 && bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04])
}

fn fabric_api_marker_path(instance_dir: &Path) -> PathBuf {
    instance_dir.join("mods").join(".7xair-fabric-api.json")
}

fn detect_installed_fabric_api(instance_dir: &Path) -> (Option<String>, Option<FabricApiMarker>) {
    let mods_dir = instance_dir.join("mods");
    let marker_path = fabric_api_marker_path(instance_dir);
    let marker = fs::read_to_string(&marker_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<FabricApiMarker>(&raw).ok());

    if let Some(ref m) = marker {
        let jar = mods_dir.join(&m.filename);
        if jar.exists() && is_valid_zip_jar(&jar) {
            return (Some(m.filename.clone()), Some(m.clone()));
        }
    }

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let lower = fname.to_ascii_lowercase();
            if lower.starts_with("fabric-api-") && lower.ends_with(".jar") && is_valid_zip_jar(&entry.path()) {
                return (Some(fname), marker);
            }
        }
    }
    (None, None)
}

/// Queries Modrinth for a strictly version-matched Fabric API release for `mc_version`.
/// Never returns a 1.21.11 release for 26.2 or vice versa.
async fn fetch_compatible_fabric_api_release(
    mc_version: &str,
) -> Result<Option<ModrinthApiVersion>, FabricError> {
    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let url = format!("{MODRINTH_API_BASE}/project/{FABRIC_API_MODRINTH_ID}/version");
    let resp = http
        .get(&url)
        .query(&[
            ("loaders", "[\"fabric\"]".to_string()),
            ("game_versions", format!("[\"{mc_version}\"]")),
        ])
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let versions: Vec<ModrinthApiVersion> = resp.json().await?;
    // Strict exact-match filter: never mix 1.21.11 and 26.2 Fabric API jars
    let matched = versions.into_iter().find(|v| {
        v.loaders.iter().any(|l| l.eq_ignore_ascii_case("fabric"))
            && v.game_versions.iter().any(|gv| gv == mc_version)
            && !v.files.is_empty()
    });
    Ok(matched)
}

/// Inspects Fabric API installation status for a single instance without modifying any files.
pub fn inspect_fabric_api_status(
    instance_id: &str,
    instance_dir: &Path,
    mc_version: &str,
    loader: &str,
    auto_install_fabric_api: bool,
) -> FabricApiStatus {
    if loader != "fabric" {
        return FabricApiStatus {
            instance_id: instance_id.to_string(),
            mc_version: mc_version.to_string(),
            auto_install_enabled: false,
            installed: false,
            installed_version: None,
            installed_filename: None,
            compatible_with_mc_version: true,
            latest_available_version: None,
            update_available: false,
            status: "vanilla".to_string(),
            message: "Vanilla instance (Fabric API not required).".to_string(),
        };
    }

    let (jar_name, marker) = detect_installed_fabric_api(instance_dir);
    let installed = jar_name.is_some();
    let compatible = marker
        .as_ref()
        .map(|m| m.mc_version == mc_version)
        .unwrap_or_else(|| {
            jar_name
                .as_ref()
                .map(|f| f.contains(&format!("+{mc_version}")) || f.contains(mc_version))
                .unwrap_or(false)
        });
    let installed_version = marker
        .as_ref()
        .map(|m| m.version_number.clone())
        .or_else(|| jar_name.clone());

    let (status, message) = if installed && compatible {
        (
            "installed".to_string(),
            format!(
                "Fabric API {} installed for MC {mc_version}.",
                installed_version.as_deref().unwrap_or("detected")
            ),
        )
    } else if installed && !compatible {
        (
            "update_available".to_string(),
            format!("Existing Fabric API JAR does not match MC {mc_version}."),
        )
    } else if !auto_install_fabric_api {
        (
            "disabled".to_string(),
            "Auto-Install Fabric API is OFF (not installed).".to_string(),
        )
    } else {
        (
            "not_installed".to_string(),
            format!("Fabric API will be installed automatically for MC {mc_version}."),
        )
    };

    FabricApiStatus {
        instance_id: instance_id.to_string(),
        mc_version: mc_version.to_string(),
        auto_install_enabled: auto_install_fabric_api,
        installed,
        installed_version,
        installed_filename: jar_name,
        compatible_with_mc_version: compatible,
        latest_available_version: None,
        update_available: installed && !compatible,
        status,
        message,
    }
}

/// Automatically downloads, validates (SHA-512 + ZIP header), and installs/updates a strictly
/// version-compatible Fabric API JAR into ONLY the selected instance's `mods/` directory.
pub async fn ensure_fabric_api_installed(
    instance_id: &str,
    instance_dir: &Path,
    mc_version: &str,
    loader: &str,
    auto_install_fabric_api: bool,
    force_update: bool,
) -> Result<FabricApiStatus, FabricError> {
    if loader != "fabric" {
        return Ok(inspect_fabric_api_status(
            instance_id,
            instance_dir,
            mc_version,
            loader,
            auto_install_fabric_api,
        ));
    }

    if !auto_install_fabric_api && !force_update {
        return Ok(inspect_fabric_api_status(
            instance_id,
            instance_dir,
            mc_version,
            loader,
            false,
        ));
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir)?;

    let (existing_jar, existing_marker) = detect_installed_fabric_api(instance_dir);
    let compatible_existing = existing_jar.is_some()
        && existing_marker
            .as_ref()
            .map(|m| m.mc_version == mc_version)
            .unwrap_or_else(|| {
                existing_jar
                    .as_ref()
                    .map(|f| f.contains(&format!("+{mc_version}")) || f.contains(mc_version))
                    .unwrap_or(false)
            });

    let latest = fetch_compatible_fabric_api_release(mc_version).await?;
    let Some(release) = latest else {
        let mut st = inspect_fabric_api_status(
            instance_id,
            instance_dir,
            mc_version,
            loader,
            auto_install_fabric_api,
        );
        if !compatible_existing {
            st.status = "unavailable".to_string();
            st.compatible_with_mc_version = false;
            st.message = format!(
                "No official Fabric API release is available for Minecraft {mc_version} yet. Incompatible versions were NOT installed."
            );
        }
        return Ok(st);
    };

    let primary_file = release
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| release.files.first())
        .ok_or_else(|| {
            FabricError::Validation("Fabric API release metadata contained no downloadable JAR.".to_string())
        })?;

    // Avoid duplicate download if the exact compatible release is already present and valid
    if compatible_existing {
        let already_latest = existing_marker
            .as_ref()
            .map(|m| m.version_id == release.id)
            .unwrap_or(false)
            || existing_jar.as_deref() == Some(primary_file.filename.as_str());
        if already_latest || !force_update {
            return Ok(FabricApiStatus {
                instance_id: instance_id.to_string(),
                mc_version: mc_version.to_string(),
                auto_install_enabled: auto_install_fabric_api,
                installed: true,
                installed_version: existing_marker
                    .map(|m| m.version_number)
                    .or(existing_jar.clone()),
                installed_filename: existing_jar,
                compatible_with_mc_version: true,
                latest_available_version: Some(release.version_number.clone()),
                update_available: !already_latest,
                status: if already_latest {
                    "installed".to_string()
                } else {
                    "update_available".to_string()
                },
                message: if already_latest {
                    format!("Fabric API {} is up to date for MC {mc_version}.", release.version_number)
                } else {
                    format!("Fabric API update {} available for MC {mc_version}.", release.version_number)
                },
            });
        }
    }

    // Download and validate SHA-512 + ZIP header before placing in this instance's mods/ folder
    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let bytes = http
        .get(&primary_file.url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    if bytes.len() <= 22 || !bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]) {
        return Err(FabricError::Validation(format!(
            "Downloaded Fabric API file '{}' is not a valid JAR archive.",
            primary_file.filename
        )));
    }
    if let Some(expected_sha512) = primary_file.hashes.get("sha512") {
        let mut hasher = Sha512::new();
        hasher.update(&bytes);
        let actual_hex = format!("{:x}", hasher.finalize());
        if !actual_hex.eq_ignore_ascii_case(expected_sha512) {
            return Err(FabricError::Validation(format!(
                "SHA-512 checksum mismatch for Fabric API '{}'.",
                primary_file.filename
            )));
        }
    }

    // Remove older Fabric API JARs in THIS instance only (never touch other instances)
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let lower = fname.to_ascii_lowercase();
            if lower.starts_with("fabric-api-") && lower.ends_with(".jar") && fname != primary_file.filename {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    let dest_jar = mods_dir.join(&primary_file.filename);
    let tmp_jar = mods_dir.join(format!("{}.part", primary_file.filename));
    fs::write(&tmp_jar, &bytes)?;
    fs::rename(&tmp_jar, &dest_jar)?;

    let marker = FabricApiMarker {
        mc_version: mc_version.to_string(),
        version_id: release.id,
        version_number: release.version_number.clone(),
        filename: primary_file.filename.clone(),
        sha512: primary_file.hashes.get("sha512").cloned(),
    };
    fs::write(
        fabric_api_marker_path(instance_dir),
        serde_json::to_string_pretty(&marker)?,
    )?;

    Ok(FabricApiStatus {
        instance_id: instance_id.to_string(),
        mc_version: mc_version.to_string(),
        auto_install_enabled: auto_install_fabric_api,
        installed: true,
        installed_version: Some(release.version_number.clone()),
        installed_filename: Some(primary_file.filename.clone()),
        compatible_with_mc_version: true,
        latest_available_version: Some(release.version_number.clone()),
        update_available: false,
        status: "installed".to_string(),
        message: format!(
            "Installed Fabric API {} for MC {mc_version}.",
            release.version_number
        ),
    })
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
