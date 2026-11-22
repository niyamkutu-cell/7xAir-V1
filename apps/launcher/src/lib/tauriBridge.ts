import type {
  AppInfo,
  ClientIntegrityReport,
  ClientOverrideMode,
  CompatibilityReport,
  ContentProjectType,
  ContentUpdateInfo,
  CrashAnalysisReport,
  CleanupExecutionResult,
  CleanupScanReport,
  CreateInstanceRequest,
  JvmBackupEntry,
  JvmValidationReport,
  SystemMemoryAudit,
  CustomWallpaperItem,
  DiagnosticsReport,
  FabricApiStatus,
  FabricLoaderOption,
  GameInstance,
  GraphicsOptions,
  InstallContentResult,
  InstallModpackRequest,
  InstallModpackResult,
  InstalledContentItem,
  JavaInstallation,
  LauncherSettings,
  LaunchStatus,
  MicrosoftDeviceCodeSession,
  MinecraftMetadataSummary,
  ModpackInstallProgress,
  ModpackStatusReport,
  ModAuditReport,
  ModpackUpdateInfo,
  MusicDiscoveryResponse,
  MusicPreferences,
  MusicProviderId,
  MusicSearchMode,
  MusicSearchResponse,
  MusicStateSnapshot,
  MusicTrack,
  ModrinthSearchResponse,
  ModrinthVersion,
  MsaAuthConfigStatus,
  OptimizationRecommendations,
  PerformanceTelemetry,
  PlayerProfile,
  ProfileStore,
  SystemSnapshot,
  UpdateInstanceRequest,
  UpdaterStatus,
} from "../types/launcher";
import {
  DEFAULT_SETTINGS,
  EMPTY_LAUNCH_STATUS,
  FALLBACK_APP_INFO,
  FALLBACK_SYSTEM_SNAPSHOT,
} from "./defaults";

const STORAGE_SETTINGS_KEY = "sevenxair.settings.v1";
const STORAGE_PROFILES_KEY = "sevenxair.profiles.v1";
const STORAGE_INSTANCES_KEY = "sevenxair.instances.v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function fetchAppInfo(): Promise<AppInfo> {
  if (!isTauriRuntime()) return FALLBACK_APP_INFO;
  return invokeTauri<AppInfo>("get_app_info");
}

export async function fetchSystemSnapshot(): Promise<SystemSnapshot> {
  if (!isTauriRuntime()) return FALLBACK_SYSTEM_SNAPSHOT;
  return invokeTauri<SystemSnapshot>("get_system_snapshot");
}

export async function loadLauncherSettings(): Promise<LauncherSettings> {
  if (!isTauriRuntime()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  }
  return invokeTauri<LauncherSettings>("load_settings");
}

export async function saveLauncherSettings(
  nextSettings: LauncherSettings
): Promise<LauncherSettings> {
  if (!isTauriRuntime()) {
    try {
      window.localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(nextSettings));
    } catch {
      // ignore
    }
    return nextSettings;
  }
  return invokeTauri<LauncherSettings>("save_settings", { nextSettings });
}

export async function fetchMinecraftMetadata(
  forceRefresh = false
): Promise<MinecraftMetadataSummary> {
  if (!isTauriRuntime()) {
    return {
      source: "offline-fallback",
      latestRelease: "1.21.11",
      latestSnapshot: "26.2",
      totalVersions: 0,
      targetCompatibility: [
        { version: "1.21.11", status: "pending_official_release" },
        { version: "26.2", status: "pending_official_release" },
      ],
      recentReleases: [],
    };
  }
  return invokeTauri<MinecraftMetadataSummary>("get_minecraft_metadata", { forceRefresh });
}

export async function detectJavaInstallations(): Promise<JavaInstallation[]> {
  if (!isTauriRuntime()) {
    return [
      {
        path: "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javaw.exe",
        majorVersion: 21,
        rawVersion: "21.0.5",
        vendor: "Eclipse Temurin",
        source: "browser-preview",
        recommended: true,
      },
    ];
  }
  return invokeTauri<JavaInstallation[]>("detect_java");
}

export async function fetchFabricLoaders(mcVersion: string): Promise<FabricLoaderOption[]> {
  if (!isTauriRuntime()) {
    return [
      { version: "0.16.10", stable: true, recommended: true, mcVersion },
      { version: "0.16.9", stable: true, recommended: false, mcVersion },
    ];
  }
  return invokeTauri<FabricLoaderOption[]>("get_fabric_loaders", { mcVersion });
}

function readBrowserProfiles(): ProfileStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_PROFILES_KEY);
    if (raw) return JSON.parse(raw) as ProfileStore;
  } catch {
    // ignore
  }
  const initial: PlayerProfile = {
    id: "offline-default",
    username: "AirPlayer",
    uuid: "00000000-0000-3000-8000-000000000001",
    provider: "offline",
    accessToken: "offline-local-token",
    createdAtEpoch: Math.floor(Date.now() / 1000),
  };
  return { activeProfileId: initial.id, profiles: [initial] };
}

export async function listProfiles(): Promise<ProfileStore> {
  if (!isTauriRuntime()) return readBrowserProfiles();
  return invokeTauri<ProfileStore>("list_profiles");
}

