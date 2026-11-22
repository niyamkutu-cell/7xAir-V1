export type ThemeId =
  | "obsidian-violet"
  | "midnight-sky"
  | "azure-mountains"
  | "sakura-valley"
  | "emerald-wilderness"
  | "frozen-peaks"
  | "sunset-horizon"
  | "midnight-forest"
  | "dreamy-anime"
  | "midnight-anime"
  | "serenity-nature"
  | "anime-glass";

export type NavRoute =
  | "home"
  | "instances"
  | "modrinth"
  | "music"
  | "performance"
  | "client"
  | "profiles"
  | "themes"
  | "settings";

export type MinecraftTargetVersion = "1.21.11" | "26.2";

export type ClientOverrideMode = "inherit" | "force_on" | "force_off";
export type UiFontSize = "sm" | "md" | "lg" | "xl";
export type WallpaperFitMode = "cover" | "contain" | "center";
export type WallpaperPosition = "center" | "top" | "bottom" | "left" | "right";
export type ThemeSwitchMode = "manual" | "schedule" | "system";
export type FxQualityPreset = "low" | "balanced" | "high" | "maximum";

export interface CustomWallpaperItem {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
}

export interface WallpaperDefinition {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  accentHex: string;
}

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
  wallpaperId?: string;
  wallpaperDim?: number;
  fontSize?: UiFontSize;
  wallpaperFit?: WallpaperFitMode;
  wallpaperPosition?: WallpaperPosition;
  wallpaperBrightness?: number;
  wallpaperBlur?: number;
  wallpaperSaturation?: number;
  wallpaperContrast?: number;
  themeSwitchMode?: ThemeSwitchMode;
  dayTheme?: ThemeId;
  nightTheme?: ThemeId;
  dayStartHour?: number;
  nightStartHour?: number;
  fxQuality?: FxQualityPreset;
  fxDensity?: number;
  fxSpeed?: number;
  fxRainParticles?: boolean;
  fxFlyingObjects?: boolean;
  fxMusicVisualizer?: boolean;
  fxAmbientLights?: boolean;
  fxReactionIcons?: boolean;
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
  skinUrl?: string | null;
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
  loader: "fabric" | "vanilla" | "forge" | "neoforge" | "quilt";
  fabricLoaderVersion: string | null;
  autoInstallFabricLoader: boolean;
  autoInstallFabricApi: boolean;
  autoInstallClient: boolean;
  clientOverride: ClientOverrideMode;
  ramMbOverride: number | null;
  javaPathOverride: string | null;
  jvmArgsOverride: string | null;
  instanceDir: string;
  modpackId?: string | null;
  modpackName?: string | null;
  modpackVersion?: string | null;
  modpackIconUrl?: string | null;
  modpackStatus?: string | null;
  createdAtEpoch: number;
  lastPlayedEpoch: number | null;
}

export interface CreateInstanceRequest {
  name: string;
  mcVersion: string;
  loader: "fabric" | "vanilla";
  fabricLoaderVersion: string | null;
  autoInstallFabricLoader?: boolean;
  autoInstallFabricApi?: boolean;
  autoInstallClient: boolean;
  clientOverride?: ClientOverrideMode;
  ramMbOverride: number | null;
  javaPathOverride?: string | null;
  instanceDirOverride?: string | null;
}

