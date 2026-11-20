import {
  Boxes,
  CheckCircle2,
  Cpu,
  FolderOpen,
  HardDrive,
  KeyRound,
  Palette,
  Play,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { AuthQuickModal } from "../components/AuthQuickModal";
import { GlassPanel } from "../components/GlassPanel";
import { SkinViewer3D } from "../components/SkinViewer3D";
import { openInstanceFolder } from "../lib/tauriBridge";
import { getThemeById } from "../theme/themes";
import type {
  AppInfo,
  GameInstance,
  JavaInstallation,
  LauncherSettings,
  LaunchStatus,
  NavRoute,
  PlayerProfile,
  ProfileStore,
  SystemSnapshot,
} from "../types/launcher";

interface HomePageProps {
  appInfo: AppInfo;
  system: SystemSnapshot;
  settings: LauncherSettings;
  profileStore: ProfileStore;
  activeProfile: PlayerProfile | null;
  instances: GameInstance[];
  javaInstallations: JavaInstallation[];
  launchStatus: LaunchStatus;
  animationsPaused: boolean;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onCreateOffline: (username: string) => Promise<void>;
  onSelectProfile: (profileId: string) => Promise<void>;
  onRefreshProfiles: () => Promise<void>;
  onLaunchInstance: (instanceId: string) => Promise<void>;
  onStopInstance: () => Promise<void>;
  onNavigate: (route: NavRoute) => void;
}

export function HomePage({
  appInfo,
  system,
  settings,
  profileStore,
  activeProfile,
  instances,
  javaInstallations,
  launchStatus,
  animationsPaused,
  onUpdateSettings,
  onCreateOffline,
  onSelectProfile,
  onRefreshProfiles,
  onLaunchInstance,
  onStopInstance,
  onNavigate,
}: HomePageProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    instances[0]?.id ?? ""
  );
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<"microsoft" | "local" | null>(null);
  const activeTheme = getThemeById(settings.theme);

  const selectedInstance =
    instances.find((i) => i.id === selectedInstanceId) ?? instances[0] ?? null;
  const effectiveInstanceId = selectedInstance?.id ?? "";
  const recommendedJava = javaInstallations[0];

  const handleQuickLaunch = async () => {
    setLaunchError(null);
    if (!effectiveInstanceId) {
      onNavigate("instances");
      return;
    }
    setLaunching(true);
    try {
      await onLaunchInstance(effectiveInstanceId);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Clean Top Bar: Welcome + Username on Left, SIGN IN & PLAY LOCALLY on Right */}
      <GlassPanel className="home-topbar">
        <div className="home-welcome-block">
          <h1 className="home-welcome-title">
            <span>
              Welcome{activeProfile ? `, ${activeProfile.username}` : " to 7xAir"}
            </span>
            {activeProfile ? (
              <span
                className={`auth-status-badge ${
                  activeProfile.provider === "microsoft"
                    ? "auth-status-badge--verified"
                    : "auth-status-badge--offline"
                }`}
              >
                {activeProfile.provider === "microsoft" ? (
                  <>
                    <CheckCircle2 size={12} />
                    Microsoft Verified
                  </>
                ) : (
                  <>
                    <UserCheck size={12} />
                    Offline Local
                  </>
                )}
              </span>
            ) : (
              <span className="auth-status-badge">No Profile Selected</span>
            )}
          </h1>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            7xAir Launcher v{appInfo.version} · Supported Minecraft:{" "}
            {appInfo.targetMinecraftVersions.join(" & ")} (Fabric)
          </span>
        </div>

        <div className="home-auth-actions">
          <button
            type="button"
            className="glass-button glass-button--primary"
            onClick={() => setAuthModalMode("microsoft")}
          >
            <KeyRound size={14} />
            SIGN IN
          </button>
          <button
            type="button"
            className="glass-button"
            onClick={() => setAuthModalMode("local")}
          >
            <UserCheck size={14} />
            PLAY LOCALLY
          </button>
        </div>
      </GlassPanel>

      {/* Main 2-Column Showcase: Launch Control Panel + Interactive 3D Character */}
      <div className="home-showcase-grid">
        <GlassPanel className="home-launch-panel">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="glass-pill">
                <Sparkles size={12} />
                {activeTheme.name}
              </span>
              {selectedInstance && (
                <span className="nav-badge">
                  MC {selectedInstance.mcVersion} · Fabric {selectedInstance.fabricLoaderVersion}
                </span>
              )}
            </div>

            <div>
              <h2 className="hero-heading" style={{ marginTop: 4 }}>
                {selectedInstance ? selectedInstance.name : "Ready for Flight"}
              </h2>
              <p className="hero-copy">
                {selectedInstance
                  ? `Isolated Fabric instance targeting Minecraft ${selectedInstance.mcVersion} with translucent glass HUD panels and automatic client integrity verification.`
                  : "Create your first isolated Fabric instance for Minecraft 1.21.11 or 26.2 to launch with 7xAir."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="home-instance-row">
              {instances.length > 0 && (
                <select
                  aria-label="Select Minecraft instance"
                  className="glass-select"
                  style={{ flex: "1 1 220px", maxWidth: 290 }}
                  value={effectiveInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} — MC {inst.mcVersion}
                    </option>
                  ))}
                </select>
              )}

              {launchStatus.running ? (
                <button
                  type="button"
                  className="play-btn-hero play-btn-hero--stop"
                  onClick={() => void onStopInstance()}
                >
                  <Square size={17} />
                  STOP (PID {launchStatus.pid})
                </button>
              ) : (
                <button
                  type="button"
                  className="play-btn-hero"
                  disabled={launching}
                  onClick={() => void handleQuickLaunch()}
                >
                  {launching ? (
                    <>
                      <span className="spinner-ring" style={{ borderTopColor: "#050c14" }} />
                      LAUNCHING...
                    </>
                  ) : (
                    <>
                      <Play size={18} fill="currentColor" />
                      {effectiveInstanceId ? "PLAY" : "CREATE INSTANCE"}
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="hero-controls">
              <button
                type="button"
                className={`toggle-btn ${settings.autoInstallClient ? "toggle-btn--on" : ""}`}
                onClick={() =>
                  void onUpdateSettings({ autoInstallClient: !settings.autoInstallClient })
                }
              >
                Auto-Install 7xAir Client: {settings.autoInstallClient ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                className="glass-button"
                onClick={() => onNavigate("modrinth")}
              >
                Browse Modrinth
              </button>

              <button
                type="button"
                className="glass-button"
                onClick={() => onNavigate("instances")}
              >
                Instances
              </button>

              {selectedInstance && (
                <button
                  type="button"
                  className="glass-button"
                  onClick={() =>
                    void openInstanceFolder(selectedInstance.id).catch((err) =>
                      setLaunchError(err instanceof Error ? err.message : String(err))
                    )
                  }
                >
                  <FolderOpen size={14} />
                  Open Folder
                </button>
              )}

              <button
                type="button"
                className="glass-button"
                onClick={() => onNavigate("settings")}
              >
                <Sliders size={14} />
                Settings
              </button>
            </div>

            {launchError && (
              <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
                {launchError}
              </div>
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="skin-pedestal">
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="stat-label">3D Character</span>
            <span className="nav-badge">
              {activeProfile ? activeProfile.username : "Guest"}
            </span>
          </div>

          <SkinViewer3D
            username={activeProfile?.username ?? "AirPlayer"}
            autoRotate={settings.playerRotation}
            reducedMotion={settings.reducedMotion}
            paused={animationsPaused}
          />
        </GlassPanel>
      </div>

      {/* Launcher Status & Profile Bento Strip */}
      <div className="stats-grid">
        <GlassPanel className="stat-card" interactive>
          <div className="stat-head">
            <span className="stat-label">Allocated RAM</span>
            <HardDrive size={14} />
          </div>
          <span className="stat-value">{(settings.allocatedRamMb / 1024).toFixed(1)} GB</span>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <div className="stat-head">
            <span className="stat-label">Java Runtime</span>
            <Cpu size={14} />
          </div>
          <span className="stat-value">
            {recommendedJava ? `Java ${recommendedJava.majorVersion}` : "Not Found"}
          </span>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <div className="stat-head">
            <span className="stat-label">Instances</span>
            <Boxes size={14} />
          </div>
          <span className="stat-value">{instances.length} Managed</span>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <div className="stat-head">
            <span className="stat-label">Active Theme</span>
            <Palette size={14} />
          </div>
          <span className="stat-value">{activeTheme.name}</span>
        </GlassPanel>
      </div>

      <div className="two-col-grid">
        <GlassPanel className="panel-pad" interactive>
          <h2 className="section-title">Per-Instance Fabric Client</h2>
          <p className="hero-copy">
            7xAir automatically installs, verifies, and updates its translucent glass Fabric client
            per instance when enabled. Host:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {system.os} ({system.cpuThreads} threads)
            </strong>
            .
          </p>
        </GlassPanel>

        <GlassPanel className="panel-pad" interactive>
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} />
            Windows Data Root
          </h2>
          <p className="hero-copy" style={{ marginBottom: 10 }}>
            Isolated instances, profiles, libraries, and managed client bundles live under:
          </p>
          <div className="path-mono">{appInfo.paths.rootDir}</div>
        </GlassPanel>
      </div>

      {authModalMode && (
        <AuthQuickModal
          mode={authModalMode}
          profileStore={profileStore}
          onClose={() => setAuthModalMode(null)}
          onCreateOffline={onCreateOffline}
          onSelectProfile={onSelectProfile}
          onRefreshProfiles={onRefreshProfiles}
        />
      )}
    </div>
  );
}