export async function createOfflineProfile(username: string): Promise<ProfileStore> {
  if (!isTauriRuntime()) {
    const store = readBrowserProfiles();
    const id = `offline-${Date.now()}`;
    const profile: PlayerProfile = {
      id,
      username: username.trim(),
      uuid: `00000000-0000-3000-8000-${String(Date.now()).slice(-12)}`,
      provider: "offline",
      accessToken: "offline-local-token",
      createdAtEpoch: Math.floor(Date.now() / 1000),
    };
    const next: ProfileStore = {
      activeProfileId: id,
      profiles: [...store.profiles, profile],
    };
    window.localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<ProfileStore>("create_offline_profile", { username });
}

export async function setActiveProfile(profileId: string): Promise<ProfileStore> {
  if (!isTauriRuntime()) {
    const store = readBrowserProfiles();
    const next = { ...store, activeProfileId: profileId };
    window.localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<ProfileStore>("set_active_profile", { profileId });
}

export async function deleteProfile(profileId: string): Promise<ProfileStore> {
  if (!isTauriRuntime()) {
    const store = readBrowserProfiles();
    const profiles = store.profiles.filter((p) => p.id !== profileId);
    const activeProfileId =
      store.activeProfileId === profileId ? profiles[0]?.id ?? null : store.activeProfileId;
    const next = { activeProfileId, profiles };
    window.localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<ProfileStore>("delete_profile", { profileId });
}

export async function getMsaAuthStatus(): Promise<MsaAuthConfigStatus> {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      source: "missing",
      diagnostic: "Microsoft OAuth requires the desktop launcher with SEVENXAIR_MSA_CLIENT_ID configured (see docs/MICROSOFT_AUTH_SETUP.md).",
      setupDoc: "docs/MICROSOFT_AUTH_SETUP.md",
    };
  }
  return invokeTauri<MsaAuthConfigStatus>("get_msa_auth_status");
}

export async function signInMicrosoftBrowser(): Promise<PlayerProfile> {
  if (!isTauriRuntime()) {
    throw new Error("Microsoft browser sign-in requires the 7xAir desktop launcher.");
  }
  return invokeTauri<PlayerProfile>("sign_in_microsoft_browser");
}

export async function startMicrosoftLogin(): Promise<MicrosoftDeviceCodeSession> {
  if (!isTauriRuntime()) {
    throw new Error("Microsoft Device Code login requires the Tauri desktop runtime.");
  }
  return invokeTauri<MicrosoftDeviceCodeSession>("start_microsoft_login");
}

export async function pollMicrosoftLogin(
  deviceCode: string
): Promise<PlayerProfile | null> {
  if (!isTauriRuntime()) return null;
  return invokeTauri<PlayerProfile | null>("poll_microsoft_login", { deviceCode });
}

function readBrowserInstances(): GameInstance[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_INSTANCES_KEY);
    if (raw) return JSON.parse(raw) as GameInstance[];
  } catch {
    // ignore
  }
  return [];
}

export async function listInstances(): Promise<GameInstance[]> {
  if (!isTauriRuntime()) return readBrowserInstances();
  return invokeTauri<GameInstance[]>("list_instances");
}

