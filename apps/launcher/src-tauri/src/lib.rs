mod auth;
mod client_manager;
mod config;
mod fabric;
mod instances;
mod java;
mod launch;
mod minecraft;
mod modrinth;
mod performance;
mod updater;
mod windows;

use auth::{
    add_offline_profile, begin_microsoft_device_login, load_or_init_profiles,
    poll_microsoft_device_login, remove_profile, save_profiles_atomic, select_active_profile,
    MicrosoftDeviceCodeSession, PlayerProfile, ProfileStore,
};
use client_manager::{
    check_client_integrity, remove_managed_client, repair_managed_client,
    sync_all_instances_client, sync_managed_client, update_managed_client, ClientIntegrityReport,
};
use config::{
    load_or_init_settings, save_settings_atomic, LauncherSettings, SUPPORTED_MC_TARGETS,
    VALID_THEMES,
};
use fabric::{ensure_fabric_api_installed, fetch_fabric_profile, inspect_fabric_api_status, list_fabric_loaders, FabricApiStatus, FabricLoaderOption};
use instances::{
    clone_existing_instance, create_new_instance, delete_existing_instance,
    load_or_init_instances, register_modpack_instance, update_existing_instance,
    ClientOverrideMode, CreateInstanceRequest, GameInstance, InstanceStore, UpdateInstanceRequest,
};
use java::{detect_java_installations, JavaInstallation};
use launch::{launch_game_instance, stop_running_instance, LaunchRuntime, LaunchStatus};
use minecraft::{fetch_or_load_manifest, summarize_manifest, MinecraftMetadataSummary};
use modrinth::{
    check_for_updates, download_and_extract_modpack, fetch_project_versions,
    install_content_with_dependencies, list_installed_content, remove_content_item,
    run_compatibility_checks, search_projects, toggle_content_enabled, update_single_content,
    check_modpack_update_for_instance, inspect_modpack_status, rollback_modpack_in_instance,
    update_modpack_in_instance, CompatibilityReport, ContentUpdateInfo, InstallContentResult,
    InstallModpackRequest, InstallModpackResult, InstalledContentItem, ModpackInstallProgress,
    ModpackStatusReport, ModpackUpdateInfo, ModrinthSearchResponse, ModrinthVersion,
};
use performance::{
    analyze_instance_crash_logs, build_optimization_recommendations, collect_performance_telemetry,
    run_instance_diagnostics, CrashAnalysisReport, DiagnosticsReport, OptimizationRecommendations,
    PerformanceTelemetry,
};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use updater::{
    check_for_launcher_update, install_staged_update, rollback_last_update,
    start_background_download, UpdaterRuntime, UpdaterStatus,
};
use windows::{apply_windows_glass_backdrop, LauncherPaths};

pub struct AppState {
    pub paths: LauncherPaths,
    pub settings: Mutex<LauncherSettings>,
    pub profiles: Mutex<ProfileStore>,
    pub instances: Mutex<InstanceStore>,
    pub launch_runtime: Arc<Mutex<LaunchRuntime>>,
    pub updater_runtime: Arc<Mutex<UpdaterRuntime>>,
    pub modpack_progress: Arc<Mutex<ModpackInstallProgress>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
    pub arch: String,
    pub target_minecraft_versions: Vec<String>,
    pub paths: LauncherPaths,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub os: String,
    pub arch: String,
    pub cpu_threads: usize,
    pub data_root: String,
}

fn find_instance(state: &State<'_, AppState>, instance_id: &str) -> Result<GameInstance, String> {
    let guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    guard
        .instances
        .iter()
        .find(|i| i.id == instance_id)
        .cloned()
        .ok_or_else(|| format!("instance '{instance_id}' not found"))
}

fn current_global_auto_install(state: &State<'_, AppState>) -> Result<bool, String> {
    let guard = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    Ok(guard.auto_install_client)
}

