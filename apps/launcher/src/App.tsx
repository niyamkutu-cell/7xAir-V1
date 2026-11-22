import { useEffect, useRef, useState } from "react";
import { AtmosphereOverlay } from "./components/AtmosphereOverlay";
import { InteractionLayer } from "./components/InteractionLayer";
import { MusicPlayerBar } from "./components/MusicPlayerBar";
import { NatureBackdrop } from "./components/NatureBackdrop";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { MusicPlayerProvider, useMusicPlayer } from "./context/MusicPlayerContext";
import {
  DEFAULT_SETTINGS,
  EMPTY_LAUNCH_STATUS,
  FALLBACK_APP_INFO,
  FALLBACK_SYSTEM_SNAPSHOT,
} from "./lib/defaults";
import {
  cloneInstance,
  createInstance,
  createOfflineProfile,
  deleteInstance,
  deleteProfile,
  detectJavaInstallations,
  fetchAppInfo,
  fetchMinecraftMetadata,
  fetchSystemSnapshot,
  getLaunchStatus,
  getRuntimeMode,
  launchInstance,
  listCustomWallpapers,
  listInstances,
  listProfiles,
  loadCustomization,
  loadLauncherSettings,
  saveCustomization,
  saveLauncherSettings,
  setActiveProfile,
  stopInstance,
} from "./lib/tauriBridge";
import { ClientSettingsPage } from "./pages/ClientSettingsPage";
import { HomePage } from "./pages/HomePage";
import { InstancesPage } from "./pages/InstancesPage";
import { ModrinthPage } from "./pages/ModrinthPage";
import { MusicPage } from "./pages/MusicPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ThemesPage } from "./pages/ThemesPage";
import {
  applyCustomizationToDocument,
  DEFAULT_CUSTOMIZATION,
  migrateCustomization,
  registerCustomFontFace,
  type CustomizationState,
} from "./lib/customization";
import { getThemeById } from "./theme/themes";
import type {
  AppInfo,
  CreateInstanceRequest,
  CustomWallpaperItem,
  GameInstance,
  JavaInstallation,
  LauncherSettings,
  LaunchStatus,
  MinecraftMetadataSummary,
  NavRoute,
  ProfileStore,
  SystemSnapshot,
} from "./types/launcher";

export function App() {
  return (
    <MusicPlayerProvider>
      <AppShell />
    </MusicPlayerProvider>
  );
}