export async function createInstance(request: CreateInstanceRequest): Promise<GameInstance> {
  if (!isTauriRuntime()) {
    const existing = readBrowserInstances();
    const id = `${request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const created: GameInstance = {
      id,
      name: request.name,
      mcVersion: request.mcVersion,
      loader: request.loader,
      fabricLoaderVersion: request.fabricLoaderVersion,
      autoInstallFabricLoader: request.loader === "fabric" && (request.autoInstallFabricLoader ?? true),
      autoInstallFabricApi: request.loader === "fabric" && (request.autoInstallFabricApi ?? true),
      autoInstallClient: request.loader === "fabric" && request.autoInstallClient,
      clientOverride: request.clientOverride ?? "inherit",
      ramMbOverride: request.ramMbOverride,
      javaPathOverride: request.javaPathOverride ?? null,
      jvmArgsOverride: null,
      instanceDir: request.instanceDirOverride?.trim() || `%APPDATA%\\7xAir\\instances\\${id}`,
      createdAtEpoch: Math.floor(Date.now() / 1000),
      lastPlayedEpoch: null,
    };
    window.localStorage.setItem(STORAGE_INSTANCES_KEY, JSON.stringify([...existing, created]));
    return created;
  }
  return invokeTauri<GameInstance>("create_instance", { request });
}

export async function cloneInstance(sourceId: string, newName: string): Promise<GameInstance> {
  if (!isTauriRuntime()) {
    const existing = readBrowserInstances();
    const src = existing.find((i) => i.id === sourceId);
    if (!src) throw new Error("Source instance not found");
    const id = `${newName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const cloned: GameInstance = {
      ...src,
      id,
      name: newName,
      instanceDir: `%APPDATA%\\7xAir\\instances\\${id}`,
      createdAtEpoch: Math.floor(Date.now() / 1000),
      lastPlayedEpoch: null,
    };
    window.localStorage.setItem(STORAGE_INSTANCES_KEY, JSON.stringify([...existing, cloned]));
    return cloned;
  }
  return invokeTauri<GameInstance>("clone_instance", { sourceId, newName });
}

export async function updateInstance(request: UpdateInstanceRequest): Promise<GameInstance> {
  if (!isTauriRuntime()) {
    const existing = readBrowserInstances();
    let updated: GameInstance | null = null;
    const next = existing.map((inst) => {
      if (inst.id !== request.id) return inst;
      updated = {
        ...inst,
        name: request.name ?? inst.name,
        fabricLoaderVersion: request.fabricLoaderVersion ?? inst.fabricLoaderVersion,
        clientOverride: request.clientOverride ?? inst.clientOverride,
        autoInstallClient:
          request.autoInstallClient !== undefined
            ? inst.loader === "fabric" && request.autoInstallClient
            : inst.autoInstallClient,
        ramMbOverride: request.ramMbOverride ?? inst.ramMbOverride,
      };
      return updated;
    });
    window.localStorage.setItem(STORAGE_INSTANCES_KEY, JSON.stringify(next));
    if (!updated) throw new Error("Instance not found");
    return updated;
  }
  return invokeTauri<GameInstance>("update_instance", { request });
}

export async function openInstanceModsFolder(instanceId: string): Promise<string> {
  if (!isTauriRuntime()) {
    const inst = readBrowserInstances().find((i) => i.id === instanceId);
    return `${inst?.instanceDir ?? "%APPDATA%\\7xAir\\instances"}\\mods`;
  }
  return invokeTauri<string>("open_instance_mods_folder", { instanceId });
}

export async function openInstanceFolder(instanceId: string): Promise<string> {
  if (!isTauriRuntime()) {
    const inst = readBrowserInstances().find((i) => i.id === instanceId);
    return inst?.instanceDir ?? "%APPDATA%\\7xAir\\instances";
  }
  return invokeTauri<string>("open_instance_folder", { instanceId });
}

export async function deleteInstance(instanceId: string): Promise<void> {
  if (!isTauriRuntime()) {
    const existing = readBrowserInstances().filter((i) => i.id !== instanceId);
    window.localStorage.setItem(STORAGE_INSTANCES_KEY, JSON.stringify(existing));
    return;
  }
  await invokeTauri<void>("delete_instance", { instanceId });
}

function previewIntegrity(instanceId: string): ClientIntegrityReport {
  return {
    instanceId,
    mcVersion: "1.21.11",
    loader: "fabric",
    overrideMode: "inherit",
    effectiveEnabled: true,
    bundleAvailable: false,
    bundleVersion: null,
    bundleSha256: null,
    installed: false,
    installedFilename: null,
    installedVersion: null,
    installedSha256: null,
    modsDir: `instances/${instanceId}/mods`,
    validZipHeader: false,
    metadataValid: false,
    mcCompatible: true,
    fabricLoaderCompatible: true,
    duplicateCount: 0,
    hashMatchesBundle: false,
    updateAvailable: false,
    lastBackupPath: null,
    statusMessage: "Preview mode: run inside Tauri desktop to inspect per-instance JAR bundles.",
    healthy: false,
    issues: ["Preview mode: run inside Tauri desktop to inspect staged JAR bundles."],
  };
}

export async function getClientIntegrity(instanceId: string): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) return previewIntegrity(instanceId);
  return invokeTauri<ClientIntegrityReport>("get_client_integrity", { instanceId });
}

export async function syncInstanceClient(instanceId: string): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) return previewIntegrity(instanceId);
  return invokeTauri<ClientIntegrityReport>("sync_instance_client_cmd", { instanceId });
}

export async function updateInstanceClient(instanceId: string): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) return previewIntegrity(instanceId);
  return invokeTauri<ClientIntegrityReport>("update_instance_client", { instanceId });
}

export async function repairInstanceClient(instanceId: string): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) return previewIntegrity(instanceId);
  return invokeTauri<ClientIntegrityReport>("repair_instance_client", { instanceId });
}

export async function removeInstanceClient(instanceId: string): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) return previewIntegrity(instanceId);
  return invokeTauri<ClientIntegrityReport>("remove_instance_client", { instanceId });
}

export async function setInstanceClientOverride(
  instanceId: string,
  overrideMode: ClientOverrideMode
): Promise<ClientIntegrityReport> {
  if (!isTauriRuntime()) {
    return { ...previewIntegrity(instanceId), overrideMode };
  }
  return invokeTauri<ClientIntegrityReport>("set_instance_client_override", {
    instanceId,
    overrideMode,
  });
}

export async function syncAllClients(): Promise<ClientIntegrityReport[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<ClientIntegrityReport[]>("sync_all_clients");
}

export async function getPerformanceTelemetry(): Promise<PerformanceTelemetry> {
  if (!isTauriRuntime()) {
    return {
      cpuBrand: "Preview CPU",
      cpuThreads: 8,
      cpuUsagePercent: 12.5,
      totalRamMb: 16384,
      usedRamMb: 6144,
      availableRamMb: 10240,
      ramUsagePercent: 37.5,
      freeDiskGb: 120.0,
      gpuName: "Preview GPU",
      gameRunning: false,
      gamePid: null,
      gameRamMb: null,
      gameCpuPercent: null,
    };
  }
  return invokeTauri<PerformanceTelemetry>("get_performance_telemetry");
}

