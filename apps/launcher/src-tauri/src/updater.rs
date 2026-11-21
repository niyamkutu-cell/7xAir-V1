use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const DEFAULT_GITHUB_REPO: &str = "niyamkutu-cell/7xAir-V1";
pub const DEFAULT_UPDATE_MANIFEST_URL: &str = "https://7xair.vercel.app/releases/latest.json";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Error)]
pub enum UpdaterError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid semantic version '{0}'")]
    InvalidSemVer(String),
    #[error("missing SHA-256 checksum for release asset (refusing unverified update)")]
    MissingChecksum,
    #[error("SHA-256 verification failed: expected {expected}, got {actual}")]
    Sha256Mismatch { expected: String, actual: String },
    #[error("staged installer header invalid (expected Windows PE 'MZ' or ZIP 'PK')")]
    InvalidBinaryHeader,
    #[error("no verified staged update available to install")]
    NoStagedUpdate,
    #[error("cannot install update while Minecraft is running (PID {0})")]
    GameRunning(u32),
    #[error("no rollback snapshot available")]
    NoRollbackSnapshot,
    #[error("an update download is already in progress")]
    DownloadInProgress,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SemVer {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl SemVer {
    pub fn parse(raw: &str) -> Result<Self, UpdaterError> {
        let cleaned = raw.trim().trim_start_matches('v');
        let core = cleaned.split('-').next().unwrap_or(cleaned);
        let parts: Vec<&str> = core.split('.').collect();
        if parts.len() != 3 {
            return Err(UpdaterError::InvalidSemVer(raw.to_string()));
        }
        let major = parts[0]
            .parse::<u32>()
            .map_err(|_| UpdaterError::InvalidSemVer(raw.to_string()))?;
        let minor = parts[1]
            .parse::<u32>()
            .map_err(|_| UpdaterError::InvalidSemVer(raw.to_string()))?;
        let patch = parts[2]
            .parse::<u32>()
            .map_err(|_| UpdaterError::InvalidSemVer(raw.to_string()))?;
        Ok(Self {
            major,
            minor,
            patch,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    prerelease: bool,
    draft: bool,
    published_at: Option<String>,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseChannelManifest {
    pub version: String,
    pub channel: String,
    pub published_at: String,
    pub release_notes: String,
    pub windows_installer_url: String,
    pub windows_installer_sha256: String,
    pub windows_installer_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifestRoot {
    pub stable: ReleaseChannelManifest,
    pub beta: Option<ReleaseChannelManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub channel: String,
    pub update_available: bool,
    pub published_at: String,
    pub release_notes: String,
    pub asset_url: String,
    pub asset_sha256: String,
    pub asset_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedUpdateRecord {
    pub version: String,
    pub channel: String,
    pub staged_file: String,
    pub expected_sha256: String,
    pub verified_sha256: String,
    pub staged_at_epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackSnapshot {
    pub previous_version: String,
    pub target_version: String,
    pub snapshot_dir: String,
    pub created_at_epoch: u64,
    pub backed_up_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterStatus {
    pub phase: String, // "idle" | "checking" | "downloading" | "verifying" | "staged" | "installing" | "installed" | "rolled_back" | "error"
    pub current_version: String,
    pub available_update: Option<UpdateCheckResult>,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub progress_percent: f32,
    pub staged_update: Option<StagedUpdateRecord>,
    pub rollback_available: bool,
    pub last_message: Option<String>,
    pub last_error: Option<String>,
}

pub struct UpdaterRuntime {
    pub phase: String,
    pub available_update: Option<UpdateCheckResult>,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub staged_update: Option<StagedUpdateRecord>,
    pub last_message: Option<String>,
    pub last_error: Option<String>,
}

impl Default for UpdaterRuntime {
    fn default() -> Self {
        Self {
            phase: "idle".to_string(),
            available_update: None,
            bytes_downloaded: 0,
            total_bytes: 0,
            staged_update: None,
            last_message: None,
            last_error: None,
        }
    }
}

impl UpdaterRuntime {
    pub fn snapshot(&self, paths: &LauncherPaths) -> UpdaterStatus {
        let progress_percent = if self.total_bytes > 0 {
            ((self.bytes_downloaded as f64 / self.total_bytes as f64) * 100.0).min(100.0) as f32
        } else if self.phase == "staged" || self.phase == "installed" {
            100.0
        } else {
            0.0
        };

        UpdaterStatus {
            phase: self.phase.clone(),
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            available_update: self.available_update.clone(),
            bytes_downloaded: self.bytes_downloaded,
            total_bytes: self.total_bytes,
            progress_percent: (progress_percent * 10.0).round() / 10.0,
            staged_update: self
                .staged_update
                .clone()
                .or_else(|| load_staged_record(paths)),
            rollback_available: rollback_manifest_path(paths).exists(),
            last_message: self.last_message.clone(),
            last_error: self.last_error.clone(),
        }
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn updates_root(paths: &LauncherPaths) -> PathBuf {
    PathBuf::from(&paths.root_dir).join("updates")
}

fn staging_dir(paths: &LauncherPaths, version: &str) -> PathBuf {
    updates_root(paths).join("staging").join(version)
}

fn staged_record_path(paths: &LauncherPaths) -> PathBuf {
    updates_root(paths).join("staged.json")
}

fn rollback_root(paths: &LauncherPaths) -> PathBuf {
    updates_root(paths).join("rollback")
}

fn rollback_manifest_path(paths: &LauncherPaths) -> PathBuf {
    rollback_root(paths).join("rollback-manifest.json")
}

fn load_staged_record(paths: &LauncherPaths) -> Option<StagedUpdateRecord> {
    let path = staged_record_path(paths);
    if !path.exists() {
        return None;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<StagedUpdateRecord>(&raw).ok())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn has_valid_installer_header(bytes: &[u8]) -> bool {
    // Windows PE executable ('MZ') or ZIP archive ('PK\x03\x04')
    (bytes.len() >= 2 && bytes[0] == 0x4D && bytes[1] == 0x5A)
        || (bytes.len() >= 4
            && bytes[0] == 0x50
            && bytes[1] == 0x4B
            && bytes[2] == 0x03
            && bytes[3] == 0x04)
}

fn parse_sha256_for_asset(sums_text: &str, asset_name: &str) -> Option<String> {
    for line in sums_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        if let Some(hash) = parts.next() {
            if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                let target = parts.next().unwrap_or("");
                if target.is_empty()
                    || target.trim_start_matches('*').eq_ignore_ascii_case(asset_name)
                {
                    return Some(hash.to_lowercase());
                }
            }
        }
    }
    None
}

async fn fetch_from_github_releases(
    http: &reqwest::Client,
    repo: &str,
    channel: &str,
) -> Result<Option<ReleaseChannelManifest>, UpdaterError> {
    let url = format!("https://api.github.com/repos/{repo}/releases?per_page=10");
    let resp = http
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?;
    let releases: Vec<GitHubRelease> = resp.json().await?;

    let chosen = releases.into_iter().find(|r| {
        if r.draft {
            return false;
        }
        if channel == "beta" {
            true
        } else {
            !r.prerelease
        }
    });

    let Some(rel) = chosen else {
        return Ok(None);
    };

    let Some(exe_asset) = rel
        .assets
        .iter()
        .find(|a| a.name.to_ascii_lowercase().ends_with(".exe"))
    else {
        return Ok(None);
    };

    let mut sha256 = String::new();
    if let Some(sum_asset) = rel.assets.iter().find(|a| {
        let lower = a.name.to_ascii_lowercase();
        lower.contains("sha256") || lower.ends_with(".sha256")
    }) {
        if let Ok(sum_resp) = http.get(&sum_asset.browser_download_url).send().await {
            if let Ok(text) = sum_resp.text().await {
                if let Some(parsed) = parse_sha256_for_asset(&text, &exe_asset.name) {
                    sha256 = parsed;
                }
            }
        }
    }

    Ok(Some(ReleaseChannelManifest {
        version: rel.tag_name.trim_start_matches('v').to_string(),
        channel: if rel.prerelease {
            "beta".to_string()
        } else {
            "stable".to_string()
        },
        published_at: rel.published_at.unwrap_or_default(),
        release_notes: rel.body.unwrap_or_default(),
        windows_installer_url: exe_asset.browser_download_url.clone(),
        windows_installer_sha256: sha256,
        windows_installer_size: exe_asset.size,
    }))
}

pub async fn check_for_launcher_update(
    paths: &LauncherPaths,
    channel: &str,
    runtime_arc: Arc<Mutex<UpdaterRuntime>>,
) -> Result<UpdaterStatus, UpdaterError> {
    {
        let mut rt = runtime_arc.lock().expect("updater lock");
        rt.phase = "checking".to_string();
        rt.last_error = None;
    }

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;

    let custom_manifest_url = std::env::var("SEVENXAIR_UPDATE_MANIFEST_URL")
        .ok()
        .filter(|v| !v.trim().is_empty());

    let selected: ReleaseChannelManifest = if let Some(manifest_url) = custom_manifest_url {
        let root: UpdateManifestRoot = match http.get(&manifest_url).send().await {
            Ok(resp) => resp.error_for_status()?.json().await?,
            Err(err) => {
                let mut rt = runtime_arc.lock().expect("updater lock");
                rt.phase = "error".to_string();
                rt.last_error = Some(err.to_string());
                return Err(UpdaterError::Http(err));
            }
        };
        if channel == "beta" {
            root.beta.unwrap_or(root.stable)
        } else {
            root.stable
        }
    } else {
        let repo = std::env::var("SEVENXAIR_GITHUB_REPO")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_GITHUB_REPO.to_string());

        match fetch_from_github_releases(&http, &repo, channel).await {
            Ok(Some(gh_manifest)) => gh_manifest,
            _ => {
                let root: UpdateManifestRoot = match http.get(DEFAULT_UPDATE_MANIFEST_URL).send().await {
                    Ok(resp) => resp.error_for_status()?.json().await?,
                    Err(err) => {
                        let mut rt = runtime_arc.lock().expect("updater lock");
                        rt.phase = "error".to_string();
                        rt.last_error = Some(err.to_string());
                        return Err(UpdaterError::Http(err));
                    }
                };
                if channel == "beta" {
                    root.beta.unwrap_or(root.stable)
                } else {
                    root.stable
                }
            }
        }
    };

    let current_ver = SemVer::parse(env!("CARGO_PKG_VERSION"))?;
    let remote_ver = SemVer::parse(&selected.version)?;
    let update_available = remote_ver > current_ver;

    let result = UpdateCheckResult {
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        latest_version: selected.version.clone(),
        channel: selected.channel,
        update_available,
        published_at: selected.published_at,
        release_notes: selected.release_notes,
        asset_url: selected.windows_installer_url,
        asset_sha256: selected.windows_installer_sha256,
        asset_size_bytes: selected.windows_installer_size,
    };

    let mut rt = runtime_arc.lock().expect("updater lock");
    rt.available_update = Some(result);
    rt.phase = "idle".to_string();
    rt.last_message = Some(if update_available {
        format!("Update v{} is available for background download.", selected.version)
    } else {
        format!("7xAir v{} is up to date.", env!("CARGO_PKG_VERSION"))
    });
    Ok(rt.snapshot(paths))
}

/// Downloads the available update in the background, verifies SHA-256 + binary header, and stages it atomically.
pub fn start_background_download(
    paths: LauncherPaths,
    runtime_arc: Arc<Mutex<UpdaterRuntime>>,
) -> Result<UpdaterStatus, UpdaterError> {
    let target = {
        let mut rt = runtime_arc.lock().expect("updater lock");
        if rt.phase == "downloading" || rt.phase == "verifying" {
            return Err(UpdaterError::DownloadInProgress);
        }
        let Some(upd) = rt.available_update.clone().filter(|u| u.update_available) else {
            return Err(UpdaterError::NoStagedUpdate);
        };
        if upd.asset_sha256.trim().len() != 64 {
            return Err(UpdaterError::MissingChecksum);
        }
        rt.phase = "downloading".to_string();
        rt.bytes_downloaded = 0;
        rt.total_bytes = upd.asset_size_bytes;
        rt.last_error = None;
        rt.last_message = Some(format!("Downloading 7xAir v{} in background...", upd.latest_version));
        upd
    };

    let rt_bg = Arc::clone(&runtime_arc);
    let paths_bg = paths.clone();

    tauri::async_runtime::spawn(async move {
        let outcome: Result<StagedUpdateRecord, UpdaterError> = async {
            let stage_folder = staging_dir(&paths_bg, &target.latest_version);
            fs::create_dir_all(&stage_folder)?;
            let filename = format!("7xAir-Setup-{}.exe", target.latest_version);
            let part_path = stage_folder.join(format!("{filename}.part"));
            let final_path = stage_folder.join(&filename);

            let http = reqwest::Client::builder()
                .user_agent("7xAir-Launcher/0.1.0")
                .build()?;
            let mut resp = http.get(&target.asset_url).send().await?.error_for_status()?;
            if let Some(len) = resp.content_length() {
                if let Ok(mut rt) = rt_bg.lock() {
                    rt.total_bytes = len;
                }
            }

            let mut all_bytes: Vec<u8> = Vec::new();
            while let Some(chunk) = resp.chunk().await? {
                all_bytes.extend_from_slice(&chunk);
                if let Ok(mut rt) = rt_bg.lock() {
                    rt.bytes_downloaded = all_bytes.len() as u64;
                }
            }

            if let Ok(mut rt) = rt_bg.lock() {
                rt.phase = "verifying".to_string();
                rt.last_message = Some("Verifying SHA-256 signature and binary header...".to_string());
            }

            let computed_sha = sha256_bytes(&all_bytes);
            if !computed_sha.eq_ignore_ascii_case(&target.asset_sha256) {
                let _ = fs::remove_file(&part_path);
                return Err(UpdaterError::Sha256Mismatch {
                    expected: target.asset_sha256.clone(),
                    actual: computed_sha,
                });
            }

            if !has_valid_installer_header(&all_bytes) {
                let _ = fs::remove_file(&part_path);
                return Err(UpdaterError::InvalidBinaryHeader);
            }

            fs::write(&part_path, &all_bytes)?;
            fs::rename(&part_path, &final_path)?;

            let record = StagedUpdateRecord {
                version: target.latest_version.clone(),
                channel: target.channel.clone(),
                staged_file: final_path.to_string_lossy().to_string(),
                expected_sha256: target.asset_sha256.clone(),
                verified_sha256: computed_sha,
                staged_at_epoch: now_epoch(),
            };

            let rec_path = staged_record_path(&paths_bg);
            let rec_tmp = rec_path.with_extension("json.tmp");
            fs::write(&rec_tmp, serde_json::to_string_pretty(&record)?)?;
            fs::rename(&rec_tmp, &rec_path)?;
            Ok(record)
        }
        .await;

        if let Ok(mut rt) = rt_bg.lock() {
            match outcome {
                Ok(record) => {
                    rt.phase = "staged".to_string();
                    rt.staged_update = Some(record.clone());
                    rt.last_message = Some(format!(
                        "Verified & staged 7xAir v{} (SHA-256 OK). Ready for safe install.",
                        record.version
                    ));
                }
                Err(err) => {
                    rt.phase = "error".to_string();
                    rt.last_error = Some(err.to_string());
                }
            }
        }
    });

    let rt = runtime_arc.lock().expect("updater lock");
    Ok(rt.snapshot(&paths))
}

fn create_rollback_snapshot(
    paths: &LauncherPaths,
    target_version: &str,
) -> Result<RollbackSnapshot, UpdaterError> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let snap_dir = rollback_root(paths).join(format!("v{current}-{}", now_epoch()));
    fs::create_dir_all(&snap_dir)?;

    let mut backed_up = Vec::new();
    for file_str in [&paths.settings_file, &paths.profiles_file, &paths.instances_file] {
        let src = Path::new(file_str);
        if src.exists() {
            if let Some(name) = src.file_name() {
                fs::copy(src, snap_dir.join(name))?;
                backed_up.push(name.to_string_lossy().to_string());
            }
        }
    }

    let snapshot = RollbackSnapshot {
        previous_version: current,
        target_version: target_version.to_string(),
        snapshot_dir: snap_dir.to_string_lossy().to_string(),
        created_at_epoch: now_epoch(),
        backed_up_files: backed_up,
    };

    let manifest_path = rollback_manifest_path(paths);
    let tmp = manifest_path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&snapshot)?)?;
    fs::rename(&tmp, &manifest_path)?;
    Ok(snapshot)
}

/// Safely installs a verified staged update after creating a rollback snapshot and confirming no game is running.
/// On Windows, writes a helper script to run the NSIS installer cleanly and restart 7xAir afterward.
pub fn install_staged_update(
    paths: &LauncherPaths,
    running_game_pid: Option<u32>,
    runtime_arc: Arc<Mutex<UpdaterRuntime>>,
) -> Result<UpdaterStatus, UpdaterError> {
    if let Some(pid) = running_game_pid {
        return Err(UpdaterError::GameRunning(pid));
    }

    let staged = load_staged_record(paths).ok_or(UpdaterError::NoStagedUpdate)?;
    let staged_path = PathBuf::from(&staged.staged_file);
    if !staged_path.exists() {
        return Err(UpdaterError::NoStagedUpdate);
    }

    // Re-verify SHA-256 and binary header immediately prior to installation
    let bytes = fs::read(&staged_path)?;
    let actual_sha = sha256_bytes(&bytes);
    if !actual_sha.eq_ignore_ascii_case(&staged.expected_sha256) {
        return Err(UpdaterError::Sha256Mismatch {
            expected: staged.expected_sha256,
            actual: actual_sha,
        });
    }
    if !has_valid_installer_header(&bytes) {
        return Err(UpdaterError::InvalidBinaryHeader);
    }

    let snapshot = create_rollback_snapshot(paths, &staged.version)?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let current_exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("7xAir.exe"));
        let helper_script = staged_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("apply-update-and-restart.cmd");
        let pid = std::process::id();
        let script_body = format!(
            "@echo off\r\n\
            :wait_loop\r\n\
            tasklist /FI \"PID eq {pid}\" 2>NUL | find /I \"{pid}\" >NUL\r\n\
            if \"%ERRORLEVEL%\"==\"0\" (\r\n\
              timeout /T 1 /NOBREAK >NUL\r\n\
              goto wait_loop\r\n\
            )\r\n\
            \"{}\" /S\r\n\
            if errorlevel 1 exit /b %errorlevel%\r\n\
            start \"\" \"{}\"\r\n",
            staged_path.display(),
            current_exe.display()
        );
        fs::write(&helper_script, script_body)?;
        Command::new("cmd.exe")
            .args(["/C", helper_script.to_string_lossy().as_ref()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()?;
    }

    let mut rt = runtime_arc.lock().expect("updater lock");
    rt.phase = "installing".to_string();
    rt.last_error = None;
    rt.last_message = Some(format!(
        "Rollback snapshot saved ({} files). Verified installer started for v{}; close or restart 7xAir to complete update.",
        snapshot.backed_up_files.len(),
        staged.version
    ));
    Ok(rt.snapshot(paths))
}

/// Restores launcher configuration and state from the latest rollback snapshot and clears staged payloads.
pub fn rollback_last_update(
    paths: &LauncherPaths,
    runtime_arc: Arc<Mutex<UpdaterRuntime>>,
) -> Result<UpdaterStatus, UpdaterError> {
    let manifest_path = rollback_manifest_path(paths);
    if !manifest_path.exists() {
        return Err(UpdaterError::NoRollbackSnapshot);
    }

    let raw = fs::read_to_string(&manifest_path)?;
    let snapshot: RollbackSnapshot = serde_json::from_str(&raw)?;
    let snap_dir = PathBuf::from(&snapshot.snapshot_dir);
    let root = PathBuf::from(&paths.root_dir);

    for filename in &snapshot.backed_up_files {
        let src = snap_dir.join(filename);
        let dst = root.join(filename);
        if src.exists() {
            let tmp = dst.with_extension("json.tmp");
            fs::copy(&src, &tmp)?;
            fs::rename(&tmp, &dst)?;
        }
    }

    // Clear staged record so a broken update is not retried automatically
    let staged_rec = staged_record_path(paths);
    if staged_rec.exists() {
        let _ = fs::remove_file(&staged_rec);
    }

    let mut rt = runtime_arc.lock().expect("updater lock");
    rt.phase = "rolled_back".to_string();
    rt.staged_update = None;
    rt.last_error = None;
    rt.last_message = Some(format!(
        "Rolled back configuration to v{} ({} files restored).",
        snapshot.previous_version,
        snapshot.backed_up_files.len()
    ));
    Ok(rt.snapshot(paths))
}
