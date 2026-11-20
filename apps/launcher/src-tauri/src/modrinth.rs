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
    #[error("invalid content type '{0}'; expected 'mod' or 'resourcepack'")]
    InvalidProjectType(String),
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
    pub project_type: String, // "mod" | "resourcepack"
    pub filename: String,
    pub enabled: bool,
    pub managed: bool,
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
) -> Result<ModrinthSearchResponse, ModrinthError> {
    if project_type != "mod" && project_type != "resourcepack" {
        return Err(ModrinthError::InvalidProjectType(project_type.to_string()));
    }

    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{project_type}")]];
    if let Some(ver) = mc_version.filter(|v| !v.trim().is_empty()) {
        facets.push(vec![format!("versions:{ver}")]);
    }
    if project_type == "mod" {
        if let Some(ld) = loader.filter(|l| !l.trim().is_empty() && *l != "vanilla") {
            facets.push(vec![format!("categories:{ld}")]);
        }
    }

    let facets_json = serde_json::to_string(&facets)?;
    let index = sort_by.unwrap_or("relevance");
    let lim = limit.unwrap_or(20).clamp(1, 50).to_string();

    let resp = http_client()?
        .get(format!("{MODRINTH_API_BASE}/search"))
        .query(&[
            ("query", query),
            ("facets", facets_json.as_str()),
            ("index", index),
            ("limit", lim.as_str()),
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
    if project_type == "mod" {
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
        project_type: project_type.to_string(),
        filename: file.filename.clone(),
        enabled: true,
        managed: true,
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

            if let Some(mut managed) = by_file.remove(&(ptype.to_string(), base_name.clone())) {
                managed.enabled = enabled;
                result.push(managed);
            } else {
                result.push(InstalledContentItem {
                    project_id: None,
                    version_id: None,
                    title: base_name.clone(),
                    version_number: "manual".to_string(),
                    project_type: ptype.to_string(),
                    filename: base_name,
                    enabled,
                    managed: false,
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