export interface UpdateInstanceRequest {
  id: string;
  name?: string;
  fabricLoaderVersion?: string;
  autoInstallFabricLoader?: boolean;
  autoInstallFabricApi?: boolean;
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
  installedVersion: string | null;
  installedSha256: string | null;
  modsDir: string;
  validZipHeader: boolean;
  metadataValid: boolean;
  mcCompatible: boolean;
  fabricLoaderCompatible: boolean;
  duplicateCount: number;
  hashMatchesBundle: boolean;
  updateAvailable: boolean;
  lastBackupPath: string | null;
  statusMessage: string;
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

export type ContentProjectType = "mod" | "modpack" | "resourcepack";

export interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  project_type: string;
  downloads: number;
  icon_url?: string | null;
  latest_version?: string | null;
  gallery?: string[];
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
  changelog?: string | null;
  date_published?: string | null;
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
  description?: string | null;
  iconUrl?: string | null;
  projectType: ContentProjectType;
  filename: string;
  enabled: boolean;
  managed: boolean;
  modpackManaged?: boolean;
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

export interface FabricApiStatus {
  instanceId: string;
  mcVersion: string;
  autoInstallEnabled: boolean;
  installed: boolean;
  installedVersion: string | null;
  installedFilename: string | null;
  compatibleWithMcVersion: boolean;
  latestAvailableVersion: string | null;
  updateAvailable: boolean;
  status: "installed" | "not_installed" | "update_available" | "unavailable" | "disabled" | "vanilla";
  message: string;
}

export interface InstallModpackRequest {
  projectId: string;
  versionId: string;
  modpackName: string;
  instanceName: string;
  iconUrl?: string | null;
  mcVersionOverride?: string | null;
  loaderOverride?: string | null;
  loaderVersionOverride?: string | null;
  instanceDirOverride?: string | null;
}

export interface ModpackInstallProgress {
  active: boolean;
  modpackName: string | null;
  stage: string;
  completedFiles: number;
  totalFiles: number;
  percent: number;
  installedModCount: number;
  createdInstanceId: string | null;
  error: string | null;
}

export interface InstallModpackResult {
  instance: GameInstance;
  installedFiles: number;
  installedMods: number;
  extractedOverrides: number;
  mcVersion: string;
  loader: string;
  loaderVersion: string | null;
}

export interface ModpackFileConflict {
  path: string;
  reason: string;
}

export interface ModpackStatusReport {
  isModpack: boolean;
  projectId: string | null;
  modpackName: string | null;
  author: string | null;
  versionId: string | null;
  versionNumber: string | null;
  mcVersion: string;
  loader: string;
  loaderVersion: string | null;
  managedFileCount: number;
  userAddedFileCount: number;
  userModifiedFiles: string[];
  backupAvailable: boolean;
  modpackPageUrl: string | null;
}

export interface ModpackUpdateInfo {
  instanceId: string;
  projectId: string;
  modpackName: string;
  currentVersion: string;
  updateAvailable: boolean;
  latestVersionId: string | null;
  latestVersionNumber: string | null;
  changelog: string | null;
  compatible: boolean;
  compatibilityMessage: string;
  conflicts: ModpackFileConflict[];
}

export interface MsaAuthConfigStatus {
  configured: boolean;
  source: "env" | "build" | "dotenv" | "config_file" | "invalid" | "missing";
  diagnostic: string;
  setupDoc: string;
}

export interface ModAuditFinding {
  severity: "conflict" | "redundant" | "warning";
  title: string;
  modsInvolved: string[];
  recommendation: string;
}

export interface ModAuditReport {
  instanceId: string;
  totalMods: number;
  findings: ModAuditFinding[];
}

export interface GraphicsOptions {
  renderDistance: number;
  simulationDistance: number;
  particles: number;
  entityDistanceScaling: number;
  renderClouds: string;
  graphicsMode: number;
  entityShadows: boolean;
  enableVsync: boolean;
  maxFps: number;
}

export type MusicProviderId = "audius" | "deezer" | "spotify";
export type MusicRepeatMode = "off" | "all" | "one";
export type MusicSearchMode = "all" | "song" | "artist";

export interface MusicTrack {
  id: string;
  provider: MusicProviderId;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  durationSec: number;
  streamUrl: string | null;
  externalUrl: string | null;
  playbackQuality: string;
  isPreview: boolean;
  uri: string | null;
}

export interface MusicCollection {
  id: string;
  provider: MusicProviderId;
  kind: "playlist" | "album";
  title: string;
  subtitle: string;
  artworkUrl: string | null;
  trackCount: number;
  externalUrl: string | null;
}

export interface MusicDiscoveryResponse {
  provider: MusicProviderId;
  popular: MusicTrack[];
  recommended: MusicTrack[];
  playlists: MusicCollection[];
  albums: MusicCollection[];
  notice: string | null;
}

export interface MusicSearchResponse {
  provider: MusicProviderId;
  query: string;
  searchMode: MusicSearchMode;
  tracks: MusicTrack[];
  albums: MusicCollection[];
  playlists: MusicCollection[];
}

export interface MusicPreferences {
  preferredProvider: MusicProviderId;
  volume: number;
  shuffle: boolean;
  repeatMode: MusicRepeatMode;
  pauseOnMinecraftLaunch: boolean;
  stopOnLauncherClose: boolean;
}

export interface SpotifyConnectionInfo {
  connected: boolean;
  clientIdConfigured: boolean;
  clientIdSource: string | null;
  displayName: string | null;
  product: string | null;
  premiumRequiredNote: string;
  redirectUri: string;
}

export interface MusicStateSnapshot {
  preferences: MusicPreferences;
  recentlyPlayed: MusicTrack[];
  spotify: SpotifyConnectionInfo;
}

export interface ProcessMemoryEntry {
  pid: number;
  name: string;
  ramMb: number;
  cpuPercent: number;
  isJava: boolean;
  isProtected: boolean;
  note: string;
}

export interface SystemMemoryAudit {
  totalRamMb: number;
  usedRamMb: number;
  availableRamMb: number;
  gpuUsagePercent: number | null;
  diskActivityMbS: number | null;
  liveFps: number | null;
  liveFrameTimeMs: number | null;
  javaProcesses: ProcessMemoryEntry[];
  topBackgroundConsumers: ProcessMemoryEntry[];
  recommendations: string[];
}

export interface CleanupCategoryPreview {
  id: string;
  label: string;
  description: string;
  fileCount: number;
  totalBytes: number;
  sampleFiles: string[];
}

export interface CleanupScanReport {
  totalFiles: number;
  totalBytes: number;
  usedRamMbBefore: number;
  availableRamMbBefore: number;
  categories: CleanupCategoryPreview[];
  safetyNote: string;
}

export interface CleanupExecutionResult {
  deletedFiles: number;
  freedBytes: number;
  skippedFiles: number;
  usedRamMbBefore: number;
  usedRamMbAfter: number;
  availableRamMbBefore: number;
  availableRamMbAfter: number;
  appliedCategories: string[];
  summary: string;
}

export interface JvmValidationReport {
  valid: boolean;
  warnings: string[];
  errors: string[];
  recommendedRamMb: number;
}

export interface JvmBackupEntry {
  id: string;
  createdAtEpoch: number;
  label: string;
  previousJvmArgs: string;
  previousRamMb: number;
  appliedJvmArgs: string;
  appliedRamMb: number;
}
