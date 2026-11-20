export type ThemeId =
  | "azure-mountains"
  | "sakura-valley"
  | "emerald-wilderness"
  | "frozen-peaks"
  | "sunset-horizon"
  | "midnight-forest"
  | "dreamy-anime";

export type NavRoute =
  | "home"
  | "instances"
  | "modrinth"
  | "performance"
  | "profiles"
  | "themes"
  | "settings";

export type MinecraftTargetVersion = "1.21.11" | "26.2";

export type ClientOverrideMode = "inherit" | "force_on" | "force_off";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  accentHex: string;
  secondaryHex: string;
  surfaceTint: string;
}

export interface LauncherPaths {
  rootDir: string;
  settingsFile: string;
  profilesFile: string;
  instancesFile: string;
  instancesDir: string;
  runtimeDir: string;
  cacheDir: string;
  assetsDir: string;
  librariesDir: string;
  versionsDir: string;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  targetMinecraftVersions: MinecraftTargetVersion[];
  paths: LauncherPaths;
}

export interface SystemSnapshot {
  os: string;
  arch: string;
  cpuThreads: number;
  dataRoot: string;
}

export interface LauncherSettings {
  theme: ThemeId;
  glassOpacity: number;
  reducedMotion: boolean;
  backgroundAnimations: boolean;
  particleEffects: boolean;
  playerRotation: boolean;
  startupRoute: NavRoute;
  launchOnStartup: boolean;
  pauseEffectsInGame: boolean;
  autoInstallClient: boolean;
  defaultMcVersion: MinecraftTargetVersion;
  allocatedRamMb: number;
  javaPath: string;
  jvmArgs: string;
  closeOnLaunch: boolean;
  autoUpdates: boolean;
  releaseChannel: "stable" | "beta";
  gameDir: string;
}

export interface NavItem {
  id: NavRoute;
  label: string;
  badge?: string;
  stageReady: boolean;
  description: string;
}

export interface MojangVersionEntry {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
  sha1?: string;
}

export interface TargetCompatibility {
  version: string;
  status: "available" | "pending_official_release";
  versionType?: string;
  releaseTime?: string;
  manifestUrl?: string;
}

export interface MinecraftMetadataSummary {
  source: "live" | "cache" | "offline-fallback";
  latestRelease: string;
  latestSnapshot: string;
  totalVersions: number;
  targetCompatibility: TargetCompatibility[];
  recentReleases: MojangVersionEntry[];
}

export interface JavaInstallation {
  path: string;
  majorVersion: number;
  rawVersion: string;
  vendor: string;
  source: string;
  recommended: boolean;
}

export interface FabricLoaderOption {
  version: string;
  stable: boolean;
  recommended: boolean;
  mcVersion: string;
}

export type AuthProvider = "offline" | "microsoft";

export interface PlayerProfile {
  id: string;
  username: string;
  uuid: string;
  provider: AuthProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAtEpoch?: number;
  createdAtEpoch: number;
}

export interface ProfileStore {
  activeProfileId: string | null;
  profiles: PlayerProfile[];
}

export interface MicrosoftDeviceCodeSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

export interface GameInstance {
  id: string;
  name: string;
  mcVersion: string;
  loader: "fabric" | "vanilla";
  fabricLoaderVersion: string | null;
  autoInstallClient: boolean;
  clientOverride: ClientOverrideMode;
  ramMbOverride: number | null;
  javaPathOverride: string | null;
  jvmArgsOverride: string | null;
  instanceDir: string;
  createdAtEpoch: number;
  lastPlayedEpoch: number | null;
}

export interface CreateInstanceRequest {
  name: string;
  mcVersion: string;
  loader: "fabric" | "vanilla";
  fabricLoaderVersion: string | null;
  autoInstallClient: boolean;
  clientOverride?: ClientOverrideMode;
  ramMbOverride: number | null;
}

export interface UpdateInstanceRequest {
  id: string;
  name?: string;
  fabricLoaderVersion?: string;
  autoInstallClient?: boolean;
  clientOverride?: ClientOverrideMode;
  ramMbOverride?: number;
  javaPathOverride?: string;
  jvmArgsOverride?: string;
}

