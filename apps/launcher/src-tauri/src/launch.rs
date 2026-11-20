use crate::auth::{AuthProvider, PlayerProfile};
use crate::client_manager::sync_managed_client;
use crate::config::LauncherSettings;
use crate::fabric::{fetch_fabric_profile, maven_coord_to_rel_path};
use crate::instances::GameInstance;
use crate::java::detect_java_installations;
use crate::minecraft::{
    current_mojang_os_name, ensure_assets_downloaded, ensure_file_downloaded,
    fetch_or_load_version_details, library_allowed_for_current_os,
};
use crate::windows::LauncherPaths;
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use thiserror::Error;

const MAX_LOG_LINES: usize = 400;

#[derive(Debug, Error)]
pub enum LaunchError {
    #[error("no active player profile selected")]
    NoProfile,
    #[error("no suitable Java runtime found; install Java 21+ or set a custom Java path in Settings")]
    NoJavaRuntime,
    #[error("metadata error: {0}")]
    Metadata(#[from] crate::minecraft::MetadataError),
    #[error("Fabric error: {0}")]
    Fabric(#[from] crate::fabric::FabricError),
    #[error("7xAir client manager error: {0}")]
    ClientManager(#[from] crate::client_manager::ClientManagerError),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("an instance is already running (PID {0})")]
    AlreadyRunning(u32),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchStatus {
    pub running: bool,
    pub instance_id: Option<String>,
    pub instance_name: Option<String>,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
    pub java_path: Option<String>,
    pub main_class: Option<String>,
    pub logs: Vec<String>,
}

pub struct LaunchRuntime {
    pub child: Option<Child>,
    pub instance_id: Option<String>,
    pub instance_name: Option<String>,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
    pub java_path: Option<String>,
    pub main_class: Option<String>,
    pub logs: VecDeque<String>,
}

impl Default for LaunchRuntime {
    fn default() -> Self {
        Self {
            child: None,
            instance_id: None,
            instance_name: None,
            pid: None,
            exit_code: None,
            java_path: None,
            main_class: None,
            logs: VecDeque::with_capacity(MAX_LOG_LINES),
        }
    }
}

impl LaunchRuntime {
    pub fn push_log(&mut self, line: String) {
        if self.logs.len() >= MAX_LOG_LINES {
            self.logs.pop_front();
        }
        self.logs.push_back(line);
    }

    pub fn refresh_child_state(&mut self) {
        if let Some(child) = self.child.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                self.exit_code = status.code();
                self.child = None;
                self.push_log(format!(
                    "[7xAir] Game process exited with code {:?}",
                    self.exit_code
                ));
            }
        }
    }

    pub fn snapshot(&mut self) -> LaunchStatus {
        self.refresh_child_state();
        LaunchStatus {
            running: self.child.is_some(),
            instance_id: self.instance_id.clone(),
            instance_name: self.instance_name.clone(),
            pid: self.pid,
            exit_code: self.exit_code,
            java_path: self.java_path.clone(),
            main_class: self.main_class.clone(),
            logs: self.logs.iter().cloned().collect(),
        }
    }
}

fn classpath_separator() -> &'static str {
    if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    }
}

fn extract_native_libraries(jar_path: &Path, natives_dir: &Path) -> usize {
    let Ok(file) = File::open(jar_path) else {
        return 0;
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return 0;
    };
    let mut extracted = 0usize;
    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else {
            continue;
        };
        let name = entry.name().to_string();
        if entry.is_dir() || name.starts_with("META-INF/") {
            continue;
        }
        if name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib") {
            let Some(file_name) = Path::new(&name).file_name() else {
                continue;
            };
            let dest = natives_dir.join(file_name);
            if let Ok(mut out) = File::create(&dest) {
                if std::io::copy(&mut entry, &mut out).is_ok() {
                    extracted += 1;
                }
            }
        }
    }
    extracted
}

fn resolve_java_executable(
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    instance: &GameInstance,
) -> Result<String, LaunchError> {
    if let Some(ref custom) = instance.java_path_override {
        if !custom.trim().is_empty() && Path::new(custom).exists() {
            return Ok(custom.clone());
        }
    }
    if !settings.java_path.trim().is_empty() && Path::new(&settings.java_path).exists() {
        return Ok(settings.java_path.clone());
    }
    let detected = detect_java_installations(paths);
    detected
        .first()
        .map(|j| j.path.clone())
        .ok_or(LaunchError::NoJavaRuntime)
}