export async function getOptimizationRecommendations(
  instanceId?: string
): Promise<OptimizationRecommendations> {
  if (!isTauriRuntime()) {
    return {
      presets: [
        {
          id: "competitive_pvp",
          name: "Competitive PvP",
          description: "Low-latency G1GC tuning capped to prevent GC frame-time spikes.",
          recommendedRamMb: 4096,
          jvmArgs: "-XX:+UseG1GC -XX:MaxGCPauseMillis=20",
        },
      ],
      recommendedRamMb: 4096,
      warnings: [],
      fabricMods: [],
    };
  }
  return invokeTauri<OptimizationRecommendations>("get_optimization_recommendations", {
    instanceId: instanceId ?? null,
  });
}

export async function applyPerformancePreset(
  presetId: string,
  instanceId?: string
): Promise<LauncherSettings> {
  if (!isTauriRuntime()) return loadLauncherSettings();
  return invokeTauri<LauncherSettings>("apply_performance_preset", {
    presetId,
    instanceId: instanceId ?? null,
  });
}

export async function runDiagnostics(instanceId?: string): Promise<DiagnosticsReport> {
  if (!isTauriRuntime()) {
    return {
      overallStatus: "healthy",
      healthScore: 100,
      checks: [],
      compatibility: null,
      clientIntegrity: null,
    };
  }
  return invokeTauri<DiagnosticsReport>("run_diagnostics", {
    instanceId: instanceId ?? null,
  });
}

export async function analyzeCrashLogs(instanceId: string): Promise<CrashAnalysisReport> {
  if (!isTauriRuntime()) {
    return {
      instanceId,
      analyzedFile: null,
      crashReportsFound: 0,
      findings: [],
      excerpt: [],
    };
  }
  return invokeTauri<CrashAnalysisReport>("analyze_crash_logs", { instanceId });
}

const PREVIEW_UPDATER: UpdaterStatus = {
  phase: "idle",
  currentVersion: "0.1.0",
  availableUpdate: null,
  bytesDownloaded: 0,
  totalBytes: 0,
  progressPercent: 0,
  stagedUpdate: null,
  rollbackAvailable: false,
  lastMessage: "Preview mode: updater connects in Tauri desktop runtime.",
  lastError: null,
};

export async function checkLauncherUpdate(): Promise<UpdaterStatus> {
  if (!isTauriRuntime()) return PREVIEW_UPDATER;
  return invokeTauri<UpdaterStatus>("check_launcher_update");
}

export async function downloadLauncherUpdate(): Promise<UpdaterStatus> {
  if (!isTauriRuntime()) return PREVIEW_UPDATER;
  return invokeTauri<UpdaterStatus>("download_launcher_update");
}

export async function getUpdaterStatus(): Promise<UpdaterStatus> {
  if (!isTauriRuntime()) return PREVIEW_UPDATER;
  return invokeTauri<UpdaterStatus>("get_updater_status");
}

export async function installLauncherUpdate(): Promise<UpdaterStatus> {
  if (!isTauriRuntime()) return PREVIEW_UPDATER;
  return invokeTauri<UpdaterStatus>("install_launcher_update");
}

export async function rollbackLauncherUpdate(): Promise<UpdaterStatus> {
  if (!isTauriRuntime()) return PREVIEW_UPDATER;
  return invokeTauri<UpdaterStatus>("rollback_launcher_update");
}

export async function searchModrinth(params: {
  query: string;
  projectType: ContentProjectType;
  mcVersion?: string;
  loader?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}): Promise<ModrinthSearchResponse> {
  if (!isTauriRuntime()) {
    return { hits: [], offset: 0, limit: params.limit ?? 20, total_hits: 0 };
  }
  return invokeTauri<ModrinthSearchResponse>("search_modrinth", {
    query: params.query,
    projectType: params.projectType,
    mcVersion: params.mcVersion ?? null,
    loader: params.loader ?? null,
    sortBy: params.sortBy ?? "relevance",
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
  });
}

export async function getModrinthVersions(
  projectId: string,
  mcVersion: string | null,
  loader: string | null,
  projectType: ContentProjectType
): Promise<ModrinthVersion[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<ModrinthVersion[]>("get_modrinth_versions", {
    projectId,
    mcVersion,
    loader,
    projectType,
  });
}

export async function installModrinthContent(params: {
  instanceId: string;
  projectId: string;
  versionId?: string;
  projectType: ContentProjectType;
  title?: string;
}): Promise<InstallContentResult> {
  if (!isTauriRuntime()) {
    throw new Error("Installing Modrinth content requires the Tauri desktop runtime.");
  }
  return invokeTauri<InstallContentResult>("install_modrinth_content", {
    instanceId: params.instanceId,
    projectId: params.projectId,
    versionId: params.versionId ?? null,
    projectType: params.projectType,
    title: params.title ?? null,
  });
}

export async function listInstanceContent(
  instanceId: string
): Promise<InstalledContentItem[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<InstalledContentItem[]>("list_instance_content", { instanceId });
}