export interface ClientIntegrityReport {
  instanceId: string;
  mcVersion: string;
  loader: string;
  overrideMode: ClientOverrideMode;
  effectiveEnabled: boolean;
  bundleAvailable: boolean;
  bundleVersion: string | null;
  bundleSha256: string | null;
  installed: boolean;
  installedFilename: string | null;
  installedSha256: string | null;
  validZipHeader: boolean;
  hashMatchesBundle: boolean;
  updateAvailable: boolean;
  healthy: boolean;
  issues: string[];
}

export interface LaunchStatus {
  running: boolean;
  instanceId: string | null;
  instanceName: string | null;
  pid: number | null;
  exitCode: number | null;
  javaPath: string | null;
  mainClass: string | null;
  logs: string[];
}

export type ContentProjectType = "mod" | "resourcepack";

export interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  project_type: string;
  downloads: number;
  icon_url?: string;
  categories: string[];
  versions: string[];
}

export interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthDependency {
  version_id?: string;
  project_id?: string;
  dependency_type: string;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  dependencies: ModrinthDependency[];
  files: ModrinthFile[];
}

export interface InstalledContentItem {
  projectId: string | null;
  versionId: string | null;
  title: string;
  versionNumber: string;
  projectType: ContentProjectType;
  filename: string;
  enabled: boolean;
  managed: boolean;
  sha512: string | null;
  gameVersions: string[];
  loaders: string[];
  requiredDependencies: string[];
  installedAtEpoch: number;
}

export interface InstallContentResult {
  installed: InstalledContentItem[];
  skippedDependencies: string[];
}

export interface ContentUpdateInfo {
  projectId: string;
  title: string;
  projectType: ContentProjectType;
  currentVersion: string;
  latestVersionId: string;
  latestVersionNumber: string;
  filename: string;
}

export interface CompatibilityIssue {
  severity: "error" | "warning" | "info";
  filename: string;
  projectType: string;
  code: string;
  message: string;
}

export interface CompatibilityReport {
  instanceId: string;
  mcVersion: string;
  loader: string;
  compatible: boolean;
  errorCount: number;
  warningCount: number;
  issues: CompatibilityIssue[];
}

export interface PerformanceTelemetry {
  cpuBrand: string;
  cpuThreads: number;
  cpuUsagePercent: number;
  totalRamMb: number;
  usedRamMb: number;
  availableRamMb: number;
  ramUsagePercent: number;
  freeDiskGb: number;
  gpuName: string;
  gameRunning: boolean;
  gamePid: number | null;
  gameRamMb: number | null;
  gameCpuPercent: number | null;
}

export interface OptimizationPreset {
  id: string;
  name: string;
  description: string;
  recommendedRamMb: number;
  jvmArgs: string;
}

export interface RecommendedModHint {
  slug: string;
  name: string;
  reason: string;
  installed: boolean;
}

export interface OptimizationRecommendations {
  presets: OptimizationPreset[];
  recommendedRamMb: number;
  warnings: string[];
  fabricMods: RecommendedModHint[];
}

export interface DiagnosticCheckItem {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

export interface DiagnosticsReport {
  overallStatus: "healthy" | "warning" | "critical";
  healthScore: number;
  checks: DiagnosticCheckItem[];
  compatibility: CompatibilityReport | null;
  clientIntegrity: ClientIntegrityReport | null;
}

export interface CrashFinding {
  code: string;
  severity: "critical" | "warning";
  title: string;
  summary: string;
  recommendation: string;
  matchedLine: string;
}

export interface CrashAnalysisReport {
  instanceId: string;
  analyzedFile: string | null;
  crashReportsFound: number;
  findings: CrashFinding[];
  excerpt: string[];
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  channel: string;
  updateAvailable: boolean;
  publishedAt: string;
  releaseNotes: string;
  assetUrl: string;
  assetSha256: string;
  assetSizeBytes: number;
}

export interface StagedUpdateRecord {
  version: string;
  channel: string;
  stagedFile: string;
  expectedSha256: string;
  verifiedSha256: string;
  stagedAtEpoch: number;
}

export interface UpdaterStatus {
  phase:
    | "idle"
    | "checking"
    | "downloading"
    | "verifying"
    | "staged"
    | "installing"
    | "installed"
    | "rolled_back"
    | "error";
  currentVersion: string;
  availableUpdate: UpdateCheckResult | null;
  bytesDownloaded: number;
  totalBytes: number;
  progressPercent: number;
  stagedUpdate: StagedUpdateRecord | null;
  rollbackAvailable: boolean;
  lastMessage: string | null;
  lastError: string | null;
}
