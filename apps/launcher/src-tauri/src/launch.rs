use crate::auth::{AuthProvider, PlayerProfile};
use crate::client_manager::validate_client_before_launch;
use crate::config::{LauncherSettings, SUPPORTED_MC_TARGETS};
use crate::fabric::{
    ensure_fabric_api_installed, fetch_fabric_profile, list_fabric_loaders,
    load_installed_fabric_profile, maven_coord_to_rel_path,
};
use crate::instances::GameInstance;
use crate::java::{detect_java_installations, probe_java_path};
use crate::minecraft::{
    current_mojang_os_name, ensure_assets_downloaded, ensure_file_downloaded,
    fetch_or_load_version_details, library_allowed_for_current_os, required_java_major,
};
use crate::windows::LauncherPaths;
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
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
    #[error("no suitable Java runtime found; install Java {0}+ or set a custom Java path in Instance Settings")]
    NoJavaRuntime(u32),
    #[error("version validation failed: {0}")]
    Validation(String),
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

/// Resolves and validates the Java executable against the Minecraft release's actual
/// required Java major version (from official Mojang version metadata).
fn resolve_java_executable(
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    instance: &GameInstance,
    required_major: u32,
) -> Result<(String, u32), LaunchError> {
    if let Some(ref custom) = instance.java_path_override {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            let p = Path::new(trimmed);
            if !p.exists() {
                return Err(LaunchError::Validation(format!(
                    "Custom Java executable for '{}' does not exist: {trimmed}",
                    instance.name
                )));
            }
            if let Some(info) = probe_java_path(p, "instance-override") {
                if info.major_version < required_major {
                    return Err(LaunchError::Validation(format!(
                        "Minecraft {} requires Java {}+, but custom runtime is Java {} ({trimmed}).",
                        instance.mc_version, required_major, info.major_version
                    )));
                }
                return Ok((trimmed.to_string(), info.major_version));
            }
            return Ok((trimmed.to_string(), required_major));
        }
    }

    if !settings.java_path.trim().is_empty() {
        let p = Path::new(settings.java_path.trim());
        if p.exists() {
            if let Some(info) = probe_java_path(p, "global-setting") {
                if info.major_version >= required_major {
                    return Ok((settings.java_path.clone(), info.major_version));
                }
            }
        }
    }

    let detected = detect_java_installations(paths);
    if let Some(exact) = detected.iter().find(|j| j.major_version == required_major) {
        return Ok((exact.path.clone(), exact.major_version));
    }
    if let Some(compatible) = detected.iter().find(|j| j.major_version >= required_major) {
        return Ok((compatible.path.clone(), compatible.major_version));
    }
    Err(LaunchError::NoJavaRuntime(required_major))
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
            "[7xAir] Preparing instance '{}' (MC {}, loader: {}, dir: {})",
            instance.name, instance.mc_version, instance.loader, instance.instance_dir
        ));
    }

    // 1. Validate Minecraft version target & isolated instance directory
    if !SUPPORTED_MC_TARGETS.contains(&instance.mc_version.as_str()) {
        return Err(LaunchError::Validation(format!(
            "Unsupported Minecraft version '{}'. 7xAir supports 1.21.11 and 26.2.",
            instance.mc_version
        )));
    }
    let inst_root = PathBuf::from(&instance.instance_dir);
    if instance.instance_dir.trim().is_empty() {
        return Err(LaunchError::Validation(
            "Instance directory path is empty.".to_string(),
        ));
    }
    for sub in ["mods", "resourcepacks", "config", "logs", "natives"] {
        fs::create_dir_all(inst_root.join(sub))?;
    }

    // 2. Fetch official Minecraft version metadata & detect required Java major version
    let version_details = fetch_or_load_version_details(paths, &instance.mc_version).await?;
    let required_java = required_java_major(&version_details);
    let (java_bin, detected_java_major) =
        resolve_java_executable(paths, settings, instance, required_java)?;

    // 3. Independently sync Fabric API (only if loader == "fabric" && auto_install_fabric_api == true)
    if instance.loader == "fabric" && instance.auto_install_fabric_api {
        match ensure_fabric_api_installed(
            &instance.id,
            &inst_root,
            &instance.mc_version,
            &instance.loader,
            true,
            false,
        )
        .await
        {
            Ok(api_status) => {
                if let Ok(mut rt) = runtime_arc.lock() {
                    rt.push_log(format!(
                        "[7xAir] Fabric API ({}): {}",
                        api_status.status, api_status.message
                    ));
                }
            }
            Err(err) => {
                if let Ok(mut rt) = runtime_arc.lock() {
                    rt.push_log(format!(
                        "[7xAir] Fabric API check skipped/unavailable: {err}"
                    ));
                }
            }
        }
    }

    // 4. Validate & sync per-instance 7xAir Fabric client (strict MC + Fabric Loader + metadata + duplicate/corruption checks)
    let integrity = validate_client_before_launch(paths, instance, settings.auto_install_client)?;
    {
        let mut rt = runtime_arc.lock().expect("launch runtime lock");
        rt.push_log(format!(
            "[7xAir] Java {detected_java_major} (required {required_java}+): {java_bin} | 7xAir Client: {} (ver: {}, mods: {}, healthy: {}, sha256: {}) — {}",
            if integrity.effective_enabled { "ON" } else { "OFF" },
            integrity.installed_version.as_deref().unwrap_or("none"),
            integrity.mods_dir,
            integrity.healthy,
            integrity
                .installed_sha256
                .as_deref()
                .map(|s| &s[..12.min(s.len())])
                .unwrap_or("none"),
            integrity.status_message
        ));
    }

    // 5. Download & verify Minecraft libraries and native DLLs
    let natives_dir = inst_root.join("natives");
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
    if !client_jar.exists() || fs::metadata(&client_jar)?.len() == 0 {
        return Err(LaunchError::Validation(format!(
            "Minecraft {} client JAR is missing or empty at {}",
            instance.mc_version,
            client_jar.display()
        )));
    }
    let client_cp = client_jar.to_string_lossy().to_string();
    if seen_cp.insert(client_cp.clone()) {
        classpath_entries.push(client_cp);
    }

    // 6. Independently resolve & verify Fabric Loader profile (respecting auto_install_fabric_loader)
    let mut main_class = version_details.main_class.clone();
    if instance.loader == "fabric" {
        let loader_ver = match instance.fabric_loader_version.as_deref() {
            Some(v) if !v.trim().is_empty() => v.to_string(),
            _ if instance.auto_install_fabric_loader => {
                let options = list_fabric_loaders(paths, &instance.mc_version).await;
                options
                    .into_iter()
                    .find(|o| o.recommended)
                    .map(|o| o.version)
                    .ok_or_else(|| {
                        LaunchError::Validation(format!(
                            "No compatible Fabric Loader version found for Minecraft {}.",
                            instance.mc_version
                        ))
                    })?
            }
            _ => {
                return Err(LaunchError::Validation(format!(
                    "No Fabric Loader version is configured for '{}' and Auto-Install Fabric Loader is OFF.",
                    instance.name
                )));
            }
        };

        let fabric_profile = if instance.auto_install_fabric_loader {
            fetch_fabric_profile(paths, &instance.mc_version, &loader_ver).await?
        } else {
            load_installed_fabric_profile(paths, &instance.mc_version, &loader_ver).ok_or_else(
                || {
                    LaunchError::Validation(format!(
                        "Fabric Loader {loader_ver} profile for Minecraft {} is not installed locally and Auto-Install Fabric Loader is OFF.",
                        instance.mc_version
                    ))
                },
            )?
        };

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

    if classpath_entries.is_empty() {
        return Err(LaunchError::Validation(
            "Required Minecraft libraries failed validation (classpath is empty).".to_string(),
        ));
    }

    // 7. Ensure asset index JSON & asset objects exist
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

    // 8. Build JVM and Minecraft arguments isolated strictly to this instance's gameDir
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
    let match_xms = extra_jvm_args.contains("-XX:+AlwaysPreTouch") || extra_jvm_args.contains("-XX:+UseZGC");
    let xms_mb = if match_xms { ram_mb } else { (ram_mb / 2).max(512) };
    cmd.arg(format!("-Xmx{ram_mb}M"));
    cmd.arg(format!("-Xms{xms_mb}M"));
    // Request dedicated GPU on dual-GPU laptops where supported
    cmd.env("__NV_PRIME_RENDER_OFFLOAD", "1");
    cmd.env("SHIM_MCCOMPAT", "0x800000001");
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
    let log_file_path = inst_root.join("logs").join("7xair-launch.log");
    let _ = fs::create_dir_all(log_file_path.parent().unwrap_or(Path::new(".")));

    if let Some(stdout) = child.stdout.take() {
        let rt_clone = Arc::clone(&runtime_arc);
        let log_path = log_file_path.clone();
        thread::spawn(move || {
            let mut file = OpenOptions::new().create(true).append(true).open(log_path).ok().map(BufWriter::new);
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
            let mut file = OpenOptions::new().create(true).append(true).open(log_path).ok().map(BufWriter::new);
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
        "[7xAir] Spawned Minecraft {} process (PID {pid}) as '{}' ({user_type})",
        instance.mc_version, profile.username
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