export async function toggleInstanceContent(
  instanceId: string,
  filename: string,
  projectType: ContentProjectType,
  enabled: boolean
): Promise<InstalledContentItem[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<InstalledContentItem[]>("toggle_instance_content", {
    instanceId,
    filename,
    projectType,
    enabled,
  });
}

export async function removeInstanceContent(
  instanceId: string,
  filename: string,
  projectType: ContentProjectType
): Promise<InstalledContentItem[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<InstalledContentItem[]>("remove_instance_content", {
    instanceId,
    filename,
    projectType,
  });
}

export async function checkInstanceUpdates(
  instanceId: string
): Promise<ContentUpdateInfo[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<ContentUpdateInfo[]>("check_instance_updates", { instanceId });
}

export async function updateInstanceContent(
  instanceId: string,
  projectId: string
): Promise<InstallContentResult> {
  if (!isTauriRuntime()) {
    throw new Error("Updating Modrinth content requires the Tauri desktop runtime.");
  }
  return invokeTauri<InstallContentResult>("update_instance_content", {
    instanceId,
    projectId,
  });
}

export async function checkInstanceCompatibility(
  instanceId: string
): Promise<CompatibilityReport> {
  if (!isTauriRuntime()) {
    return {
      instanceId,
      mcVersion: "1.21.11",
      loader: "fabric",
      compatible: true,
      errorCount: 0,
      warningCount: 0,
      issues: [],
    };
  }
  return invokeTauri<CompatibilityReport>("check_instance_compatibility", { instanceId });
}

export async function launchInstance(instanceId: string): Promise<LaunchStatus> {
  if (!isTauriRuntime()) {
    return {
      ...EMPTY_LAUNCH_STATUS,
      instanceId,
      logs: [
        "[7xAir] Browser preview mode cannot spawn a native Java process. Run inside Tauri desktop to launch Minecraft.",
      ],
    };
  }
  return invokeTauri<LaunchStatus>("launch_instance", { instanceId });
}

export async function getLaunchStatus(): Promise<LaunchStatus> {
  if (!isTauriRuntime()) return EMPTY_LAUNCH_STATUS;
  return invokeTauri<LaunchStatus>("get_launch_status");
}

export async function stopInstance(): Promise<LaunchStatus> {
  if (!isTauriRuntime()) return EMPTY_LAUNCH_STATUS;
  return invokeTauri<LaunchStatus>("stop_instance");
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export function getRuntimeMode(): "tauri" | "browser-preview" {
  return isTauriRuntime() ? "tauri" : "browser-preview";
}

export async function getInstanceFabricApiStatus(instanceId: string): Promise<FabricApiStatus> {
  if (!isTauriRuntime()) {
    const inst = readBrowserInstances().find((i) => i.id === instanceId);
    const mc = inst?.mcVersion ?? "1.21.11";
    const isFabric = (inst?.loader ?? "fabric") === "fabric";
    const autoOn = inst?.autoInstallFabricApi ?? true;
    return {
      instanceId,
      mcVersion: mc,
      autoInstallEnabled: isFabric && autoOn,
      installed: false,
      installedVersion: null,
      installedFilename: null,
      compatibleWithMcVersion: mc === "1.21.11",
      latestAvailableVersion: null,
      updateAvailable: false,
      status: !isFabric ? "vanilla" : !autoOn ? "disabled" : mc === "26.2" ? "unavailable" : "not_installed",
      message: !isFabric
        ? "Vanilla instance (Fabric API not required)."
        : !autoOn
        ? "Auto-Install Fabric API is OFF."
        : mc === "26.2"
        ? "Check official availability for Minecraft 26.2 on Windows desktop runtime."
        : "Fabric API will be installed automatically for MC 1.21.11.",
    };
  }
  return invokeTauri<FabricApiStatus>("get_instance_fabric_api_status", { instanceId });
}

export async function syncInstanceFabricApi(
  instanceId: string,
  forceUpdate = false
): Promise<FabricApiStatus> {
  if (!isTauriRuntime()) {
    return getInstanceFabricApiStatus(instanceId);
  }
  return invokeTauri<FabricApiStatus>("sync_instance_fabric_api", { instanceId, forceUpdate });
}

export async function getModpackInstallProgress(): Promise<ModpackInstallProgress> {
  if (!isTauriRuntime()) {
    return {
      active: false,
      modpackName: null,
      stage: "Idle",
      completedFiles: 0,
      totalFiles: 0,
      percent: 0,
      installedModCount: 0,
      createdInstanceId: null,
      error: null,
    };
  }
  return invokeTauri<ModpackInstallProgress>("get_modpack_install_progress");
}

export async function installModrinthModpack(
  request: InstallModpackRequest
): Promise<InstallModpackResult> {
  if (!isTauriRuntime()) {
    const existing = readBrowserInstances();
    const id = `${request.instanceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const created: GameInstance = {
      id,
      name: request.instanceName,
      mcVersion: request.mcVersionOverride || "1.21.11",
      loader: (request.loaderOverride as GameInstance["loader"]) || "fabric",
      fabricLoaderVersion: request.loaderVersionOverride ?? "0.16.10",
      autoInstallFabricLoader: true,
      autoInstallFabricApi: false,
      autoInstallClient: false,
      clientOverride: "force_off",
      ramMbOverride: null,
      javaPathOverride: null,
      jvmArgsOverride: null,
      instanceDir: request.instanceDirOverride?.trim() || `%APPDATA%\\7xAir\\instances\\${id}`,
      modpackId: request.projectId,
      modpackName: request.modpackName,
      modpackVersion: request.versionId,
      modpackIconUrl: request.iconUrl ?? null,
      modpackStatus: "installed",
      createdAtEpoch: Math.floor(Date.now() / 1000),
      lastPlayedEpoch: null,
    };
    window.localStorage.setItem(STORAGE_INSTANCES_KEY, JSON.stringify([...existing, created]));
    return {
      instance: created,
      installedFiles: 0,
      installedMods: 0,
      extractedOverrides: 0,
      mcVersion: created.mcVersion,
      loader: created.loader,
      loaderVersion: created.fabricLoaderVersion,
    };
  }
  return invokeTauri<InstallModpackResult>("install_modrinth_modpack", { request });
}

export async function getModpackStatus(instanceId: string): Promise<ModpackStatusReport> {
  if (!isTauriRuntime()) {
    const inst = readBrowserInstances().find((i) => i.id === instanceId);
    return {
      isModpack: Boolean(inst?.modpackId),
      projectId: inst?.modpackId ?? null,
      modpackName: inst?.modpackName ?? null,
      author: inst?.modpackId ? "Modrinth" : null,
      versionId: inst?.modpackVersion ?? null,
      versionNumber: inst?.modpackVersion ?? null,
      mcVersion: inst?.mcVersion ?? "1.21.11",
      loader: inst?.loader ?? "fabric",
      loaderVersion: inst?.fabricLoaderVersion ?? null,
      managedFileCount: 0,
      userAddedFileCount: 0,
      userModifiedFiles: [],
      backupAvailable: false,
      modpackPageUrl: inst?.modpackId ? `https://modrinth.com/modpack/${inst.modpackId}` : null,
    };
  }
  return invokeTauri<ModpackStatusReport>("get_modpack_status", { instanceId });
}

