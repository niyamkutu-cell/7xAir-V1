import {
  Activity,
  ArrowDownToLine,
  CheckCircle2,
  KeyRound,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AuthQuickModal } from "../components/AuthQuickModal";
import { GlassPanel } from "../components/GlassPanel";
import { NAV_ITEMS, validateSettings } from "../lib/defaults";
import {
  checkLauncherUpdate,
  downloadLauncherUpdate,
  getUpdaterStatus,
  installLauncherUpdate,
  rollbackLauncherUpdate,
} from "../lib/tauriBridge";
import { SEVEN_THEMES } from "../theme/themes";
import type {
  AppInfo,
  LauncherSettings,
  MinecraftTargetVersion,
  NavRoute,
  PlayerProfile,
  ProfileStore,
  ThemeId,
  UpdaterStatus,
} from "../types/launcher";

interface SettingsPageProps {
  appInfo: AppInfo;
  settings: LauncherSettings;
  profileStore: ProfileStore;
  activeProfile: PlayerProfile | null;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onCreateOffline: (username: string) => Promise<void>;
  onSelectProfile: (profileId: string) => Promise<void>;
  onRefreshProfiles: () => Promise<void>;
  onNavigate: (route: NavRoute) => void;
}

export function SettingsPage({
  appInfo,
  settings,
  profileStore,
  activeProfile,
  onUpdateSettings,
  onResetDefaults,
  onCreateOffline,
  onSelectProfile,
  onRefreshProfiles,
  onNavigate,
}: SettingsPageProps) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [updater, setUpdater] = useState<UpdaterStatus | null>(null);
  const [updaterBusy, setUpdaterBusy] = useState(false);
  const [updaterError, setUpdaterError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<"microsoft" | "local" | null>(null);
  const errors = validateSettings(settings);

  useEffect(() => {
    void getUpdaterStatus().then(setUpdater);
  }, []);

  useEffect(() => {
    if (!updater || (updater.phase !== "downloading" && updater.phase !== "verifying")) {
      return;
    }
    const timer = window.setInterval(() => {
      void getUpdaterStatus().then(setUpdater);
    }, 800);
    return () => window.clearInterval(timer);
  }, [updater?.phase]);

  const patchAndNotify = async (patch: Partial<LauncherSettings>, label: string) => {
    await onUpdateSettings(patch);
    setStatusMessage(`Saved: ${label}`);
  };

  const runUpdaterAction = async (fn: () => Promise<UpdaterStatus>) => {
    setUpdaterError(null);
    setUpdaterBusy(true);
    try {
      const next = await fn();
      setUpdater(next);
      if (next.lastMessage) setStatusMessage(next.lastMessage);
    } catch (err) {
      setUpdaterError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdaterBusy(false);
    }
  };

  return (
    <div className="settings-grid page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            All themes, visual toggles, accounts, performance, startup, and update preferences persist across restarts.
          </p>
        </div>
        <button
          type="button"
          className="glass-button"
          onClick={() => {
            void onResetDefaults();
            setStatusMessage("Restored all default launcher settings.");
          }}
        >
          <RotateCcw size={14} />
          Reset Settings
        </button>
      </div>

      {statusMessage && <div className="toast-banner">{statusMessage}</div>}
      {(errors.length > 0 || updaterError) && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {updaterError || errors.join(" ")}
        </div>
      )}

      {/* 1. Seven Theme Selector & Visual Effects */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Palette size={16} />
          Seven Nature Themes & Animations
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {SEVEN_THEMES.map((t) => {
            const active = settings.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`glass-panel--subtle ${active ? "theme-card--active" : ""}`}
                style={{
                  padding: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                }}
                onClick={() => void patchAndNotify({ theme: t.id as ThemeId }, `${t.name} theme`)}
              >
                <div
                  style={{
                    height: 28,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${t.accentHex}, ${t.secondaryHex})`,
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                />
                <div style={{ fontSize: 12.5, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{t.name}</span>
                  {active && <CheckCircle2 size={13} color="var(--accent)" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">
              Glass Panel Opacity ({Math.round(settings.glassOpacity * 100)}%)
            </div>
            <div className="setting-desc">
              Adjust frosted glass transparency while keeping backdrop blur GPU-friendly.
            </div>
          </div>
          <input
            type="range"
            aria-label="Glass panel opacity"
            min={0.35}
            max={0.95}
            step={0.02}
            value={settings.glassOpacity}
            onChange={(e) =>
              void patchAndNotify({ glassOpacity: Number(e.target.value) }, "Glass opacity")
            }
            style={{ width: 200 }}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Background Animations</div>
            <div className="setting-desc">
              Smooth theme crossfades and subtle environmental sky lighting.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.backgroundAnimations ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { backgroundAnimations: !settings.backgroundAnimations },
                "Background animations"
              )
            }
          >
            {settings.backgroundAnimations ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Particle Effects</div>
            <div className="setting-desc">
              Lightweight floating sakura petals, snow, mist, or fireflies matching your theme.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.particleEffects ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { particleEffects: !settings.particleEffects },
                "Particle effects"
              )
            }
          >
            {settings.particleEffects ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">3D Player Idle Rotation</div>
            <div className="setting-desc">
              Smooth automatic rotation and idle animation on the home screen 3D character.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.playerRotation ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { playerRotation: !settings.playerRotation },
                "3D player rotation"
              )
            }
          >
            {settings.playerRotation ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Reduced Motion</div>
            <div className="setting-desc">
              Disable UI hover lifts, page transitions, and 3D animations globally.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.reducedMotion ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify({ reducedMotion: !settings.reducedMotion }, "Reduced motion")
            }
          >
            {settings.reducedMotion ? "ON" : "OFF"}
          </button>
        </div>
      </GlassPanel>

      {/* 2. Account Management */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <UserCheck size={16} />
          Account Management
        </h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">
              Active Profile: {activeProfile ? activeProfile.username : "None Selected"}
            </div>
            <div className="setting-desc">
              {activeProfile
                ? activeProfile.provider === "microsoft"
                  ? "Authenticated via Official Microsoft Device Code OAuth."
                  : "Offline Local Profile (remembered automatically, no registration required)."
                : "Sign in with Microsoft or add a local offline username to play."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="glass-button glass-button--primary"
              onClick={() => setAuthModalMode("microsoft")}
            >
              <KeyRound size={14} /> Sign In
            </button>
            <button
              type="button"
              className="glass-button"
              onClick={() => setAuthModalMode("local")}
            >
              <UserCheck size={14} /> Local Profiles
            </button>
            <button
              type="button"
              className="glass-button"
              onClick={() => onNavigate("profiles")}
            >
              Manage All ({profileStore.profiles.length})
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* 3. Performance & Java Settings */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={16} />
            Performance & Java Settings
          </h2>
          <button
            type="button"
            className="glass-button"
            onClick={() => onNavigate("performance")}
          >
            Open Performance Center
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Pause Launcher Effects While Playing</div>
            <div className="setting-desc">
              Automatically stops 3D WebGL rendering, particles, and lighting while Minecraft is running or the window is minimized.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.pauseEffectsInGame ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { pauseEffectsInGame: !settings.pauseEffectsInGame },
                "Pause effects while playing"
              )
            }
          >
            {settings.pauseEffectsInGame ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Close Launcher on Game Start</div>
            <div className="setting-desc">
              Minimize memory overhead while Minecraft is running.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.closeOnLaunch ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify({ closeOnLaunch: !settings.closeOnLaunch }, "Close on launch")
            }
          >
            {settings.closeOnLaunch ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">
              Allocated RAM ({settings.allocatedRamMb} MB)
            </div>
            <div className="setting-desc">Recommended 4096 MB – 8192 MB for modded Fabric.</div>
          </div>
          <input
            type="range"
            aria-label="Allocated RAM in MB"
            min={1024}
            max={16384}
            step={512}
            value={settings.allocatedRamMb}
            onChange={(e) =>
              void patchAndNotify({ allocatedRamMb: Number(e.target.value) }, "Allocated RAM")
            }
            style={{ width: 220 }}
          />
        </div>

        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <div className="setting-label">Custom Java Executable (optional)</div>
            <div className="setting-desc">Leave blank to auto-detect managed Java 21 runtime.</div>
          </div>
          <input
            type="text"
            className="glass-input"
            style={{ maxWidth: 340 }}
            placeholder="C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe"
            value={settings.javaPath}
            onChange={(e) => void onUpdateSettings({ javaPath: e.target.value })}
          />
        </div>

        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <div className="setting-label">JVM Arguments</div>
            <div className="setting-desc">Applied to launched Minecraft instances.</div>
          </div>
          <input
            type="text"
            className="glass-input"
            style={{ maxWidth: 340 }}
            value={settings.jvmArgs}
            onChange={(e) => void onUpdateSettings({ jvmArgs: e.target.value })}
          />
        </div>
      </GlassPanel>

      {/* 4. Startup Preferences & Launch Defaults */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} />
          Startup Preferences & Fabric Client
        </h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">Initial Startup Page</div>
            <div className="setting-desc">Choose which screen opens first when 7xAir starts.</div>
          </div>
          <select
            aria-label="Initial startup page"
            className="glass-select"
            style={{ width: 180 }}
            value={settings.startupRoute}
            onChange={(e) =>
              void patchAndNotify({ startupRoute: e.target.value as NavRoute }, "Startup page")
            }
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Launch 7xAir on Windows Startup</div>
            <div className="setting-desc">
              Save preference to start 7xAir automatically when signing in to Windows.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.launchOnStartup ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { launchOnStartup: !settings.launchOnStartup },
                "Launch on Windows startup"
              )
            }
          >
            {settings.launchOnStartup ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">AUTO-INSTALL 7XAIR CLIENT MOD</div>
            <div className="setting-desc">
              ON: Automatically installs and maintains the version-matched 7xAir client inside each Fabric instance&apos;s own mods/ folder. OFF: Stops automatic installs/updates without deleting any already-installed JAR.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.autoInstallClient ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify(
                { autoInstallClient: !settings.autoInstallClient },
                "Automatic client installation"
              )
            }
          >
            {settings.autoInstallClient ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Default Minecraft Version</div>
            <div className="setting-desc">
              Supported versions: 1.21.11 and 26.2 with Fabric loader.
            </div>
          </div>
          <select
            aria-label="Default Minecraft version"
            className="glass-select"
            style={{ width: 180 }}
            value={settings.defaultMcVersion}
            onChange={(e) =>
              void patchAndNotify(
                { defaultMcVersion: e.target.value as MinecraftTargetVersion },
                "Default Minecraft version"
              )
            }
          >
            {appInfo.targetMinecraftVersions.map((ver) => (
              <option key={ver} value={ver}>
                Minecraft {ver}
              </option>
            ))}
          </select>
        </div>
      </GlassPanel>

      {/* 5. Automatic Updates, Staging & Rollback */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title">Automatic Updates, Staging & Rollback</h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">Automatic Launcher Updates</div>
            <div className="setting-desc">
              Check for SHA-256 verified Windows releases on startup. Current: v{appInfo.version}.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.autoUpdates ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void patchAndNotify({ autoUpdates: !settings.autoUpdates }, "Automatic updates")
            }
          >
            {settings.autoUpdates ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Release Channel</div>
            <div className="setting-desc">Stable channel is recommended for daily play.</div>
          </div>
          <select
            aria-label="Update release channel"
            className="glass-select"
            style={{ width: 180 }}
            value={settings.releaseChannel}
            onChange={(e) =>
              void patchAndNotify(
                { releaseChannel: e.target.value as "stable" | "beta" },
                "Release channel"
              )
            }
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button
            type="button"
            className="glass-button"
            disabled={updaterBusy}
            onClick={() => void runUpdaterAction(checkLauncherUpdate)}
          >
            {updaterBusy ? <span className="spinner-ring" /> : <RefreshCw size={14} />}
            Check for Updates
          </button>

          {updater?.availableUpdate?.updateAvailable && (
            <button
              type="button"
              className="glass-button glass-button--primary"
              disabled={updaterBusy}
              onClick={() => void runUpdaterAction(downloadLauncherUpdate)}
            >
              <ArrowDownToLine size={14} /> Download v{updater.availableUpdate.latestVersion}
            </button>
          )}

          {updater?.stagedUpdate && (
            <button
              type="button"
              className="glass-button glass-button--primary"
              disabled={updaterBusy}
              onClick={() => void runUpdaterAction(installLauncherUpdate)}
            >
              <ShieldCheck size={14} /> Install Staged v{updater.stagedUpdate.version}
            </button>
          )}

          {updater?.rollbackAvailable && (
            <button
              type="button"
              className="glass-button"
              disabled={updaterBusy}
              onClick={() => void runUpdaterAction(rollbackLauncherUpdate)}
            >
              <RotateCcw size={14} /> Rollback Last Update
            </button>
          )}
        </div>

        {updater && (
          <div style={{ marginTop: 10 }}>
            <div className="path-mono">
              Phase: {updater.phase} | Progress: {updater.progressPercent}% | Staged:{" "}
              {updater.stagedUpdate
                ? `v${updater.stagedUpdate.version} (SHA-256 ${updater.stagedUpdate.verifiedSha256.slice(0, 12)}...)`
                : "None"}{" "}
              | Rollback Snapshot: {updater.rollbackAvailable ? "Available" : "None"}
            </div>
            {(updater.phase === "downloading" ||
              updater.phase === "verifying" ||
              updater.progressPercent > 0) && (
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(100, updater.progressPercent)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </GlassPanel>

      {/* 6. Storage Paths & Reset */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <h2 className="section-title" style={{ margin: 0 }}>Windows Storage Paths</h2>
          <button
            type="button"
            className="glass-button"
            onClick={() => {
              void onResetDefaults();
              setStatusMessage("Restored all default launcher settings.");
            }}
          >
            <RotateCcw size={14} /> Reset All Settings to Defaults
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="path-mono">Root: {appInfo.paths.rootDir}</div>
          <div className="path-mono">Settings: {appInfo.paths.settingsFile}</div>
          <div className="path-mono">Instances: {appInfo.paths.instancesDir}</div>
          <div className="path-mono">Runtimes: {appInfo.paths.runtimeDir}</div>
        </div>
      </GlassPanel>

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