#[tauri::command]
fn get_app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: "7xAir".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        target_minecraft_versions: SUPPORTED_MC_TARGETS
            .iter()
            .map(|v| (*v).to_string())
            .collect(),
        paths: state.paths.clone(),
    }
}

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> Result<LauncherSettings, String> {
    let guard = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn save_settings(
    next_settings: LauncherSettings,
    state: State<'_, AppState>,
) -> Result<LauncherSettings, String> {
    save_settings_atomic(&state.paths.settings_path(), &next_settings)
        .map_err(|err| err.to_string())?;
    let prev_auto = {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned".to_string())?;
        let old = guard.auto_install_client;
        *guard = next_settings.clone();
        old
    };

    if prev_auto != next_settings.auto_install_client {
        if let Ok(mut inst_guard) = state.instances.lock() {
            for inst in &mut inst_guard.instances {
                if inst.client_override == ClientOverrideMode::Inherit {
                    inst.auto_install_client =
                        inst.loader == "fabric" && next_settings.auto_install_client;
                }
            }
            let _ = sync_all_instances_client(
                &state.paths,
                &inst_guard.instances,
                next_settings.auto_install_client,
            );
            let _ = instances::save_instances_atomic(
                &state.paths.instances_file_path(),
                &inst_guard,
            );
        }
    }

    Ok(next_settings)
}

#[tauri::command]
fn list_themes() -> Vec<String> {
    VALID_THEMES.iter().map(|id| (*id).to_string()).collect()
}

#[tauri::command]
fn get_system_snapshot(state: State<'_, AppState>) -> SystemSnapshot {
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    SystemSnapshot {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_threads,
        data_root: state.paths.root_dir.clone(),
    }
}

#[tauri::command]
async fn get_minecraft_metadata(
    force_refresh: bool,
    state: State<'_, AppState>,
) -> Result<MinecraftMetadataSummary, String> {
    let (manifest, source) = fetch_or_load_manifest(&state.paths, force_refresh).await;
    Ok(summarize_manifest(&manifest, source))
}

#[tauri::command]
fn detect_java(state: State<'_, AppState>) -> Vec<JavaInstallation> {
    detect_java_installations(&state.paths)
}

#[tauri::command]
async fn get_fabric_loaders(
    mc_version: String,
    state: State<'_, AppState>,
) -> Result<Vec<FabricLoaderOption>, String> {
    Ok(list_fabric_loaders(&state.paths, &mc_version).await)
}

#[tauri::command]
fn list_profiles(state: State<'_, AppState>) -> Result<ProfileStore, String> {
    let guard = state
        .profiles
        .lock()
        .map_err(|_| "profiles lock poisoned".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn create_offline_profile(
    username: String,
    state: State<'_, AppState>,
) -> Result<ProfileStore, String> {
    let mut guard = state
        .profiles
        .lock()
        .map_err(|_| "profiles lock poisoned".to_string())?;
    add_offline_profile(&mut guard, &username).map_err(|e| e.to_string())?;
    save_profiles_atomic(&state.paths.profiles_path(), &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn set_active_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<ProfileStore, String> {
    let mut guard = state
        .profiles
        .lock()
        .map_err(|_| "profiles lock poisoned".to_string())?;
    select_active_profile(&mut guard, &profile_id).map_err(|e| e.to_string())?;
    save_profiles_atomic(&state.paths.profiles_path(), &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn delete_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<ProfileStore, String> {
    let mut guard = state
        .profiles
        .lock()
        .map_err(|_| "profiles lock poisoned".to_string())?;
    remove_profile(&mut guard, &profile_id).map_err(|e| e.to_string())?;
    save_profiles_atomic(&state.paths.profiles_path(), &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn start_microsoft_login() -> Result<MicrosoftDeviceCodeSession, String> {
    begin_microsoft_device_login()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn poll_microsoft_login(
    device_code: String,
    state: State<'_, AppState>,
) -> Result<Option<PlayerProfile>, String> {
    let maybe_profile = poll_microsoft_device_login(&device_code)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(profile) = maybe_profile.clone() {
        let mut guard = state
            .profiles
            .lock()
            .map_err(|_| "profiles lock poisoned".to_string())?;
        guard.active_profile_id = Some(profile.id.clone());
        guard.profiles.push(profile);
        save_profiles_atomic(&state.paths.profiles_path(), &guard).map_err(|e| e.to_string())?;
    }
    Ok(maybe_profile)
}

#[tauri::command]
fn list_instances(state: State<'_, AppState>) -> Result<Vec<GameInstance>, String> {
    let guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    Ok(guard.instances.clone())
}

#[tauri::command]
async fn create_instance(
    request: CreateInstanceRequest,
    state: State<'_, AppState>,
) -> Result<GameInstance, String> {
    let global_auto = current_global_auto_install(&state)?;
    let created = {
        let mut guard = state
            .instances
            .lock()
            .map_err(|_| "instances lock poisoned".to_string())?;
        create_new_instance(&state.paths, &mut guard, request, global_auto)
            .map_err(|e| e.to_string())?
    };

    // Independently auto-install Fabric Loader profile if enabled
    if created.loader == "fabric" && created.auto_install_fabric_loader {
        if let Some(loader_ver) = created.fabric_loader_version.as_deref() {
            let _ = fetch_fabric_profile(&state.paths, &created.mc_version, loader_ver).await;
        }
    }

    // Independently auto-install compatible Fabric API JAR if enabled (never mixes MC versions)
    if created.loader == "fabric" && created.auto_install_fabric_api {
        let inst_dir = std::path::PathBuf::from(&created.instance_dir);
        let _ = ensure_fabric_api_installed(
            &created.id,
            &inst_dir,
            &created.mc_version,
            &created.loader,
            true,
            false,
        )
        .await;
    }

    Ok(created)
}

#[tauri::command]
fn get_instance_fabric_api_status(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<FabricApiStatus, String> {
    let instance = find_instance(&state, &instance_id)?;
    let inst_dir = std::path::PathBuf::from(&instance.instance_dir);
    Ok(inspect_fabric_api_status(
        &instance.id,
        &inst_dir,
        &instance.mc_version,
        &instance.loader,
        instance.auto_install_fabric_api,
    ))
}

#[tauri::command]
async fn sync_instance_fabric_api(
    instance_id: String,
    force_update: bool,
    state: State<'_, AppState>,
) -> Result<FabricApiStatus, String> {
    let instance = find_instance(&state, &instance_id)?;
    let inst_dir = std::path::PathBuf::from(&instance.instance_dir);
    ensure_fabric_api_installed(
        &instance.id,
        &inst_dir,
        &instance.mc_version,
        &instance.loader,
        instance.auto_install_fabric_api,
        force_update,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn clone_instance(
    source_id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<GameInstance, String> {
    let mut guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    clone_existing_instance(&state.paths, &mut guard, &source_id, &new_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_instance(
    request: UpdateInstanceRequest,
    state: State<'_, AppState>,
) -> Result<GameInstance, String> {
    let global_auto = current_global_auto_install(&state)?;
    let mut guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    update_existing_instance(&state.paths, &mut guard, request, global_auto)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_instance(instance_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    delete_existing_instance(&state.paths, &mut guard, &instance_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_client_integrity(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let instance = find_instance(&state, &instance_id)?;
    Ok(check_client_integrity(&state.paths, &instance, global_auto))
}

#[tauri::command]
fn sync_instance_client_cmd(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let instance = find_instance(&state, &instance_id)?;
    sync_managed_client(&state.paths, &instance, global_auto).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_instance_client(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let instance = find_instance(&state, &instance_id)?;
    update_managed_client(&state.paths, &instance, global_auto).map_err(|e| e.to_string())
}

#[tauri::command]
fn repair_instance_client(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let instance = find_instance(&state, &instance_id)?;
    repair_managed_client(&state.paths, &instance, global_auto).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_instance_client(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let instance = find_instance(&state, &instance_id)?;
    remove_managed_client(&state.paths, &instance, global_auto).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_instance_client_override(
    instance_id: String,
    override_mode: ClientOverrideMode,
    state: State<'_, AppState>,
) -> Result<ClientIntegrityReport, String> {
    let global_auto = current_global_auto_install(&state)?;
    let updated = {
        let mut guard = state
            .instances
            .lock()
            .map_err(|_| "instances lock poisoned".to_string())?;
        update_existing_instance(
            &state.paths,
            &mut guard,
            UpdateInstanceRequest {
                id: instance_id,
                name: None,
                fabric_loader_version: None,
                auto_install_fabric_loader: None,
                auto_install_fabric_api: None,
                auto_install_client: None,
                client_override: Some(override_mode),
                ram_mb_override: None,
                java_path_override: None,
                jvm_args_override: None,
            },
            global_auto,
        )
        .map_err(|e| e.to_string())?
    };
    Ok(check_client_integrity(&state.paths, &updated, global_auto))
}

#[tauri::command]
fn sync_all_clients(state: State<'_, AppState>) -> Result<Vec<ClientIntegrityReport>, String> {
    let global_auto = current_global_auto_install(&state)?;
    let guard = state
        .instances
        .lock()
        .map_err(|_| "instances lock poisoned".to_string())?;
    Ok(sync_all_instances_client(
        &state.paths,
        &guard.instances,
        global_auto,
    ))
}

#[tauri::command]
fn get_performance_telemetry(state: State<'_, AppState>) -> Result<PerformanceTelemetry, String> {
    let running_pid = {
        let mut rt = state
            .launch_runtime
            .lock()
            .map_err(|_| "launch runtime lock poisoned".to_string())?;
        let snap = rt.snapshot();
        if snap.running { snap.pid } else { None }
    };
    Ok(collect_performance_telemetry(&state.paths, running_pid))
}

#[tauri::command]
fn get_optimization_recommendations(
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<OptimizationRecommendations, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let instance = match instance_id {
        Some(id) => Some(find_instance(&state, &id)?),
        None => None,
    };
    Ok(build_optimization_recommendations(
        &state.paths,
        &settings,
        instance.as_ref(),
    ))
}

#[tauri::command]
fn apply_performance_preset(
    preset_id: String,
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<LauncherSettings, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let recs = build_optimization_recommendations(&state.paths, &settings, None);
    let preset = recs
        .presets
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| format!("unknown preset '{preset_id}'"))?;

    if let Some(inst_id) = instance_id {
        let global_auto = settings.auto_install_client;
        let mut guard = state
            .instances
            .lock()
            .map_err(|_| "instances lock poisoned".to_string())?;
        update_existing_instance(
            &state.paths,
            &mut guard,
            UpdateInstanceRequest {
                id: inst_id,
                name: None,
                fabric_loader_version: None,
                auto_install_fabric_loader: None,
                auto_install_fabric_api: None,
                auto_install_client: None,
                client_override: None,
                ram_mb_override: Some(preset.recommended_ram_mb),
                java_path_override: None,
                jvm_args_override: Some(preset.jvm_args),
            },
            global_auto,
        )
        .map_err(|e| e.to_string())?;
        return Ok(settings);
    }

    let mut next = settings;
    next.allocated_ram_mb = preset.recommended_ram_mb;
    next.jvm_args = preset.jvm_args;
    save_settings_atomic(&state.paths.settings_path(), &next).map_err(|e| e.to_string())?;
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    *guard = next.clone();
    Ok(next)
}

#[tauri::command]
fn run_diagnostics(
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<DiagnosticsReport, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let instance = match instance_id {
        Some(id) => Some(find_instance(&state, &id)?),
        None => None,
    };
    Ok(run_instance_diagnostics(
        &state.paths,
        &settings,
        instance.as_ref(),
    ))
}

#[tauri::command]
fn analyze_crash_logs(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<CrashAnalysisReport, String> {
    let instance = find_instance(&state, &instance_id)?;
    Ok(analyze_instance_crash_logs(&instance))
}

#[tauri::command]
async fn check_launcher_update(state: State<'_, AppState>) -> Result<UpdaterStatus, String> {
    let channel = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .release_channel
        .clone();
    check_for_launcher_update(&state.paths, &channel, Arc::clone(&state.updater_runtime))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn download_launcher_update(state: State<'_, AppState>) -> Result<UpdaterStatus, String> {
    start_background_download(state.paths.clone(), Arc::clone(&state.updater_runtime))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_updater_status(state: State<'_, AppState>) -> Result<UpdaterStatus, String> {
    let rt = state
        .updater_runtime
        .lock()
        .map_err(|_| "updater lock poisoned".to_string())?;
    Ok(rt.snapshot(&state.paths))
}

#[tauri::command]
fn install_launcher_update(state: State<'_, AppState>) -> Result<UpdaterStatus, String> {
    let running_pid = {
        let mut launch_rt = state
            .launch_runtime
            .lock()
            .map_err(|_| "launch runtime lock poisoned".to_string())?;
        let snap = launch_rt.snapshot();
        if snap.running { snap.pid } else { None }
    };
    install_staged_update(&state.paths, running_pid, Arc::clone(&state.updater_runtime))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rollback_launcher_update(state: State<'_, AppState>) -> Result<UpdaterStatus, String> {
    let status = rollback_last_update(&state.paths, Arc::clone(&state.updater_runtime))
        .map_err(|e| e.to_string())?;
    // Reload restored settings into memory
    if let Ok(restored) =
        load_or_init_settings(&state.paths.settings_path(), state.paths.instances_path())
    {
        if let Ok(mut guard) = state.settings.lock() {
            *guard = restored;
        }
    }
    Ok(status)
}

#[tauri::command]
async fn search_modrinth(
    query: String,
    project_type: String,
    mc_version: Option<String>,
    loader: Option<String>,
    sort_by: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<ModrinthSearchResponse, String> {
    search_projects(
        &query,
        &project_type,
        mc_version.as_deref(),
        loader.as_deref(),
        sort_by.as_deref(),
        limit,
        offset,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_modpack_install_progress(
    state: State<'_, AppState>,
) -> Result<ModpackInstallProgress, String> {
    let guard = state
        .modpack_progress
        .lock()
        .map_err(|_| "modpack progress lock poisoned".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn install_modrinth_modpack(
    request: InstallModpackRequest,
    state: State<'_, AppState>,
) -> Result<InstallModpackResult, String> {
    let slug_base: String = request
        .instance_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(32)
        .collect();
    let folder_name = format!(
        "{}-{}",
        if slug_base.is_empty() { "modpack" } else { &slug_base },
        &uuid::Uuid::new_v4().to_string()[..8]
    );
    let target_dir = request
        .instance_dir_override
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| state.paths.instances_path().join(folder_name));

    let res = download_and_extract_modpack(&target_dir, &request, &state.modpack_progress).await;
    let (mc_version, loader, loader_version, modpack_ver, installed_files, installed_mods, extracted_overrides) =
        match res {
            Ok(data) => data,
            Err(err) => {
                if let Ok(mut p) = state.modpack_progress.lock() {
                    p.active = false;
                    p.error = Some(err.to_string());
                    p.stage = "Installation failed".to_string();
                }
                return Err(err.to_string());
            }
        };

    // If Fabric modpack, automatically install its isolated Fabric Loader profile
    if loader == "fabric" {
        if let Some(ref lv) = loader_version {
            let _ = fetch_fabric_profile(&state.paths, &mc_version, lv).await;
        }
    }

    let instance = {
        let mut guard = state
            .instances
            .lock()
            .map_err(|_| "instances lock poisoned".to_string())?;
        register_modpack_instance(
            &state.paths,
            &mut guard,
            request.instance_name.clone(),
            mc_version.clone(),
            loader.clone(),
            loader_version.clone(),
            target_dir,
            request.project_id.clone(),
            request.modpack_name.clone(),
            modpack_ver,
            request.icon_url.clone(),
        )
        .map_err(|e| e.to_string())?
    };

    if let Ok(mut p) = state.modpack_progress.lock() {
        p.active = false;
        p.percent = 100;
        p.stage = format!("Created isolated instance '{}'", instance.name);
        p.installed_mod_count = installed_mods;
        p.created_instance_id = Some(instance.id.clone());
    }

    Ok(InstallModpackResult {
        instance,
        installed_files,
        installed_mods,
        extracted_overrides,
        mc_version,
        loader,
        loader_version,
    })
}

#[tauri::command]
fn get_modpack_status(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ModpackStatusReport, String> {
    let instance = find_instance(&state, &instance_id)?;
    Ok(inspect_modpack_status(&instance))
}

#[tauri::command]
async fn check_modpack_update(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ModpackUpdateInfo, String> {
    let instance = find_instance(&state, &instance_id)?;
    check_modpack_update_for_instance(&instance)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_modrinth_modpack(
    instance_id: String,
    target_version_id: String,
    overwrite_modified: bool,
    state: State<'_, AppState>,
) -> Result<ModpackStatusReport, String> {
    let instance = find_instance(&state, &instance_id)?;
    let (_, _, loader_ver, new_ver, _, _, _) = update_modpack_in_instance(
        &instance,
        &target_version_id,
        overwrite_modified,
        &state.modpack_progress,
    )
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut guard = state
            .instances
            .lock()
            .map_err(|_| "instances lock poisoned".to_string())?;
        if let Some(inst) = guard.instances.iter_mut().find(|i| i.id == instance_id) {
            inst.modpack_version = Some(new_ver);
            if loader_ver.is_some() {
                inst.fabric_loader_version = loader_ver;
            }
            inst.modpack_status = Some("updated".to_string());
        }
        let _ = instances::save_instances_atomic(&state.paths.instances_file_path(), &guard);
    }

    let updated = find_instance(&state, &instance_id)?;
    Ok(inspect_modpack_status(&updated))
}

#[tauri::command]
fn rollback_modpack_update(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ModpackStatusReport, String> {
    let instance = find_instance(&state, &instance_id)?;
    rollback_modpack_in_instance(&instance).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_modrinth_versions(
    project_id: String,
    mc_version: Option<String>,
    loader: Option<String>,
    project_type: String,
) -> Result<Vec<ModrinthVersion>, String> {
    fetch_project_versions(
        &project_id,
        mc_version.as_deref(),
        loader.as_deref(),
        &project_type,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_modrinth_content(
    instance_id: String,
    project_id: String,
    version_id: Option<String>,
    project_type: String,
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<InstallContentResult, String> {
    let instance = find_instance(&state, &instance_id)?;
    install_content_with_dependencies(
        &instance,
        &project_id,
        version_id.as_deref(),
        &project_type,
        title,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_instance_content(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<InstalledContentItem>, String> {
    let instance = find_instance(&state, &instance_id)?;
    Ok(list_installed_content(&instance))
}

#[tauri::command]
fn toggle_instance_content(
    instance_id: String,
    filename: String,
    project_type: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<Vec<InstalledContentItem>, String> {
    let instance = find_instance(&state, &instance_id)?;
    toggle_content_enabled(&instance, &filename, &project_type, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_instance_content(
    instance_id: String,
    filename: String,
    project_type: String,
    state: State<'_, AppState>,
) -> Result<Vec<InstalledContentItem>, String> {
    let instance = find_instance(&state, &instance_id)?;
    remove_content_item(&instance, &filename, &project_type).map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_instance_updates(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ContentUpdateInfo>, String> {
    let instance = find_instance(&state, &instance_id)?;
    check_for_updates(&instance).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_instance_content(
    instance_id: String,
    project_id: String,
    state: State<'_, AppState>,
) -> Result<InstallContentResult, String> {
    let instance = find_instance(&state, &instance_id)?;
    update_single_content(&instance, &project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn check_instance_compatibility(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<CompatibilityReport, String> {
    let instance = find_instance(&state, &instance_id)?;
    Ok(run_compatibility_checks(&instance))
}

#[tauri::command]
async fn launch_instance(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<LaunchStatus, String> {
    let instance = find_instance(&state, &instance_id)?;

    let profile = {
        let guard = state
            .profiles
            .lock()
            .map_err(|_| "profiles lock poisoned".to_string())?;
        let active_id = guard
            .active_profile_id
            .as_deref()
            .ok_or_else(|| "no active profile selected".to_string())?;
        guard
            .profiles
            .iter()
            .find(|p| p.id == active_id)
            .cloned()
            .ok_or_else(|| "active profile not found".to_string())?
    };

    let settings = {
        let guard = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned".to_string())?;
        guard.clone()
    };

    launch_game_instance(
        &state.paths,
        &settings,
        &instance,
        &profile,
        Arc::clone(&state.launch_runtime),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_launch_status(state: State<'_, AppState>) -> Result<LaunchStatus, String> {
    let mut guard = state
        .launch_runtime
        .lock()
        .map_err(|_| "launch runtime lock poisoned".to_string())?;
    Ok(guard.snapshot())
}

#[tauri::command]
fn open_instance_folder(instance_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let instance = find_instance(&state, &instance_id)?;
    std::fs::create_dir_all(&instance.instance_dir).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&instance.instance_dir)
            .spawn()
            .map_err(|e| format!("failed to open instance folder: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&instance.instance_dir)
            .spawn()
            .map_err(|e| format!("failed to open instance folder: {e}"))?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&instance.instance_dir)
            .spawn()
            .map_err(|e| format!("failed to open instance folder: {e}"))?;
    }
    Ok(instance.instance_dir)
}

#[tauri::command]
fn open_instance_mods_folder(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let instance = find_instance(&state, &instance_id)?;
    let mods_dir = std::path::PathBuf::from(&instance.instance_dir).join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let mods_str = mods_dir.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&mods_str)
            .spawn()
            .map_err(|e| format!("failed to open mods folder: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&mods_str)
            .spawn()
            .map_err(|e| format!("failed to open mods folder: {e}"))?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&mods_str)
            .spawn()
            .map_err(|e| format!("failed to open mods folder: {e}"))?;
    }
    Ok(mods_str)
}

#[tauri::command]
fn stop_instance(state: State<'_, AppState>) -> LaunchStatus {
    stop_running_instance(&state.launch_runtime)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = LauncherPaths::resolve();
    let _ = paths.ensure_layout();
    let _ = std::fs::create_dir_all(client_manager::bundles_dir(&paths));
    let _ = std::fs::create_dir_all(updater::updates_root(&paths));

    let initial_settings =
        load_or_init_settings(&paths.settings_path(), paths.instances_path())
            .unwrap_or_else(|_| LauncherSettings::default_with_dir(paths.instances_path()));
    let initial_profiles = load_or_init_profiles(&paths.profiles_path()).unwrap_or_default();
    let initial_instances = load_or_init_instances(&paths).unwrap_or_default();

    let app_state = AppState {
        paths,
        settings: Mutex::new(initial_settings),
        profiles: Mutex::new(initial_profiles),
        instances: Mutex::new(initial_instances),
        launch_runtime: Arc::new(Mutex::new(LaunchRuntime::default())),
        updater_runtime: Arc::new(Mutex::new(UpdaterRuntime::default())),
        modpack_progress: Arc::new(Mutex::new(ModpackInstallProgress::default())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                apply_windows_glass_backdrop(&main_window);
            }
            // Seed bundled 7xAir Fabric client JARs/catalog from installer resources into %APPDATA%\7xAir\client-bundles
            if let Ok(res_dir) = app.path().resource_dir() {
                let bundled = res_dir.join("resources").join("client-bundles");
                let dest = client_manager::bundles_dir(&app.state::<AppState>().paths);
                if bundled.exists() {
                    let _ = std::fs::create_dir_all(&dest);
                    if let Ok(entries) = std::fs::read_dir(&bundled) {
                        for entry in entries.flatten() {
                            let src = entry.path();
                            if src.is_file() {
                                let target = dest.join(entry.file_name());
                                if !target.exists() {
                                    let _ = std::fs::copy(&src, &target);
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            load_settings,
            save_settings,
            list_themes,
            get_system_snapshot,
            get_minecraft_metadata,
            detect_java,
            get_fabric_loaders,
            list_profiles,
            create_offline_profile,
            set_active_profile,
            delete_profile,
            start_microsoft_login,
            poll_microsoft_login,
            list_instances,
            create_instance,
            clone_instance,
            update_instance,
            delete_instance,
            open_instance_folder,
            open_instance_mods_folder,
            get_instance_fabric_api_status,
            sync_instance_fabric_api,
            get_client_integrity,
            sync_instance_client_cmd,
            update_instance_client,
            repair_instance_client,
            remove_instance_client,
            set_instance_client_override,
            sync_all_clients,
            get_performance_telemetry,
            get_optimization_recommendations,
            apply_performance_preset,
            run_diagnostics,
            analyze_crash_logs,
            check_launcher_update,
            download_launcher_update,
            get_updater_status,
            install_launcher_update,
            rollback_launcher_update,
            search_modrinth,
            get_modrinth_versions,
            install_modrinth_content,
            install_modrinth_modpack,
            get_modpack_install_progress,
            get_modpack_status,
            check_modpack_update,
            update_modrinth_modpack,
            rollback_modpack_update,
            list_instance_content,
            toggle_instance_content,
            remove_instance_content,
            check_instance_updates,
            update_instance_content,
            check_instance_compatibility,
            launch_instance,
            get_launch_status,
            stop_instance
        ])
        .run(tauri::generate_context!())
        .expect("error while running 7xAir Tauri application");
}