export async function checkModpackUpdate(instanceId: string): Promise<ModpackUpdateInfo> {
  if (!isTauriRuntime()) {
    const st = await getModpackStatus(instanceId);
    return {
      instanceId,
      projectId: st.projectId ?? "",
      modpackName: st.modpackName ?? "Modpack",
      currentVersion: st.versionNumber ?? "unknown",
      updateAvailable: false,
      latestVersionId: null,
      latestVersionNumber: null,
      changelog: null,
      compatible: true,
      compatibilityMessage: "Update checks require the desktop runtime.",
      conflicts: [],
    };
  }
  return invokeTauri<ModpackUpdateInfo>("check_modpack_update", { instanceId });
}

export async function updateModrinthModpack(
  instanceId: string,
  targetVersionId: string,
  overwriteModified = false
): Promise<ModpackStatusReport> {
  if (!isTauriRuntime()) {
    return getModpackStatus(instanceId);
  }
  return invokeTauri<ModpackStatusReport>("update_modrinth_modpack", {
    instanceId,
    targetVersionId,
    overwriteModified,
  });
}

export async function rollbackModpackUpdate(instanceId: string): Promise<ModpackStatusReport> {
  if (!isTauriRuntime()) {
    return getModpackStatus(instanceId);
  }
  return invokeTauri<ModpackStatusReport>("rollback_modpack_update", { instanceId });
}

export async function auditInstanceMods(instanceId: string): Promise<ModAuditReport> {
  if (!isTauriRuntime()) {
    return { instanceId, totalMods: 0, findings: [] };
  }
  return invokeTauri<ModAuditReport>("audit_instance_mods", { instanceId });
}

export async function getInstanceGraphicsOptions(instanceId: string): Promise<GraphicsOptions> {
  if (!isTauriRuntime()) {
    return {
      renderDistance: 12,
      simulationDistance: 8,
      particles: 1,
      entityDistanceScaling: 1.0,
      renderClouds: "fast",
      graphicsMode: 1,
      entityShadows: true,
      enableVsync: false,
      maxFps: 260,
    };
  }
  return invokeTauri<GraphicsOptions>("get_instance_graphics_options", { instanceId });
}

export async function saveInstanceGraphicsOptions(
  instanceId: string,
  options: GraphicsOptions
): Promise<GraphicsOptions> {
  if (!isTauriRuntime()) return options;
  return invokeTauri<GraphicsOptions>("save_instance_graphics_options_cmd", { instanceId, options });
}

export async function setGpuHighPerformancePreference(javaPath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return "Dedicated GPU preference requires the Windows desktop launcher.";
  }
  return invokeTauri<string>("set_gpu_high_performance_preference", { javaPath });
}

const STORAGE_MUSIC_STATE_KEY = "7xair.musicState.v1";

function defaultMusicSnapshot(): MusicStateSnapshot {
  return {
    preferences: {
      preferredProvider: "audius",
      volume: 0.75,
      shuffle: false,
      repeatMode: "off",
      pauseOnMinecraftLaunch: false,
      stopOnLauncherClose: true,
    },
    recentlyPlayed: [],
    spotify: {
      connected: false,
      clientIdConfigured: false,
      clientIdSource: null,
      displayName: null,
      product: null,
      premiumRequiredNote:
        "Official Spotify Connect playback requires a Spotify Premium account and an active Spotify device. Free accounts can browse and fall back to Audius/Deezer inside 7xAir.",
      redirectUri: "http://127.0.0.1:43821/callback",
    },
  };
}