function AppShell() {
  const { onMinecraftLaunch, isPlaying: musicIsPlaying } = useMusicPlayer();
  const [route, setRoute] = useState<NavRoute>("home");
  const appliedStartupRoute = useRef(false);
  const [windowHidden, setWindowHidden] = useState<boolean>(
    typeof document !== "undefined" ? document.hidden : false
  );
  const [modrinthInstanceId, setModrinthInstanceId] = useState<string | undefined>(undefined);
  const [openModsInstanceId, setOpenModsInstanceId] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);
  const [system, setSystem] = useState<SystemSnapshot>(FALLBACK_SYSTEM_SNAPSHOT);
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS);
  const [metadata, setMetadata] = useState<MinecraftMetadataSummary | null>(null);
  const [javaList, setJavaList] = useState<JavaInstallation[]>([]);
  const [profileStore, setProfileStore] = useState<ProfileStore>({
    activeProfileId: null,
    profiles: [],
  });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [instances, setInstances] = useState<GameInstance[]>([]);
  const [customWallpapers, setCustomWallpapers] = useState<CustomWallpaperItem[]>([]);
  const [customization, setCustomization] = useState<CustomizationState>(DEFAULT_CUSTOMIZATION);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true
  );
  const [currentHour, setCurrentHour] = useState<number>(() => new Date().getHours());
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>(EMPTY_LAUNCH_STATUS);
  const runtimeMode = getRuntimeMode();

  // Pause unnecessary animations when window is minimized/hidden
  useEffect(() => {
    const handleVisibility = () => setWindowHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchAppInfo(),
      fetchSystemSnapshot(),
      loadLauncherSettings(),
      fetchMinecraftMetadata(false),
      detectJavaInstallations(),
      listProfiles(),
      listInstances(),
      getLaunchStatus(),
      listCustomWallpapers().catch(() => []),
      loadCustomization().catch(() => ({ schemaVersion: 1 })),
    ]).then(([info, snap, loadedSettings, meta, javas, profiles, insts, status, wallpapers, rawCustom]) => {
      if (!active) return;
      setAppInfo(info);
      setSystem(snap);
      const mergedSettings: LauncherSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      setSettings(mergedSettings);
      if (!appliedStartupRoute.current && mergedSettings.startupRoute) {
        appliedStartupRoute.current = true;
        setRoute(mergedSettings.startupRoute);
      }
      setMetadata(meta);
      setJavaList(javas);
      setProfileStore(profiles);
      setInstances(insts);
      setLaunchStatus(status);
      setCustomWallpapers(wallpapers);
      const migrated = migrateCustomization(rawCustom);
      setCustomization(migrated);
      applyCustomizationToDocument(migrated);
      setInitialLoaded(true);
      if (migrated.text.customFontName && migrated.text.customFontDataUrl) {
        void registerCustomFontFace(migrated.text.customFontName, migrated.text.customFontDataUrl).catch(() => {});
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!launchStatus.running) return;
    const timer = window.setInterval(() => {
      void getLaunchStatus().then(setLaunchStatus);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [launchStatus.running]);

  // Track Windows system light/dark mode & local hour for Automatic Theme Switching
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    const clock = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => {
      mq.removeEventListener("change", onChange);
      window.clearInterval(clock);
    };
  }, []);

  const effectiveTheme = (() => {
    const mode = settings.themeSwitchMode ?? "manual";
    const dayT = settings.dayTheme ?? "serenity-nature";
    const nightT = settings.nightTheme ?? "midnight-anime";
    if (mode === "system") {
      return systemPrefersDark ? nightT : dayT;
    }
    if (mode === "schedule") {
      const start = settings.dayStartHour ?? 7;
      const end = settings.nightStartHour ?? 19;
      const isDay =
        start < end
          ? currentHour >= start && currentHour < end
          : currentHour >= start || currentHour < end;
      return isDay ? dayT : nightT;
    }
    return settings.theme;
  })();

  const animationsPaused =
    windowHidden || (settings.pauseEffectsInGame && launchStatus.running);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", effectiveTheme);
    root.setAttribute("data-font-size", settings.fontSize ?? "md");
    root.setAttribute("data-reduced-motion", String(settings.reducedMotion));
    root.setAttribute("data-animations-paused", String(animationsPaused));
    root.style.setProperty("--glass-alpha", String(settings.glassOpacity));
    root.style.setProperty("--wallpaper-dim", String(settings.wallpaperDim ?? 0.56));
  }, [
    effectiveTheme,
    settings.fontSize,
    settings.glassOpacity,
    settings.wallpaperDim,
    settings.reducedMotion,
    animationsPaused,
  ]);

  const handleRefreshInstances = async () => {
    setInstances(await listInstances());
  };

  const handleUpdateSettings = async (patch: Partial<LauncherSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const saved = await saveLauncherSettings(next);
    setSettings({ ...DEFAULT_SETTINGS, ...saved });
    if (patch.autoInstallClient !== undefined) {
      await handleRefreshInstances();
    }
  };

  const handleResetDefaults = async () => {
    const reset = {
      ...DEFAULT_SETTINGS,
      gameDir: appInfo.paths.instancesDir,
    };
    setSettings(reset);
    await saveLauncherSettings(reset);
    await handleRefreshInstances();
  };

  const handleCreateOfflineProfile = async (username: string) => {
    const updated = await createOfflineProfile(username);
    setProfileStore(updated);
  };

  const handleSelectProfile = async (profileId: string) => {
    const updated = await setActiveProfile(profileId);
    setProfileStore(updated);
  };

  const handleDeleteProfile = async (profileId: string) => {
    const updated = await deleteProfile(profileId);
    setProfileStore(updated);
  };

  const handleRefreshProfiles = async () => {
    setProfileStore(await listProfiles());
  };

  const handleCreateInstance = async (req: CreateInstanceRequest) => {
    const created = await createInstance(req);
    setInstances((prev) => [...prev, created]);
  };

  const handleCloneInstance = async (sourceId: string, newName: string) => {
    const cloned = await cloneInstance(sourceId, newName);
    setInstances((prev) => [...prev, cloned]);
  };

  const handleDeleteInstance = async (instanceId: string) => {
    await deleteInstance(instanceId);
    setInstances((prev) => prev.filter((i) => i.id !== instanceId));
  };

  const handleManageContent = (instanceId: string) => {
    setModrinthInstanceId(instanceId);
    setRoute("modrinth");
  };

  const handleLaunchInstance = async (instanceId: string) => {
    onMinecraftLaunch();
    const status = await launchInstance(instanceId);
    setLaunchStatus(status);
  };

  const handleStopInstance = async () => {
    const status = await stopInstance();
    setLaunchStatus(status);
  };

  const activeTheme = getThemeById(effectiveTheme);
  const activeProfile =
    profileStore.profiles.find((p) => p.id === profileStore.activeProfileId) ?? null;

  return (
    <div className="launcher-shell">
      <NatureBackdrop
        theme={effectiveTheme}
        wallpaperId={settings.wallpaperId ?? "auto"}
        wallpaperDim={settings.wallpaperDim ?? 0.56}
        wallpaperFit={settings.wallpaperFit ?? "cover"}
        wallpaperPosition={settings.wallpaperPosition ?? "center"}
        wallpaperBrightness={settings.wallpaperBrightness ?? 1.0}
        wallpaperBlur={settings.wallpaperBlur ?? 0}
        wallpaperSaturation={settings.wallpaperSaturation ?? 1.08}
        wallpaperContrast={settings.wallpaperContrast ?? 1.04}
        customWallpapers={customWallpapers}
        backgroundAnimations={settings.backgroundAnimations && !settings.reducedMotion}
        particleEffects={settings.particleEffects && !settings.reducedMotion}
        paused={animationsPaused}
      />
      <TitleBar
        version={appInfo.version}
        runtimeMode={runtimeMode}
        runningInstanceName={launchStatus.running ? launchStatus.instanceName : null}
      />

      <div className="launcher-body">
        <Sidebar
          activeRoute={route}
          onNavigate={setRoute}
          activeThemeName={activeTheme.name}
          autoInstallClient={settings.autoInstallClient}
          activeProfile={activeProfile}
          instanceCount={instances.length}
        />

        <main className="content-viewport">
          {route === "home" && (
            <HomePage
              appInfo={appInfo}
              system={system}
              settings={settings}
              profileStore={profileStore}
              activeProfile={activeProfile}
              instances={instances}
              javaInstallations={javaList}
              launchStatus={launchStatus}
              animationsPaused={animationsPaused}
              onUpdateSettings={handleUpdateSettings}
              onCreateOffline={handleCreateOfflineProfile}
              onSelectProfile={handleSelectProfile}
              onRefreshProfiles={handleRefreshProfiles}
              onLaunchInstance={handleLaunchInstance}
              onStopInstance={handleStopInstance}
              onNavigate={setRoute}
            />
          )}
          {route === "instances" && (
            <InstancesPage
              instances={instances}
              initialModsInstanceId={openModsInstanceId}
              metadata={metadata}
              javaInstallations={javaList}
              settings={settings}
              launchStatus={launchStatus}
              onRefreshMetadata={async () => setMetadata(await fetchMinecraftMetadata(true))}
              onRefreshJava={async () => setJavaList(await detectJavaInstallations())}
              onRefreshInstances={handleRefreshInstances}
              onUpdateSettings={handleUpdateSettings}
              onCreateInstance={handleCreateInstance}
              onCloneInstance={handleCloneInstance}
              onDeleteInstance={handleDeleteInstance}
              onManageContent={handleManageContent}
              onLaunchInstance={handleLaunchInstance}
              onStopInstance={handleStopInstance}
            />
          )}
          {route === "modrinth" && (
            <ModrinthPage
              instances={instances}
              initialInstanceId={modrinthInstanceId}
              onGoToInstances={() => {
                setOpenModsInstanceId(null);
                setRoute("instances");
              }}
              onOpenInstanceMods={(instId) => {
                setOpenModsInstanceId(instId);
                setRoute("instances");
              }}
              onRefreshInstances={handleRefreshInstances}
            />
          )}
          {route === "music" && <MusicPage />}
          {route === "performance" && (
            <PerformancePage
              instances={instances}
              settings={settings}
              javaInstallations={javaList}
              onSettingsUpdated={setSettings}
              onUpdateSettings={handleUpdateSettings}
              onRefreshInstances={handleRefreshInstances}
            />
          )}
          {route === "client" && (
            <ClientSettingsPage
              settings={settings}
              instances={instances}
              onUpdateSettings={handleUpdateSettings}
              onRefreshInstances={handleRefreshInstances}
            />
          )}
          {route === "profiles" && (
            <ProfilesPage
              profileStore={profileStore}
              onCreateOffline={handleCreateOfflineProfile}
              onSelectProfile={handleSelectProfile}
              onDeleteProfile={handleDeleteProfile}
              onRefreshProfiles={handleRefreshProfiles}
            />
          )}
          {route === "themes" && (
            <ThemesPage
              settings={settings}
              effectiveTheme={effectiveTheme}
              customWallpapers={customWallpapers}
              customization={customization}
              onSaveCustomization={async (next) => {
                setCustomization(next);
                applyCustomizationToDocument(next);
                await saveCustomization(next as unknown as Record<string, unknown>);
              }}
              onRefreshWallpapers={async () => setCustomWallpapers(await listCustomWallpapers())}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
          {route === "settings" && (
            <SettingsPage
              appInfo={appInfo}
              settings={settings}
              profileStore={profileStore}
              activeProfile={activeProfile}
              onUpdateSettings={handleUpdateSettings}
              onResetDefaults={handleResetDefaults}
              onCreateOffline={handleCreateOfflineProfile}
              onSelectProfile={handleSelectProfile}
              onRefreshProfiles={handleRefreshProfiles}
              onNavigate={setRoute}
            />
          )}
        </main>
      </div>
      <AtmosphereOverlay
        theme={effectiveTheme}
        paused={animationsPaused}
        reducedMotion={settings.reducedMotion}
        musicPlaying={musicIsPlaying}
        fxQuality={settings.fxQuality ?? "balanced"}
        fxDensity={settings.fxDensity ?? 1.0}
        fxSpeed={settings.fxSpeed ?? 1.0}
        fxRainParticles={settings.fxRainParticles ?? true}
        fxFlyingObjects={settings.fxFlyingObjects ?? true}
        fxMusicVisualizer={settings.fxMusicVisualizer ?? true}
        fxAmbientLights={settings.fxAmbientLights ?? true}
        fxReactionIcons={settings.fxReactionIcons ?? true}
      />
      {!initialLoaded && (
        <div className="theme-loading-screen" role="status" aria-label="Loading 7xAir">
          <div className="glass-panel panel-pad" style={{ textAlign: "center", minWidth: 260 }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>7xAir</div>
            <div className="progress-track-animated" />
          </div>
        </div>
      )}
      <InteractionLayer
        audio={customization.audio}
        reducedMotion={settings.reducedMotion}
        hoverAnimation={customization.animations.hoverAnimation}
      />
      <MusicPlayerBar />
    </div>
  );
}

export default App;
