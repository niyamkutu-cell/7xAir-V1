use crate::instances::GameInstance;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Error)]
pub enum ModrinthError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("no compatible version found on Modrinth for project '{0}'")]
    NoCompatibleVersion(String),
    #[error("SHA-512 integrity check failed for '{0}'")]
    HashMismatch(String),
    #[error("invalid content type '{0}'; expected 'mod', 'modpack', or 'resourcepack'")]
    InvalidProjectType(String),
    #[error("modpack installation error: {0}")]
    Modpack(String),
    #[error("content item '{0}' not found in instance")]
    ContentNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearchHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub project_type: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub latest_version: Option<String>,
    #[serde(default)]
    pub gallery: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearchResponse {
    pub hits: Vec<ModrinthSearchHit>,
    pub offset: u32,
    pub limit: u32,
    pub total_hits: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String, // "required" | "optional" | "incompatible" | "embedded"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthFileHashes {
    pub sha512: Option<String>,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: Option<ModrinthFileHashes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    #[serde(default)]
    pub changelog: Option<String>,
    #[serde(default)]
    pub date_published: Option<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<ModrinthDependency>,
    #[serde(default)]
    pub files: Vec<ModrinthFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledContentItem {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub title: String,
    pub version_number: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    pub project_type: String, // "mod" | "resourcepack"
    pub filename: String,
    pub enabled: bool,
    pub managed: bool,
    #[serde(default)]
    pub modpack_managed: bool,
    pub sha512: Option<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default)]
    pub required_dependencies: Vec<String>,
    pub installed_at_epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentManifest {
    pub items: Vec<InstalledContentItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallContentResult {
    pub installed: Vec<InstalledContentItem>,
    pub skipped_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentUpdateInfo {
    pub project_id: String,
    pub title: String,
    pub project_type: String,
    pub current_version: String,
    pub latest_version_id: String,
    pub latest_version_number: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityIssue {
    pub severity: String, // "error" | "warning" | "info"
    pub filename: String,
    pub project_type: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub instance_id: String,
    pub mc_version: String,
    pub loader: String,
    pub compatible: bool,
    pub error_count: usize,
    pub warning_count: usize,
    pub issues: Vec<CompatibilityIssue>,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, ModrinthError> {
    Ok(reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0 (https://7xair.vercel.app)")
        .build()?)
}

fn content_subdir(instance: &GameInstance, project_type: &str) -> Result<PathBuf, ModrinthError> {
    let dir = PathBuf::from(&instance.instance_dir);
    match project_type {
        "mod" => Ok(dir.join("mods")),
        "resourcepack" => Ok(dir.join("resourcepacks")),
        other => Err(ModrinthError::InvalidProjectType(other.to_string())),
    }
}

fn manifest_path(instance: &GameInstance) -> PathBuf {
    PathBuf::from(&instance.instance_dir).join("content-manifest.json")
}

pub fn load_content_manifest(instance: &GameInstance) -> ContentManifest {
    let path = manifest_path(instance);
    if !path.exists() {
        return ContentManifest::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ContentManifest>(&raw).ok())
        .unwrap_or_default()
}

pub fn save_content_manifest(
    instance: &GameInstance,
    manifest: &ContentManifest,
) -> Result<(), ModrinthError> {
    let path = manifest_path(instance);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(manifest)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub async fn search_projects(
    query: &str,
    project_type: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
    sort_by: Option<&str>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<ModrinthSearchResponse, ModrinthError> {
    if project_type != "mod" && project_type != "modpack" && project_type != "resourcepack" {
        return Err(ModrinthError::InvalidProjectType(project_type.to_string()));
    }

    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{project_type}")]];
    if let Some(ver) = mc_version.filter(|v| !v.trim().is_empty()) {
        facets.push(vec![format!("versions:{ver}")]);
    }
    if project_type == "mod" || project_type == "modpack" {
        if let Some(ld) = loader.filter(|l| !l.trim().is_empty() && *l != "vanilla") {
            facets.push(vec![format!("categories:{ld}")]);
        }
    }

    let facets_json = serde_json::to_string(&facets)?;
    let index = sort_by.unwrap_or("relevance");
    let lim = limit.unwrap_or(20).clamp(1, 50).to_string();
    let off = offset.unwrap_or(0).to_string();

    let resp = http_client()?
        .get(format!("{MODRINTH_API_BASE}/search"))
        .query(&[
            ("query", query),
            ("facets", facets_json.as_str()),
            ("index", index),
            ("limit", lim.as_str()),
            ("offset", off.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<ModrinthSearchResponse>()
        .await?;

    Ok(resp)
}

pub async fn fetch_project_versions(
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
    project_type: &str,
) -> Result<Vec<ModrinthVersion>, ModrinthError> {
    let mut query_params: Vec<(&str, String)> = Vec::new();
    if let Some(ver) = mc_version.filter(|v| !v.trim().is_empty()) {
        query_params.push(("game_versions", serde_json::to_string(&vec![ver])?));
    }
    if project_type == "mod" || project_type == "modpack" {
        if let Some(ld) = loader.filter(|l| !l.trim().is_empty() && *l != "vanilla") {
            query_params.push(("loaders", serde_json::to_string(&vec![ld])?));
        }
    }

    let versions = http_client()?
        .get(format!("{MODRINTH_API_BASE}/project/{project_id}/version"))
        .query(&query_params)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<ModrinthVersion>>()
        .await?;

    Ok(versions)
}

async fn fetch_single_version(version_id: &str) -> Result<ModrinthVersion, ModrinthError> {
    let ver = http_client()?
        .get(format!("{MODRINTH_API_BASE}/version/{version_id}"))
        .send()
        .await?
        .error_for_status()?
        .json::<ModrinthVersion>()
        .await?;
    Ok(ver)
}

fn sha512_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha512::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

async fn download_and_record_version(
    instance: &GameInstance,
    version: &ModrinthVersion,
    project_type: &str,
    title: Option<String>,
    manifest: &mut ContentManifest,
) -> Result<InstalledContentItem, ModrinthError> {
    let file = version
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| version.files.first())
        .ok_or_else(|| ModrinthError::NoCompatibleVersion(version.project_id.clone()))?;

    let target_dir = content_subdir(instance, project_type)?;
    fs::create_dir_all(&target_dir)?;

    let bytes = http_client()?
        .get(&file.url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    let computed_sha512 = sha512_hex(&bytes);
    if let Some(expected) = file.hashes.as_ref().and_then(|h| h.sha512.as_ref()) {
        if !expected.eq_ignore_ascii_case(&computed_sha512) {
            return Err(ModrinthError::HashMismatch(file.filename.clone()));
        }
    }

    // Remove older file for the same project_id if updating/reinstalling
    if let Some(old) = manifest
        .items
        .iter()
        .find(|i| i.project_id.as_deref() == Some(version.project_id.as_str()))
        .cloned()
    {
        let old_enabled = target_dir.join(&old.filename);
        let old_disabled = target_dir.join(format!("{}.disabled", old.filename));
        if old.filename != file.filename {
            let _ = fs::remove_file(old_enabled);
            let _ = fs::remove_file(old_disabled);
        }
        manifest
            .items
            .retain(|i| i.project_id.as_deref() != Some(version.project_id.as_str()));
    }

    fs::write(target_dir.join(&file.filename), &bytes)?;

    let req_deps: Vec<String> = version
        .dependencies
        .iter()
        .filter(|d| d.dependency_type == "required")
        .filter_map(|d| d.project_id.clone())
        .collect();

    let item = InstalledContentItem {
        project_id: Some(version.project_id.clone()),
        version_id: Some(version.id.clone()),
        title: title.unwrap_or_else(|| version.name.clone()),
        version_number: version.version_number.clone(),
        description: None,
        icon_url: None,
        project_type: project_type.to_string(),
        filename: file.filename.clone(),
        enabled: true,
        managed: true,
        modpack_managed: false,
        sha512: Some(computed_sha512),
        game_versions: version.game_versions.clone(),
        loaders: version.loaders.clone(),
        required_dependencies: req_deps,
        installed_at_epoch: now_epoch(),
    };
    manifest.items.push(item.clone());
    Ok(item)
}

/// Installs a Modrinth mod or resource pack into an isolated instance, recursively resolving required dependencies.
pub async fn install_content_with_dependencies(
    instance: &GameInstance,
    project_id: &str,
    version_id: Option<&str>,
    project_type: &str,
    title: Option<String>,
) -> Result<InstallContentResult, ModrinthError> {
    let mut manifest = load_content_manifest(instance);
    let mut installed_items: Vec<InstalledContentItem> = Vec::new();
    let mut skipped_deps: Vec<String> = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();

    // Queue entries: (project_id, optional_version_id, optional_title)
    let mut queue: Vec<(String, Option<String>, Option<String>)> = vec![(
        project_id.to_string(),
        version_id.map(str::to_string),
        title,
    )];

    while let Some((pid, vid, item_title)) = queue.pop() {
        if !visited.insert(pid.clone()) {
            continue;
        }

        // Skip dependency if already installed (unless it's the explicitly requested root project)
        let is_root = pid == project_id;
        if !is_root
            && manifest
                .items
                .iter()
                .any(|i| i.project_id.as_deref() == Some(pid.as_str()))
        {
            skipped_deps.push(pid);
            continue;
        }

        let resolved_version = if let Some(explicit_vid) = vid {
            fetch_single_version(&explicit_vid).await?
        } else {
            let candidates = fetch_project_versions(
                &pid,
                Some(&instance.mc_version),
                Some(&instance.loader),
                project_type,
            )
            .await?;
            candidates
                .into_iter()
                .next()
                .ok_or_else(|| ModrinthError::NoCompatibleVersion(pid.clone()))?
        };

        for dep in &resolved_version.dependencies {
            if dep.dependency_type == "required" {
                if let Some(dep_pid) = &dep.project_id {
                    if !visited.contains(dep_pid) {
                        queue.push((dep_pid.clone(), dep.version_id.clone(), None));
                    }
                }
            }
        }

        let recorded = download_and_record_version(
            instance,
            &resolved_version,
            project_type,
            item_title,
            &mut manifest,
        )
        .await?;
        installed_items.push(recorded);
    }

    save_content_manifest(instance, &manifest)?;
    Ok(InstallContentResult {
        installed: installed_items,
        skipped_dependencies: skipped_deps,
    })
}

fn read_fabric_mod_meta(jar_path: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let Ok(file) = fs::File::open(jar_path) else {
        return (None, None, None);
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return (None, None, None);
    };
    let Ok(mut entry) = archive.by_name("fabric.mod.json") else {
        return (None, None, None);
    };
    let mut raw = String::new();
    if std::io::Read::read_to_string(&mut entry, &mut raw).is_err() {
        return (None, None, None);
    }
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return (None, None, None);
    };
    let name = val.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
    let version = val.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
    let desc = val.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
    (name, version, desc)
}

/// Lists all managed + manually dropped mods and resource packs for an independent instance.
pub fn list_installed_content(instance: &GameInstance) -> Vec<InstalledContentItem> {
    let manifest = load_content_manifest(instance);
    let mut by_file: HashMap<(String, String), InstalledContentItem> = HashMap::new();

    for item in manifest.items {
        by_file.insert((item.project_type.clone(), item.filename.clone()), item);
    }

    let mut result: Vec<InstalledContentItem> = Vec::new();
    for (ptype, subdir, ext) in [("mod", "mods", ".jar"), ("resourcepack", "resourcepacks", ".zip")]
    {
        let dir = Path::new(&instance.instance_dir).join(subdir);
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.starts_with('.') {
                continue;
            }
            let (base_name, enabled) = if let Some(stripped) = fname.strip_suffix(".disabled") {
                (stripped.to_string(), false)
            } else {
                (fname.clone(), true)
            };

            if !base_name.ends_with(ext) {
                continue;
            }

            let (jar_name, jar_ver, jar_desc) = if ptype == "mod" {
                read_fabric_mod_meta(&entry.path())
            } else {
                (None, None, None)
            };

            if let Some(mut managed) = by_file.remove(&(ptype.to_string(), base_name.clone())) {
                managed.enabled = enabled;
                if managed.description.is_none() {
                    managed.description = jar_desc;
                }
                result.push(managed);
            } else {
                result.push(InstalledContentItem {
                    project_id: None,
                    version_id: None,
                    title: jar_name.unwrap_or_else(|| base_name.clone()),
                    version_number: jar_ver.unwrap_or_else(|| "manual".to_string()),
                    description: jar_desc,
                    icon_url: None,
                    project_type: ptype.to_string(),
                    filename: base_name,
                    enabled,
                    managed: false,
                    modpack_managed: false,
                    sha512: None,
                    game_versions: Vec::new(),
                    loaders: Vec::new(),
                    required_dependencies: Vec::new(),
                    installed_at_epoch: 0,
                });
            }
        }
    }

    result.sort_by(|a, b| {
        a.project_type
            .cmp(&b.project_type)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    result
}

pub fn toggle_content_enabled(
    instance: &GameInstance,
    filename: &str,
    project_type: &str,
    enabled: bool,
) -> Result<Vec<InstalledContentItem>, ModrinthError> {
    let dir = content_subdir(instance, project_type)?;
    let active_path = dir.join(filename);
    let disabled_path = dir.join(format!("{filename}.disabled"));

    if enabled && disabled_path.exists() {
        fs::rename(&disabled_path, &active_path)?;
    } else if !enabled && active_path.exists() {
        fs::rename(&active_path, &disabled_path)?;
    } else if !active_path.exists() && !disabled_path.exists() {
        return Err(ModrinthError::ContentNotFound(filename.to_string()));
    }

    let mut manifest = load_content_manifest(instance);
    for item in &mut manifest.items {
        if item.project_type == project_type && item.filename == filename {
            item.enabled = enabled;
        }
    }
    save_content_manifest(instance, &manifest)?;
    Ok(list_installed_content(instance))
}

pub fn remove_content_item(
    instance: &GameInstance,
    filename: &str,
    project_type: &str,
) -> Result<Vec<InstalledContentItem>, ModrinthError> {
    let dir = content_subdir(instance, project_type)?;
    let active_path = dir.join(filename);
    let disabled_path = dir.join(format!("{filename}.disabled"));

    if active_path.exists() {
        fs::remove_file(&active_path)?;
    }
    if disabled_path.exists() {
        fs::remove_file(&disabled_path)?;
    }

    let mut manifest = load_content_manifest(instance);
    manifest
        .items
        .retain(|i| !(i.project_type == project_type && i.filename == filename));
    save_content_manifest(instance, &manifest)?;
    Ok(list_installed_content(instance))
}

pub async fn check_for_updates(
    instance: &GameInstance,
) -> Result<Vec<ContentUpdateInfo>, ModrinthError> {
    let manifest = load_content_manifest(instance);
    let mut updates = Vec::new();

    for item in manifest.items {
        let Some(pid) = item.project_id else {
            continue;
        };
        let Ok(versions) = fetch_project_versions(
            &pid,
            Some(&instance.mc_version),
            Some(&instance.loader),
            &item.project_type,
        )
        .await
        else {
            continue;
        };
        if let Some(latest) = versions.first() {
            if item.version_id.as_deref() != Some(latest.id.as_str()) {
                updates.push(ContentUpdateInfo {
                    project_id: pid,
                    title: item.title,
                    project_type: item.project_type,
                    current_version: item.version_number,
                    latest_version_id: latest.id.clone(),
                    latest_version_number: latest.version_number.clone(),
                    filename: item.filename,
                });
            }
        }
    }

    Ok(updates)
}

pub async fn update_single_content(
    instance: &GameInstance,
    project_id: &str,
) -> Result<InstallContentResult, ModrinthError> {
    let manifest = load_content_manifest(instance);
    let existing = manifest
        .items
        .iter()
        .find(|i| i.project_id.as_deref() == Some(project_id))
        .cloned()
        .ok_or_else(|| ModrinthError::ContentNotFound(project_id.to_string()))?;

    install_content_with_dependencies(
        instance,
        project_id,
        None,
        &existing.project_type,
        Some(existing.title),
    )
    .await
}

/// Runs comprehensive compatibility checks across all installed mods & resource packs in an instance.
pub fn run_compatibility_checks(instance: &GameInstance) -> CompatibilityReport {
    let items = list_installed_content(instance);
    let mut issues: Vec<CompatibilityIssue> = Vec::new();

    let enabled_project_ids: HashSet<String> = items
        .iter()
        .filter(|i| i.enabled)
        .filter_map(|i| i.project_id.clone())
        .collect();

    let mut seen_projects: HashMap<String, usize> = HashMap::new();

    for item in &items {
        if !item.enabled {
            continue;
        }

        if let Some(pid) = &item.project_id {
            *seen_projects.entry(pid.clone()).or_insert(0) += 1;
        }

        if item.project_type == "mod" && instance.loader == "vanilla" {
            issues.push(CompatibilityIssue {
                severity: "error".to_string(),
                filename: item.filename.clone(),
                project_type: item.project_type.clone(),
                code: "MOD_ON_VANILLA".to_string(),
                message: format!(
                    "Mod '{}' cannot load on a Vanilla instance; switch loader to Fabric.",
                    item.title
                ),
            });
        }

        if !item.managed {
            issues.push(CompatibilityIssue {
                severity: "info".to_string(),
                filename: item.filename.clone(),
                project_type: item.project_type.clone(),
                code: "UNMANAGED_FILE".to_string(),
                message: format!(
                    "'{}' was added manually; version & dependency metadata could not be verified automatically.",
                    item.filename
                ),
            });
            continue;
        }

        if item.project_type == "mod"
            && !item.loaders.is_empty()
            && !item.loaders.iter().any(|l| l.eq_ignore_ascii_case(&instance.loader))
        {
            issues.push(CompatibilityIssue {
                severity: "error".to_string(),
                filename: item.filename.clone(),
                project_type: item.project_type.clone(),
                code: "LOADER_MISMATCH".to_string(),
                message: format!(
                    "Mod '{}' targets [{}] which does not match instance loader '{}'.",
                    item.title,
                    item.loaders.join(", "),
                    instance.loader
                ),
            });
        }

        if !item.game_versions.is_empty()
            && !item.game_versions.iter().any(|v| v == &instance.mc_version)
        {
            let severity = if item.project_type == "mod" {
                "error"
            } else {
                "warning"
            };
            issues.push(CompatibilityIssue {
                severity: severity.to_string(),
                filename: item.filename.clone(),
                project_type: item.project_type.clone(),
                code: "MC_VERSION_MISMATCH".to_string(),
                message: format!(
                    "'{}' supports MC [{}], not instance target '{}'.",
                    item.title,
                    item.game_versions.join(", "),
                    instance.mc_version
                ),
            });
        }

        for dep_pid in &item.required_dependencies {
            if !enabled_project_ids.contains(dep_pid) {
                issues.push(CompatibilityIssue {
                    severity: "error".to_string(),
                    filename: item.filename.clone(),
                    project_type: item.project_type.clone(),
                    code: "MISSING_DEPENDENCY".to_string(),
                    message: format!(
                        "Mod '{}' is missing required Modrinth dependency '{}'.",
                        item.title, dep_pid
                    ),
                });
            }
        }
    }

    for (pid, count) in seen_projects {
        if count > 1 {
            issues.push(CompatibilityIssue {
                severity: "warning".to_string(),
                filename: pid.clone(),
                project_type: "mod".to_string(),
                code: "DUPLICATE_PROJECT".to_string(),
                message: format!(
                    "Modrinth project '{pid}' appears {count} times in this instance."
                ),
            });
        }
    }

    let error_count = issues.iter().filter(|i| i.severity == "error").count();
    let warning_count = issues.iter().filter(|i| i.severity == "warning").count();

    CompatibilityReport {
        instance_id: instance.id.clone(),
        mc_version: instance.mc_version.clone(),
        loader: instance.loader.clone(),
        compatible: error_count == 0,
        error_count,
        warning_count,
        issues,
    }
}

// ============================================================================
// Modrinth Modpack (.mrpack) Installation Engine
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackManifest {
    pub format_version: u32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub files: Vec<MrpackFileEntry>,
    #[serde(default)]
    pub dependencies: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MrpackFileEnv {
    pub client: Option<String>,
    pub server: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MrpackFileEntry {
    pub path: String,
    #[serde(default)]
    pub hashes: HashMap<String, String>,
    pub env: Option<MrpackFileEnv>,
    #[serde(default)]
    pub downloads: Vec<String>,
    #[serde(default)]
    pub file_size: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallModpackRequest {
    pub project_id: String,
    pub version_id: String,
    pub modpack_name: String,
    pub instance_name: String,
    pub icon_url: Option<String>,
    pub mc_version_override: Option<String>,
    pub loader_override: Option<String>,
    pub loader_version_override: Option<String>,
    pub instance_dir_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModpackInstallProgress {
    pub active: bool,
    pub modpack_name: Option<String>,
    pub stage: String,
    pub completed_files: usize,
    pub total_files: usize,
    pub percent: u8,
    pub installed_mod_count: usize,
    pub created_instance_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallModpackResult {
    pub instance: GameInstance,
    pub installed_files: usize,
    pub installed_mods: usize,
    pub extracted_overrides: usize,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
}

/// Safely joins an untrusted relative path inside `root`, rejecting any path traversal
/// (`..`), absolute paths, or Windows drive prefixes so archives cannot overwrite arbitrary files.
pub fn safe_join_under_root(root: &Path, rel: &str) -> Result<PathBuf, ModrinthError> {
    let normalized = rel.replace('\\', "/");
    let trimmed = normalized.trim_start_matches("./");
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.contains(':')
    {
        return Err(ModrinthError::Modpack(format!(
            "Rejected unsafe archive path '{rel}'"
        )));
    }
    let mut dest = root.to_path_buf();
    for comp in Path::new(trimmed).components() {
        match comp {
            std::path::Component::Normal(part) => dest.push(part),
            std::path::Component::CurDir => {}
            _ => {
                return Err(ModrinthError::Modpack(format!(
                    "Rejected path traversal attempt '{rel}'"
                )));
            }
        }
    }
    if !dest.starts_with(root) {
        return Err(ModrinthError::Modpack(format!(
            "Resolved path escaped instance root for '{rel}'"
        )));
    }
    Ok(dest)
}

fn update_mp_progress(
    progress_arc: &std::sync::Arc<std::sync::Mutex<ModpackInstallProgress>>,
    f: impl FnOnce(&mut ModpackInstallProgress),
) {
    if let Ok(mut guard) = progress_arc.lock() {
        f(&mut guard);
    }
}

/// Downloads an official Modrinth `.mrpack`, parses `modrinth.index.json`, validates all
/// file SHA-512 hashes, extracts `overrides/` & `client-overrides/` safely, and returns
/// the installation details ready to register as an isolated 7xAir instance.
pub async fn download_and_extract_modpack(
    target_dir: &Path,
    req: &InstallModpackRequest,
    progress_arc: &std::sync::Arc<std::sync::Mutex<ModpackInstallProgress>>,
) -> Result<(String, String, Option<String>, String, usize, usize, usize), ModrinthError> {
    update_mp_progress(progress_arc, |p| {
        p.active = true;
        p.modpack_name = Some(req.modpack_name.clone());
        p.stage = "Fetching Modrinth modpack release metadata...".to_string();
        p.completed_files = 0;
        p.total_files = 0;
        p.percent = 5;
        p.installed_mod_count = 0;
        p.created_instance_id = None;
        p.error = None;
    });

    let client = http_client()?;
    let version: ModrinthVersion = client
        .get(format!("{MODRINTH_API_BASE}/version/{}", req.version_id))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mrpack_file = version
        .files
        .iter()
        .find(|f| f.filename.ends_with(".mrpack") && f.primary)
        .or_else(|| version.files.iter().find(|f| f.filename.ends_with(".mrpack")))
        .or_else(|| version.files.first())
        .ok_or_else(|| ModrinthError::Modpack("Modpack version has no .mrpack archive.".to_string()))?;

    update_mp_progress(progress_arc, |p| {
        p.stage = format!("Downloading {}...", mrpack_file.filename);
        p.percent = 12;
    });

    let archive_bytes = client
        .get(&mrpack_file.url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    if let Some(expected_sha512) = mrpack_file.hashes.as_ref().and_then(|h| h.sha512.as_deref()) {
        let mut hasher = Sha512::new();
        hasher.update(&archive_bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_sha512) {
            return Err(ModrinthError::HashMismatch(mrpack_file.filename.clone()));
        }
    }

    update_mp_progress(progress_arc, |p| {
        p.stage = "Parsing modrinth.index.json manifest...".to_string();
        p.percent = 20;
    });

    let cursor = std::io::Cursor::new(archive_bytes.as_ref());
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| ModrinthError::Modpack(format!("Invalid .mrpack ZIP archive: {e}")))?;

    let manifest: MrpackManifest = {
        let mut idx_entry = archive
            .by_name("modrinth.index.json")
            .map_err(|_| ModrinthError::Modpack("Missing modrinth.index.json in .mrpack.".to_string()))?;
        let mut raw = String::new();
        std::io::Read::read_to_string(&mut idx_entry, &mut raw)?;
        serde_json::from_str(&raw)?
    };

    if manifest.game != "minecraft" {
        return Err(ModrinthError::Modpack(format!(
            "Unsupported modpack game '{}'; expected 'minecraft'.",
            manifest.game
        )));
    }

    let mc_version = manifest
        .dependencies
        .get("minecraft")
        .cloned()
        .or_else(|| req.mc_version_override.clone())
        .or_else(|| version.game_versions.first().cloned())
        .ok_or_else(|| ModrinthError::Modpack("Manifest missing Minecraft version.".to_string()))?;

    let (loader, loader_version) = if let Some(v) = manifest.dependencies.get("fabric-loader") {
        ("fabric".to_string(), Some(v.clone()))
    } else if let Some(v) = manifest.dependencies.get("neoforge") {
        ("neoforge".to_string(), Some(v.clone()))
    } else if let Some(v) = manifest.dependencies.get("forge") {
        ("forge".to_string(), Some(v.clone()))
    } else if let Some(v) = manifest.dependencies.get("quilt-loader") {
        ("quilt".to_string(), Some(v.clone()))
    } else {
        (
            req.loader_override
                .clone()
                .unwrap_or_else(|| "fabric".to_string()),
            req.loader_version_override.clone(),
        )
    };

    for sub in ["mods", "config", "resourcepacks", "shaderpacks", "saves", "logs", "natives"] {
        fs::create_dir_all(target_dir.join(sub))?;
    }

    // Filter client-supported manifest files
    let client_files: Vec<&MrpackFileEntry> = manifest
        .files
        .iter()
        .filter(|f| {
            f.env
                .as_ref()
                .and_then(|e| e.client.as_deref())
                .map(|c| c != "unsupported")
                .unwrap_or(true)
        })
        .collect();

    let total_files = client_files.len();
    update_mp_progress(progress_arc, |p| {
        p.total_files = total_files;
        p.stage = format!("Downloading 0 / {total_files} modpack files...");
        p.percent = 25;
    });

    ensure_sufficient_disk_space(target_dir, 256 * 1024 * 1024)?;
    let mut installed_files = 0usize;
    let mut installed_mods = 0usize;
    let mut tracked_hashes: HashMap<String, String> = HashMap::new();

    for (idx, file_entry) in client_files.iter().enumerate() {
        let dest = safe_join_under_root(target_dir, &file_entry.path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut downloaded: Option<Vec<u8>> = None;
        for url in &file_entry.downloads {
            if let Ok(resp) = client.get(url).send().await {
                if resp.status().is_success() {
                    if let Ok(b) = resp.bytes().await {
                        downloaded = Some(b.to_vec());
                        break;
                    }
                }
            }
        }
        let bytes = downloaded.ok_or_else(|| {
            ModrinthError::Modpack(format!(
                "Failed to download modpack file '{}'",
                file_entry.path
            ))
        })?;

        if let Some(expected_sha512) = file_entry.hashes.get("sha512") {
            let mut hasher = Sha512::new();
            hasher.update(&bytes);
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected_sha512) {
                return Err(ModrinthError::HashMismatch(file_entry.path.clone()));
            }
        }

        let tmp = dest.with_extension("part");
        fs::write(&tmp, &bytes)?;
        fs::rename(&tmp, &dest)?;
        let file_sha = sha512_hex(&bytes);
        tracked_hashes.insert(file_entry.path.replace('\\', "/"), file_sha);

        installed_files += 1;
        if file_entry.path.starts_with("mods/") && file_entry.path.ends_with(".jar") {
            installed_mods += 1;
        }

        let done = idx + 1;
        let pct = 25 + ((done * 60) / total_files.max(1)).min(60) as u8;
        update_mp_progress(progress_arc, |p| {
            p.completed_files = done;
            p.installed_mod_count = installed_mods;
            p.percent = pct;
            p.stage = format!("Downloading {done} / {total_files} modpack files...");
        });
    }

    // Safely extract overrides/ and client-overrides/
    update_mp_progress(progress_arc, |p| {
        p.stage = "Extracting modpack overrides & configurations...".to_string();
        p.percent = 88;
    });

    let mut extracted_overrides = 0usize;
    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let rel = if let Some(stripped) = name.strip_prefix("overrides/") {
            stripped
        } else if let Some(stripped) = name.strip_prefix("client-overrides/") {
            stripped
        } else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        let dest = safe_join_under_root(target_dir, rel)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut buf)?;
        fs::write(&dest, &buf)?;
        tracked_hashes.insert(rel.replace('\\', "/"), sha512_hex(&buf));
        extracted_overrides += 1;
        if rel.starts_with("mods/") && rel.ends_with(".jar") {
            installed_mods += 1;
        }
    }

    let tracking = ModpackTrackingManifest {
        project_id: req.project_id.clone(),
        modpack_name: req.modpack_name.clone(),
        author: "Modrinth".to_string(),
        version_id: req.version_id.clone(),
        version_number: version.version_number.clone(),
        mc_version: mc_version.clone(),
        loader: loader.clone(),
        loader_version: loader_version.clone(),
        managed_files: tracked_hashes,
    };
    save_modpack_tracking(target_dir, &tracking)?;

    Ok((
        mc_version,
        loader,
        loader_version,
        version.version_number,
        installed_files,
        installed_mods,
        extracted_overrides,
    ))
}

// ============================================================================
// Modrinth Modpack System (Part 2): File Protection, Updates, Conflicts, Rollback
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackTrackingManifest {
    pub project_id: String,
    pub modpack_name: String,
    pub author: String,
    pub version_id: String,
    pub version_number: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    #[serde(default)]
    pub managed_files: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackFileConflict {
    pub path: String,
    pub reason: String, // "user_modified"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackStatusReport {
    pub is_modpack: bool,
    pub project_id: Option<String>,
    pub modpack_name: Option<String>,
    pub author: Option<String>,
    pub version_id: Option<String>,
    pub version_number: Option<String>,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub managed_file_count: usize,
    pub user_added_file_count: usize,
    pub user_modified_files: Vec<String>,
    pub backup_available: bool,
    pub modpack_page_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackUpdateInfo {
    pub instance_id: String,
    pub project_id: String,
    pub modpack_name: String,
    pub current_version: String,
    pub update_available: bool,
    pub latest_version_id: Option<String>,
    pub latest_version_number: Option<String>,
    pub changelog: Option<String>,
    pub compatible: bool,
    pub compatibility_message: String,
    pub conflicts: Vec<ModpackFileConflict>,
}

fn modpack_tracking_path(instance_dir: &Path) -> PathBuf {
    instance_dir.join("modpack-manifest.json")
}

fn modpack_backup_dir(instance_dir: &Path) -> PathBuf {
    instance_dir.join(".7xair-modpack-backup")
}

pub fn load_modpack_tracking(instance_dir: &Path) -> Option<ModpackTrackingManifest> {
    let path = modpack_tracking_path(instance_dir);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ModpackTrackingManifest>(&raw).ok())
}

pub fn save_modpack_tracking(
    instance_dir: &Path,
    manifest: &ModpackTrackingManifest,
) -> Result<(), ModrinthError> {
    let path = modpack_tracking_path(instance_dir);
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(manifest)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Checks available disk space on the target volume before downloading or updating a modpack.
pub fn ensure_sufficient_disk_space(target_dir: &Path, min_bytes: u64) -> Result<(), ModrinthError> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let check_path = if target_dir.exists() {
        target_dir.to_path_buf()
    } else {
        target_dir.parent().unwrap_or(Path::new(".")).to_path_buf()
    };
    let mut best_match: Option<(usize, u64)> = None;
    for disk in disks.list() {
        let mp = disk.mount_point();
        if check_path.starts_with(mp) {
            let depth = mp.as_os_str().len();
            if best_match.map(|(d, _)| depth > d).unwrap_or(true) {
                best_match = Some((depth, disk.available_space()));
            }
        }
    }
    if let Some((_, avail)) = best_match {
        if avail < min_bytes {
            return Err(ModrinthError::Modpack(format!(
                "Insufficient disk space: {} MB available, at least {} MB required.",
                avail / (1024 * 1024),
                min_bytes / (1024 * 1024)
            )));
        }
    }
    Ok(())
}

fn collect_relative_files(root: &Path, sub: &str, out: &mut Vec<String>) {
    let dir = root.join(sub);
    if !dir.exists() {
        return;
    }
    let mut stack = vec![dir];
    while let Some(cur) = stack.pop() {
        let Ok(entries) = fs::read_dir(&cur) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if let Ok(rel) = p.strip_prefix(root) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if !rel_str.contains("/.") {
                    out.push(rel_str);
                }
            }
        }
    }
}

/// Inspects an instance's modpack tracking manifest to differentiate:
/// 1. Modpack-managed files (unchanged)
/// 2. User-modified files (tracked file whose SHA-512 differs from install-time hash)
/// 3. User-added files (present in mods/config/resourcepacks/shaderpacks but not tracked)
pub fn inspect_modpack_status(instance: &GameInstance) -> ModpackStatusReport {
    let root = PathBuf::from(&instance.instance_dir);
    let tracking = load_modpack_tracking(&root);
    let backup_available = modpack_backup_dir(&root).exists();

    let Some(mp) = tracking else {
        return ModpackStatusReport {
            is_modpack: instance.modpack_id.is_some(),
            project_id: instance.modpack_id.clone(),
            modpack_name: instance.modpack_name.clone(),
            author: None,
            version_id: None,
            version_number: instance.modpack_version.clone(),
            mc_version: instance.mc_version.clone(),
            loader: instance.loader.clone(),
            loader_version: instance.fabric_loader_version.clone(),
            managed_file_count: 0,
            user_added_file_count: 0,
            user_modified_files: Vec::new(),
            backup_available,
            modpack_page_url: instance
                .modpack_id
                .as_ref()
                .map(|id| format!("https://modrinth.com/modpack/{id}")),
        };
    };

    let mut all_files = Vec::new();
    for sub in ["mods", "config", "resourcepacks", "shaderpacks"] {
        collect_relative_files(&root, sub, &mut all_files);
    }

    let mut managed_count = 0usize;
    let mut user_added_count = 0usize;
    let mut user_modified = Vec::new();

    for rel in all_files {
        let base_rel = rel.trim_end_matches(".disabled");
        if let Some(expected_hash) = mp.managed_files.get(base_rel) {
            if let Ok(bytes) = fs::read(root.join(&rel)) {
                if sha512_hex(&bytes).eq_ignore_ascii_case(expected_hash) {
                    managed_count += 1;
                } else {
                    user_modified.push(rel);
                }
            }
        } else {
            user_added_count += 1;
        }
    }

    ModpackStatusReport {
        is_modpack: true,
        project_id: Some(mp.project_id.clone()),
        modpack_name: Some(mp.modpack_name),
        author: Some(mp.author),
        version_id: Some(mp.version_id),
        version_number: Some(mp.version_number),
        mc_version: mp.mc_version,
        loader: mp.loader,
        loader_version: mp.loader_version,
        managed_file_count: managed_count,
        user_added_file_count: user_added_count,
        user_modified_files: user_modified,
        backup_available,
        modpack_page_url: Some(format!("https://modrinth.com/modpack/{}", mp.project_id)),
    }
}

/// Checks Modrinth for a newer compatible release of an installed modpack and reports any
/// user-modified file conflicts before updating.
pub async fn check_modpack_update_for_instance(
    instance: &GameInstance,
) -> Result<ModpackUpdateInfo, ModrinthError> {
    let status = inspect_modpack_status(instance);
    let project_id = status
        .project_id
        .clone()
        .ok_or_else(|| ModrinthError::Modpack("This instance is not linked to a Modrinth modpack.".to_string()))?;
    let modpack_name = status
        .modpack_name
        .clone()
        .unwrap_or_else(|| instance.name.clone());
    let current_ver = status
        .version_number
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    let versions = fetch_project_versions(
        &project_id,
        Some(&instance.mc_version),
        Some(&instance.loader),
        "modpack",
    )
    .await?;

    let conflicts: Vec<ModpackFileConflict> = status
        .user_modified_files
        .into_iter()
        .map(|path| ModpackFileConflict {
            path,
            reason: "user_modified".to_string(),
        })
        .collect();

    let Some(latest) = versions.into_iter().find(|v| !v.files.is_empty()) else {
        return Ok(ModpackUpdateInfo {
            instance_id: instance.id.clone(),
            project_id,
            modpack_name,
            current_version: current_ver,
            update_available: false,
            latest_version_id: None,
            latest_version_number: None,
            changelog: None,
            compatible: false,
            compatibility_message: format!(
                "No compatible update found for MC {} ({}).",
                instance.mc_version, instance.loader
            ),
            conflicts,
        });
    };

    let is_newer = status.version_id.as_deref() != Some(latest.id.as_str())
        && current_ver != latest.version_number;

    Ok(ModpackUpdateInfo {
        instance_id: instance.id.clone(),
        project_id,
        modpack_name,
        current_version: current_ver,
        update_available: is_newer,
        latest_version_id: Some(latest.id),
        latest_version_number: Some(latest.version_number),
        changelog: latest.changelog,
        compatible: true,
        compatibility_message: format!(
            "Compatible with MC {} ({}).",
            instance.mc_version, instance.loader
        ),
        conflicts,
    })
}

fn copy_dir_safe(src: &Path, dst: &Path) -> Result<(), ModrinthError> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let sp = entry.path();
        let dp = dst.join(entry.file_name());
        if sp.is_dir() {
            copy_dir_safe(&sp, &dp)?;
        } else {
            fs::copy(&sp, &dp)?;
        }
    }
    Ok(())
}

/// Safely updates a modpack instance:
/// 1. Checks conflicts and refuses to overwrite user-modified files without explicit confirmation.
/// 2. Creates a full backup snapshot under `.7xair-modpack-backup/` for safe rollback.
/// 3. Preserves all user-added mods, resource packs, shader packs, and custom configs.
/// 4. Removes only obsolete unmodified modpack-managed files and installs the new release.
pub async fn update_modpack_in_instance(
    instance: &GameInstance,
    target_version_id: &str,
    overwrite_modified: bool,
    progress_arc: &std::sync::Arc<std::sync::Mutex<ModpackInstallProgress>>,
) -> Result<(String, String, Option<String>, String, usize, usize, usize), ModrinthError> {
    let root = PathBuf::from(&instance.instance_dir);
    ensure_sufficient_disk_space(&root, 256 * 1024 * 1024)?;

    let status = inspect_modpack_status(instance);
    let project_id = status
        .project_id
        .clone()
        .ok_or_else(|| ModrinthError::Modpack("Instance is not a managed Modrinth modpack.".to_string()))?;

    if !status.user_modified_files.is_empty() && !overwrite_modified {
        return Err(ModrinthError::Modpack(format!(
            "Update paused: {} user-modified file(s) detected ({}). Confirm overwrite or back up before updating.",
            status.user_modified_files.len(),
            status.user_modified_files.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
        )));
    }

    // 1. Create backup snapshot for safe rollback
    let backup = modpack_backup_dir(&root);
    if backup.exists() {
        let _ = fs::remove_dir_all(&backup);
    }
    fs::create_dir_all(&backup)?;
    for sub in ["mods", "config", "resourcepacks", "shaderpacks"] {
        copy_dir_safe(&root.join(sub), &backup.join(sub))?;
    }
    let track_src = modpack_tracking_path(&root);
    if track_src.exists() {
        let _ = fs::copy(&track_src, backup.join("modpack-manifest.json"));
    }

    // 2. Remove ONLY old modpack-managed files (NEVER delete user-added files!)
    if let Some(old_tracking) = load_modpack_tracking(&root) {
        let modified_set: HashSet<&str> = status.user_modified_files.iter().map(String::as_str).collect();
        for rel in old_tracking.managed_files.keys() {
            if !overwrite_modified && modified_set.contains(rel.as_str()) {
                continue;
            }
            if let Ok(full) = safe_join_under_root(&root, rel) {
                if full.exists() && full.is_file() {
                    let _ = fs::remove_file(full);
                }
            }
        }
    }

    // 3. Download & extract new release into the same instance root (preserving user-added files)
    let req = InstallModpackRequest {
        project_id,
        version_id: target_version_id.to_string(),
        modpack_name: status.modpack_name.unwrap_or_else(|| instance.name.clone()),
        instance_name: instance.name.clone(),
        icon_url: instance.modpack_icon_url.clone(),
        mc_version_override: Some(instance.mc_version.clone()),
        loader_override: Some(instance.loader.clone()),
        loader_version_override: instance.fabric_loader_version.clone(),
        instance_dir_override: Some(instance.instance_dir.clone()),
    };

    match download_and_extract_modpack(&root, &req, progress_arc).await {
        Ok(res) => Ok(res),
        Err(err) => {
            // Automatic rollback on failure so the instance is never left corrupted
            let _ = rollback_modpack_in_instance(instance);
            Err(err)
        }
    }
}

/// Restores the `.7xair-modpack-backup/` snapshot taken before the last modpack update.
pub fn rollback_modpack_in_instance(instance: &GameInstance) -> Result<ModpackStatusReport, ModrinthError> {
    let root = PathBuf::from(&instance.instance_dir);
    let backup = modpack_backup_dir(&root);
    if !backup.exists() {
        return Err(ModrinthError::Modpack(
            "No modpack update backup snapshot exists to roll back.".to_string(),
        ));
    }

    for sub in ["mods", "config", "resourcepacks", "shaderpacks"] {
        let src = backup.join(sub);
        if src.exists() {
            copy_dir_safe(&src, &root.join(sub))?;
        }
    }
    let backup_manifest = backup.join("modpack-manifest.json");
    if backup_manifest.exists() {
        fs::copy(&backup_manifest, modpack_tracking_path(&root))?;
    }
    Ok(inspect_modpack_status(instance))
}