function readBrowserMusicState(): MusicStateSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_MUSIC_STATE_KEY);
    if (!raw) return defaultMusicSnapshot();
    const parsed = JSON.parse(raw) as Partial<MusicStateSnapshot>;
    const def = defaultMusicSnapshot();
    return {
      preferences: { ...def.preferences, ...(parsed.preferences ?? {}) },
      recentlyPlayed: Array.isArray(parsed.recentlyPlayed) ? parsed.recentlyPlayed : [],
      spotify: { ...def.spotify, ...(parsed.spotify ?? {}) },
    };
  } catch {
    return defaultMusicSnapshot();
  }
}

export async function getMusicState(): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) return readBrowserMusicState();
  return invokeTauri<MusicStateSnapshot>("music_get_state");
}

export async function saveMusicPreferences(
  preferences: MusicPreferences
): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) {
    const cur = readBrowserMusicState();
    const next = { ...cur, preferences };
    window.localStorage.setItem(STORAGE_MUSIC_STATE_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<MusicStateSnapshot>("music_save_preferences", { preferences });
}

export async function recordMusicPlayed(track: MusicTrack): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) {
    const cur = readBrowserMusicState();
    const filtered = cur.recentlyPlayed.filter(
      (t) => !(t.id === track.id && t.provider === track.provider)
    );
    const next = { ...cur, recentlyPlayed: [track, ...filtered].slice(0, 40) };
    window.localStorage.setItem(STORAGE_MUSIC_STATE_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<MusicStateSnapshot>("music_record_played", { track });
}

export async function fetchMusicDiscovery(
  provider: MusicProviderId
): Promise<MusicDiscoveryResponse> {
  if (!isTauriRuntime()) {
    return {
      provider,
      popular: [],
      recommended: [],
      playlists: [],
      albums: [],
      notice:
        "Run inside the 7xAir Windows Launcher to fetch live catalogs from official Audius, Deezer, or Spotify APIs.",
    };
  }
  return invokeTauri<MusicDiscoveryResponse>("music_fetch_discovery", { provider });
}

export async function searchMusicCatalog(
  provider: MusicProviderId,
  query: string,
  searchMode: MusicSearchMode
): Promise<MusicSearchResponse> {
  if (!isTauriRuntime()) {
    return {
      provider,
      query,
      searchMode,
      tracks: [],
      albums: [],
      playlists: [],
    };
  }
  return invokeTauri<MusicSearchResponse>("music_search", { provider, query, searchMode });
}

export async function fetchMusicCollectionTracks(
  provider: MusicProviderId,
  kind: "playlist" | "album",
  collectionId: string
): Promise<MusicTrack[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<MusicTrack[]>("music_fetch_collection_tracks", {
    provider,
    kind,
    collectionId,
  });
}

export async function setSpotifyClientId(clientId: string): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) {
    const cur = readBrowserMusicState();
    const next: MusicStateSnapshot = {
      ...cur,
      spotify: {
        ...cur.spotify,
        clientIdConfigured: clientId.trim().length > 0,
        clientIdSource: clientId.trim().length > 0 ? "browser-preview" : null,
      },
    };
    window.localStorage.setItem(STORAGE_MUSIC_STATE_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<MusicStateSnapshot>("music_set_spotify_client_id", { clientId });
}

export async function connectSpotifyAccount(): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) {
    throw new Error("Spotify PKCE OAuth runs inside the 7xAir Windows Launcher.");
  }
  return invokeTauri<MusicStateSnapshot>("music_connect_spotify");
}

export async function disconnectSpotifyAccount(): Promise<MusicStateSnapshot> {
  if (!isTauriRuntime()) {
    const cur = readBrowserMusicState();
    const next: MusicStateSnapshot = {
      ...cur,
      spotify: { ...cur.spotify, connected: false, displayName: null, product: null },
    };
    window.localStorage.setItem(STORAGE_MUSIC_STATE_KEY, JSON.stringify(next));
    return next;
  }
  return invokeTauri<MusicStateSnapshot>("music_disconnect_spotify");
}

export async function controlSpotifyConnect(
  action: "play" | "pause" | "next" | "previous",
  trackUri?: string
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Spotify Connect requires the 7xAir Windows Launcher.");
  }
  return invokeTauri<string>("music_spotify_control", {
    action,
    trackUri: trackUri ?? null,
  });
}

const STORAGE_CUSTOM_WALLPAPERS_KEY = "7xair.customWallpapers.v1";

function readBrowserWallpapers(): CustomWallpaperItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_CUSTOM_WALLPAPERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomWallpaperItem[]) : [];
  } catch {
    return [];
  }
}

export async function listCustomWallpapers(): Promise<CustomWallpaperItem[]> {
  if (!isTauriRuntime()) return readBrowserWallpapers();
  return invokeTauri<CustomWallpaperItem[]>("list_custom_wallpapers");
}

