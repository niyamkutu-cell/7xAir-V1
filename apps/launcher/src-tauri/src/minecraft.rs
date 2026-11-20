use crate::config::SUPPORTED_MC_TARGETS;
use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub const MOJANG_MANIFEST_V2_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Error)]
pub enum MetadataError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Minecraft version '{0}' not found in official manifest")]
    VersionNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangLatest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MojangVersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub release_time: String,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangVersionManifest {
    pub latest: MojangLatest,
    pub versions: Vec<MojangVersionEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCompatibility {
    pub version: String,
    pub status: String, // "available" | "pending_official_release"
    pub version_type: Option<String>,
    pub release_time: Option<String>,
    pub manifest_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftMetadataSummary {
    pub source: String, // "live" | "cache" | "offline-fallback"
    pub latest_release: String,
    pub latest_snapshot: String,
    pub total_versions: usize,
    pub target_compatibility: Vec<TargetCompatibility>,
    pub recent_releases: Vec<MojangVersionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionAssetIndex {
    pub id: String,
    pub url: String,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadArtifact {
    pub path: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDownloads {
    pub client: Option<DownloadArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadArtifact>,
    #[serde(default)]
    pub classifiers: HashMap<String, DownloadArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryRuleOs {
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<LibraryRuleOs>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionLibrary {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<LibraryRule>>,
    #[serde(default)]
    pub natives: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDetails {
    pub id: String,
    pub main_class: String,
    pub asset_index: Option<VersionAssetIndex>,
    pub downloads: Option<VersionDownloads>,
    #[serde(default)]
    pub libraries: Vec<VersionLibrary>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetObjectEntry {
    pub hash: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetIndexFile {
    #[serde(default)]
    pub objects: HashMap<String, AssetObjectEntry>,
}

pub fn current_mojang_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn library_allowed_for_current_os(lib: &VersionLibrary) -> bool {
    let Some(rules) = &lib.rules else {
        return true;
    };
    let os_name = current_mojang_os_name();
    let mut allowed = false;
    for rule in rules {
        let os_matches = match &rule.os {
            None => true,
            Some(os_rule) => match &os_rule.name {
                None => true,
                Some(name) => name == os_name,
            },
        };
        if os_matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

fn manifest_cache_file(paths: &LauncherPaths) -> PathBuf {
    paths.cache_path().join("mojang_version_manifest_v2.json")
}

fn version_detail_cache_file(paths: &LauncherPaths, version_id: &str) -> PathBuf {
    paths.versions_path().join(version_id).join(format!("{version_id}.json"))
}

pub async fn fetch_or_load_manifest(
    paths: &LauncherPaths,
    force_refresh: bool,
) -> (MojangVersionManifest, String) {
    let cache_path = manifest_cache_file(paths);

    if !force_refresh && cache_path.exists() {
        if let Ok(raw) = fs::read_to_string(&cache_path) {
            if let Ok(parsed) = serde_json::from_str::<MojangVersionManifest>(&raw) {
                return (parsed, "cache".to_string());
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build();

    if let Ok(http) = client {
        if let Ok(resp) = http.get(MOJANG_MANIFEST_V2_URL).send().await {
            if resp.status().is_success() {
                if let Ok(manifest) = resp.json::<MojangVersionManifest>().await {
                    if let Ok(serialized) = serde_json::to_string_pretty(&manifest) {
                        let _ = fs::create_dir_all(paths.cache_path());
                        let _ = fs::write(&cache_path, serialized);
                    }
                    return (manifest, "live".to_string());
                }
            }
        }
    }

    if cache_path.exists() {
        if let Ok(raw) = fs::read_to_string(&cache_path) {
            if let Ok(parsed) = serde_json::from_str::<MojangVersionManifest>(&raw) {
                return (parsed, "cache".to_string());
            }
        }
    }

    (
        MojangVersionManifest {
            latest: MojangLatest {
                release: "1.21.11".to_string(),
                snapshot: "26.2".to_string(),
            },
            versions: Vec::new(),
        },
        "offline-fallback".to_string(),
    )
}

pub fn summarize_manifest(
    manifest: &MojangVersionManifest,
    source: String,
) -> MinecraftMetadataSummary {
    let target_compatibility = SUPPORTED_MC_TARGETS
        .iter()
        .map(|target| {
            if let Some(found) = manifest.versions.iter().find(|v| v.id == *target) {
                TargetCompatibility {
                    version: (*target).to_string(),
                    status: "available".to_string(),
                    version_type: Some(found.version_type.clone()),
                    release_time: Some(found.release_time.clone()),
                    manifest_url: Some(found.url.clone()),
                }
            } else {
                TargetCompatibility {
                    version: (*target).to_string(),
                    status: "pending_official_release".to_string(),
                    version_type: None,
                    release_time: None,
                    manifest_url: None,
                }
            }
        })
        .collect();

    // Only expose the two supported 7xAir targets (1.21.11 and 26.2)
    let recent_releases = manifest
        .versions
        .iter()
        .filter(|v| SUPPORTED_MC_TARGETS.contains(&v.id.as_str()))
        .cloned()
        .collect();

    MinecraftMetadataSummary {
        source,
        latest_release: "1.21.11".to_string(),
        latest_snapshot: "26.2".to_string(),
        total_versions: SUPPORTED_MC_TARGETS.len(),
        target_compatibility,
        recent_releases,
    }
}

pub async fn fetch_or_load_version_details(
    paths: &LauncherPaths,
    version_id: &str,
) -> Result<VersionDetails, MetadataError> {
    let local_json = version_detail_cache_file(paths, version_id);
    if local_json.exists() {
        let raw = fs::read_to_string(&local_json)?;
        return Ok(serde_json::from_str(&raw)?);
    }

    let (manifest, _) = fetch_or_load_manifest(paths, false).await;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| MetadataError::VersionNotFound(version_id.to_string()))?;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let details: VersionDetails = http.get(&entry.url).send().await?.json().await?;

    if let Some(parent) = local_json.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&local_json, serde_json::to_string_pretty(&details)?)?;
    Ok(details)
}

pub async fn ensure_file_downloaded(url: &str, dest: &Path) -> Result<(), MetadataError> {
    if dest.exists() && fs::metadata(dest)?.len() > 0 {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let bytes = http.get(url).send().await?.error_for_status()?.bytes().await?;
    let tmp = dest.with_extension("part");
    fs::write(&tmp, &bytes)?;
    fs::rename(&tmp, dest)?;
    Ok(())
}

/// Downloads missing Minecraft asset objects from resources.download.minecraft.net in bounded batches.
pub async fn ensure_assets_downloaded(
    paths: &LauncherPaths,
    index_file: &Path,
) -> Result<usize, MetadataError> {
    let raw = fs::read_to_string(index_file)?;
    let parsed: AssetIndexFile = serde_json::from_str(&raw)?;
    let objects_dir = paths.assets_path().join("objects");
    fs::create_dir_all(&objects_dir)?;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;

    let mut downloaded = 0usize;
    for entry in parsed.objects.values() {
        if entry.hash.len() < 2 {
            continue;
        }
        let prefix = &entry.hash[..2];
        let dest = objects_dir.join(prefix).join(&entry.hash);
        if dest.exists() && fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false) {
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let url = format!("https://resources.download.minecraft.net/{prefix}/{}", entry.hash);
        if let Ok(resp) = http.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    let tmp = dest.with_extension("part");
                    if fs::write(&tmp, &bytes).is_ok() {
                        let _ = fs::rename(&tmp, &dest);
                        downloaded += 1;
                    }
                }
            }
        }
    }
    Ok(downloaded)
}
