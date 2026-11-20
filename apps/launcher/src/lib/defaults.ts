import type {
  AppInfo,
  LauncherSettings,
  LaunchStatus,
  NavItem,
  SystemSnapshot,
} from "../types/launcher";

export const DEFAULT_SETTINGS: LauncherSettings = {
  theme: "azure-mountains",
  glassOpacity: 0.72,
  reducedMotion: false,
  backgroundAnimations: true,
  particleEffects: true,
  playerRotation: true,
  startupRoute: "home",
  launchOnStartup: false,
  pauseEffectsInGame: true,
  autoInstallClient: true,
  defaultMcVersion: "1.21.11",
  allocatedRamMb: 4096,
  javaPath: "",
  jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions",
  closeOnLaunch: false,
  autoUpdates: true,
  releaseChannel: "stable",
  gameDir: "%APPDATA%\\7xAir\\instances",
};

export const FALLBACK_APP_INFO: AppInfo = {
  name: "7xAir",
  version: "0.1.0",
  platform: "windows",
  arch: "x86_64",
  targetMinecraftVersions: ["1.21.11", "26.2"],
  paths: {
    rootDir: "%APPDATA%\\7xAir",
    settingsFile: "%APPDATA%\\7xAir\\settings.json",
    profilesFile: "%APPDATA%\\7xAir\\profiles.json",
    instancesFile: "%APPDATA%\\7xAir\\instances.json",
    instancesDir: "%APPDATA%\\7xAir\\instances",
    runtimeDir: "%APPDATA%\\7xAir\\runtime",
    cacheDir: "%APPDATA%\\7xAir\\cache",
    assetsDir: "%APPDATA%\\7xAir\\assets",
    librariesDir: "%APPDATA%\\7xAir\\libraries",
    versionsDir: "%APPDATA%\\7xAir\\versions",
  },
};

export const FALLBACK_SYSTEM_SNAPSHOT: SystemSnapshot = {
  os: "windows",
  arch: "x86_64",
  cpuThreads: 8,
  dataRoot: "%APPDATA%\\7xAir",
};

export const EMPTY_LAUNCH_STATUS: LaunchStatus = {
  running: false,
  instanceId: null,
  instanceName: null,
  pid: null,
  exitCode: null,
  javaPath: null,
  mainClass: null,
  logs: [],
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "home",
    label: "Home",
    stageReady: true,
    description: "Quick launch hub, active profile, target version, and live launch console.",
  },
  {
    id: "instances",
    label: "Instances",
    stageReady: true,
    description: "Create, clone, and launch independent Minecraft 1.21.11 & 26.2 instances.",
  },
  {
    id: "modrinth",
    label: "Modrinth",
    stageReady: true,
    description: "Search, install, update, and verify compatibility for mods & resource packs per instance.",
  },
  {
    id: "performance",
    label: "Performance",
    stageReady: true,
    description: "Live hardware telemetry, optimization presets, diagnostics, and crash-log analysis.",
  },
  {
    id: "profiles",
    label: "Profiles",
    stageReady: true,
    description: "Manage optional Microsoft authentication and offline local player profiles.",
  },
  {
    id: "themes",
    label: "Themes",
    stageReady: true,
    description: "Switch between seven nature themes and tune floating glass translucency.",
  },
  {
    id: "settings",
    label: "Settings",
    stageReady: true,
    description: "Configure themes, animations, accounts, performance, updates, and startup preferences.",
  },
] as const;

export function validateSettings(candidate: LauncherSettings): string[] {
  const errors: string[] = [];
  if (candidate.glassOpacity < 0.35 || candidate.glassOpacity > 0.95) {
    errors.push("Glass opacity must stay between 35% and 95%.");
  }
  if (candidate.allocatedRamMb < 1024 || candidate.allocatedRamMb > 32768) {
    errors.push("Allocated RAM must be between 1024 MB and 32768 MB.");
  }
  if (candidate.defaultMcVersion !== "1.21.11" && candidate.defaultMcVersion !== "26.2") {
    errors.push("Default Minecraft version must be 1.21.11 or 26.2.");
  }
  return errors;
}