export async function uploadCustomWallpaper(
  filename: string,
  dataBase64: string
): Promise<CustomWallpaperItem> {
  if (!isTauriRuntime()) {
    const item: CustomWallpaperItem = {
      id: `custom:${Date.now()}-${filename}`,
      name: filename.replace(/\.[^.]+$/, ""),
      filename,
      mimeType: filename.toLowerCase().endsWith(".png")
        ? "image/png"
        : filename.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/jpeg",
      dataUrl: dataBase64.startsWith("data:") ? dataBase64 : `data:image/jpeg;base64,${dataBase64}`,
    };
    const next = [...readBrowserWallpapers(), item];
    window.localStorage.setItem(STORAGE_CUSTOM_WALLPAPERS_KEY, JSON.stringify(next));
    return item;
  }
  return invokeTauri<CustomWallpaperItem>("upload_custom_wallpaper", { filename, dataBase64 });
}

export async function deleteCustomWallpaper(wallpaperId: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    const next = readBrowserWallpapers().filter((w) => w.id !== wallpaperId);
    window.localStorage.setItem(STORAGE_CUSTOM_WALLPAPERS_KEY, JSON.stringify(next));
    return true;
  }
  return invokeTauri<boolean>("delete_custom_wallpaper", { wallpaperId });
}

const STORAGE_CUSTOMIZATION_KEY = "7xair.customization.v1";

export async function loadCustomization(): Promise<Record<string, unknown>> {
  if (!isTauriRuntime()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_CUSTOMIZATION_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : { schemaVersion: 1 };
    } catch {
      return { schemaVersion: 1 };
    }
  }
  return invokeTauri<Record<string, unknown>>("load_customization");
}

export async function saveCustomization(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(STORAGE_CUSTOMIZATION_KEY, JSON.stringify(payload));
    return payload;
  }
  return invokeTauri<Record<string, unknown>>("save_customization", { payload });
}

export async function getSystemMemoryAudit(): Promise<SystemMemoryAudit> {
  if (!isTauriRuntime()) {
    return {
      totalRamMb: 16384,
      usedRamMb: 6400,
      availableRamMb: 9984,
      gpuUsagePercent: null,
      diskActivityMbS: null,
      liveFps: null,
      liveFrameTimeMs: null,
      javaProcesses: [],
      topBackgroundConsumers: [],
      recommendations: ["Run inside the 7xAir Windows Launcher to inspect live OS processes."],
    };
  }
  return invokeTauri<SystemMemoryAudit>("get_system_memory_audit");
}

export async function scanCleanupCenter(): Promise<CleanupScanReport> {
  if (!isTauriRuntime()) {
    return {
      totalFiles: 0,
      totalBytes: 0,
      usedRamMbBefore: 6400,
      availableRamMbBefore: 9984,
      categories: [],
      safetyNote: "Protected: personal files, worlds, screenshots, mods, resource packs, and configs are never touched.",
    };
  }
  return invokeTauri<CleanupScanReport>("scan_cleanup_center");
}

export async function runSafeCleanup(selectedCategories: string[]): Promise<CleanupExecutionResult> {
  if (!isTauriRuntime()) {
    return {
      deletedFiles: 0,
      freedBytes: 0,
      skippedFiles: 0,
      usedRamMbBefore: 6400,
      usedRamMbAfter: 6400,
      availableRamMbBefore: 9984,
      availableRamMbAfter: 9984,
      appliedCategories: selectedCategories,
      summary: "Preview mode: no files deleted.",
    };
  }
  return invokeTauri<CleanupExecutionResult>("run_safe_cleanup", { selectedCategories });
}

export async function validateJvmArguments(
  jvmArgs: string,
  allocatedRamMb: number,
  javaMajor: number
): Promise<JvmValidationReport> {
  if (!isTauriRuntime()) {
    return { valid: true, warnings: [], errors: [], recommendedRamMb: 4096 };
  }
  return invokeTauri<JvmValidationReport>("validate_jvm_args_cmd", {
    jvmArgs,
    allocatedRamMb,
    javaMajor,
  });
}

export async function getJvmBackups(): Promise<JvmBackupEntry[]> {
  if (!isTauriRuntime()) return [];
  return invokeTauri<JvmBackupEntry[]>("get_jvm_backups");
}

export async function backupAndApplyJvmProfile(
  label: string,
  nextJvmArgs: string,
  nextRamMb: number
): Promise<JvmBackupEntry> {
  if (!isTauriRuntime()) {
    return {
      id: `preview-${Date.now()}`,
      createdAtEpoch: Math.floor(Date.now() / 1000),
      label,
      previousJvmArgs: "",
      previousRamMb: 4096,
      appliedJvmArgs: nextJvmArgs,
      appliedRamMb: nextRamMb,
    };
  }
  return invokeTauri<JvmBackupEntry>("backup_and_apply_jvm_profile", {
    label,
    nextJvmArgs,
    nextRamMb,
  });
}

export async function revertJvmBackup(backupId: string): Promise<LauncherSettings> {
  if (!isTauriRuntime()) {
    return loadLauncherSettings();
  }
  return invokeTauri<LauncherSettings>("revert_jvm_backup", { backupId });
}