pub async fn launch_game_instance(
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    instance: &GameInstance,
    profile: &PlayerProfile,
    runtime_arc: Arc<Mutex<LaunchRuntime>>,
) -> Result<LaunchStatus, LaunchError> {
    {
        let mut rt = runtime_arc.lock().expect("launch runtime lock");
        rt.refresh_child_state();
        if let Some(pid) = rt.child.as_ref().map(Child::id) {
            return Err(LaunchError::AlreadyRunning(pid));
        }
        rt.logs.clear();
        rt.exit_code = None;
        rt.instance_id = Some(instance.id.clone());
        rt.instance_name = Some(instance.name.clone());
        rt.push_log(format!(
            "[7xAir] Preparing instance '{}' (MC {}, loader: {})",
            instance.name, instance.mc_version, instance.loader
        ));
    }

    // 1. Resolve Java runtime
    let java_bin = resolve_java_executable(paths, settings, instance)?;

    // 2. Automatically sync & verify 7xAir Fabric client according to global setting + per-instance override
    let integrity = sync_managed_client(paths, instance, settings.auto_install_client)?;
    {
        let mut rt = runtime_arc.lock().expect("launch runtime lock");
        rt.push_log(format!(
            "[7xAir] Java: {java_bin} | 7xAir Client: {} (override: {:?}, healthy: {}, sha256: {})",
            if integrity.effective_enabled { "ON" } else { "OFF" },
            integrity.override_mode,
            integrity.healthy,
            integrity
                .installed_sha256
                .as_deref()
                .map(|s| &s[..12.min(s.len())])
                .unwrap_or("none")
        ));
    }

    // 3. Fetch Minecraft version metadata, libraries, and native DLLs
    let natives_dir = PathBuf::from(&instance.instance_dir).join("natives");
    fs::create_dir_all(&natives_dir)?;

    let version_details = fetch_or_load_version_details(paths, &instance.mc_version).await?;
    let mut classpath_entries: Vec<String> = Vec::new();
    let mut seen_cp: HashSet<String> = HashSet::new();
    let mut extracted_natives = 0usize;
    let os_name = current_mojang_os_name();

    for lib in &version_details.libraries {
        if !library_allowed_for_current_os(lib) {
            continue;
        }
        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                if let Some(rel) = &artifact.path {
                    let dest = paths.libraries_path().join(rel);
                    ensure_file_downloaded(&artifact.url, &dest).await?;
                    if rel.contains("natives-") {
                        extracted_natives += extract_native_libraries(&dest, &natives_dir);
                    }
                    let cp = dest.to_string_lossy().to_string();
                    if seen_cp.insert(cp.clone()) {
                        classpath_entries.push(cp);
                    }
                }
            }
            if let Some(native_key) = lib.natives.get(os_name) {
                let resolved_key = native_key.replace("${arch}", "64");
                if let Some(native_art) = downloads.classifiers.get(&resolved_key) {
                    if let Some(rel) = &native_art.path {
                        let dest = paths.libraries_path().join(rel);
                        ensure_file_downloaded(&native_art.url, &dest).await?;
                        extracted_natives += extract_native_libraries(&dest, &natives_dir);
                    }
                }
            }
        }
    }

    let client_jar = paths
        .versions_path()
        .join(&instance.mc_version)
        .join(format!("{}.jar", instance.mc_version));
    if let Some(client_dl) = version_details
        .downloads
        .as_ref()
        .and_then(|d| d.client.as_ref())
    {
        ensure_file_downloaded(&client_dl.url, &client_jar).await?;
    }
    let client_cp = client_jar.to_string_lossy().to_string();
    if seen_cp.insert(client_cp.clone()) {
        classpath_entries.push(client_cp);
    }

    // 4. Resolve Fabric loader profile & libraries if loader == "fabric"
    let mut main_class = version_details.main_class.clone();
    if instance.loader == "fabric" {
        if let Some(loader_ver) = instance.fabric_loader_version.as_deref() {
            let fabric_profile =
                fetch_fabric_profile(paths, &instance.mc_version, loader_ver).await?;
            main_class = fabric_profile.main_class;
            for flib in fabric_profile.libraries {
                if let Some(rel) = maven_coord_to_rel_path(&flib.name) {
                    let base_url = flib
                        .url
                        .unwrap_or_else(|| "https://maven.fabricmc.net/".to_string());
                    let full_url =
                        format!("{}{}", base_url.trim_end_matches('/'), format!("/{rel}"));
                    let dest = paths.libraries_path().join(&rel);
                    ensure_file_downloaded(&full_url, &dest).await?;
                    let cp = dest.to_string_lossy().to_string();
                    if seen_cp.insert(cp.clone()) {
                        classpath_entries.push(cp);
                    }
                }
            }
        }
    }

    // 5. Ensure asset index JSON & asset objects exist
    let asset_index_id = version_details
        .asset_index
        .as_ref()
        .map(|a| a.id.clone())
        .unwrap_or_else(|| instance.mc_version.clone());
    if let Some(asset_idx) = &version_details.asset_index {
        let idx_dest = paths
            .assets_path()
            .join("indexes")
            .join(format!("{}.json", asset_idx.id));
        ensure_file_downloaded(&asset_idx.url, &idx_dest).await?;
        let fetched_assets = ensure_assets_downloaded(paths, &idx_dest).await.unwrap_or(0);
        if let Ok(mut rt) = runtime_arc.lock() {
            rt.push_log(format!(
                "[7xAir] Natives extracted: {extracted_natives} | Assets synced: {fetched_assets}"
            ));
        }
    }

    // 6. Build JVM and Minecraft arguments
    let ram_mb = instance.ram_mb_override.unwrap_or(settings.allocated_ram_mb);
    let extra_jvm_args = instance
        .jvm_args_override
        .as_deref()
        .unwrap_or(&settings.jvm_args);

    let mut cmd = Command::new(&java_bin);
    cmd.current_dir(&instance.instance_dir);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.arg(format!("-Xmx{ram_mb}M"));
    cmd.arg(format!("-Xms{}M", (ram_mb / 2).max(512)));
    cmd.arg(format!("-Djava.library.path={}", natives_dir.display()));
    cmd.arg(format!("-Dorg.lwjgl.librarypath={}", natives_dir.display()));
    cmd.arg("-Dminecraft.launcher.brand=7xAir");
    cmd.arg("-Dminecraft.launcher.version=0.1.0");
    for flag in extra_jvm_args.split_whitespace() {
        cmd.arg(flag);
    }
    cmd.arg("-cp");
    cmd.arg(classpath_entries.join(classpath_separator()));
    cmd.arg(&main_class);

    let user_type = match profile.provider {
        AuthProvider::Microsoft => "msa",
        AuthProvider::Offline => "legacy",
    };
    cmd.args([
        "--username",
        &profile.username,
        "--version",
        &instance.mc_version,
        "--gameDir",
        &instance.instance_dir,
        "--assetsDir",
        &paths.assets_dir,
        "--assetIndex",
        &asset_index_id,
        "--uuid",
        &profile.uuid,
        "--accessToken",
        &profile.access_token,
        "--userType",
        user_type,
        "--versionType",
        "7xAir",
    ]);

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn()?;
    let pid = child.id();
    let log_file_path = PathBuf::from(&instance.instance_dir)
        .join("logs")
        .join("7xair-launch.log");
    let _ = fs::create_dir_all(log_file_path.parent().unwrap_or(Path::new(".")));

    if let Some(stdout) = child.stdout.take() {
        let rt_clone = Arc::clone(&runtime_arc);
        let log_path = log_file_path.clone();
        thread::spawn(move || {
            let mut file = OpenOptions::new().create(true).append(true).open(log_path).ok();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(f) = file.as_mut() {
                    let _ = writeln!(f, "[OUT] {line}");
                }
                if let Ok(mut rt) = rt_clone.lock() {
                    rt.push_log(line);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let rt_clone = Arc::clone(&runtime_arc);
        let log_path = log_file_path;
        thread::spawn(move || {
            let mut file = OpenOptions::new().create(true).append(true).open(log_path).ok();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(f) = file.as_mut() {
                    let _ = writeln!(f, "[ERR] {line}");
                }
                if let Ok(mut rt) = rt_clone.lock() {
                    rt.push_log(format!("[stderr] {line}"));
                }
            }
        });
    }

    let mut rt = runtime_arc.lock().expect("launch runtime lock");
    rt.pid = Some(pid);
    rt.java_path = Some(java_bin);
    rt.main_class = Some(main_class);
    rt.child = Some(child);
    rt.push_log(format!(
        "[7xAir] Spawned Minecraft process (PID {pid}) as '{}' ({user_type})",
        profile.username
    ));
    Ok(rt.snapshot())
}

pub fn stop_running_instance(runtime_arc: &Arc<Mutex<LaunchRuntime>>) -> LaunchStatus {
    let mut rt = runtime_arc.lock().expect("launch runtime lock");
    if let Some(mut child) = rt.child.take() {
        let _ = child.kill();
        let _ = child.wait();
        rt.push_log("[7xAir] Instance stopped by user.".to_string());
    }
    rt.snapshot()
}
