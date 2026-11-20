import { useEffect, useRef, useState } from "react";
import { NatureBackdrop } from "./components/NatureBackdrop";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
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
  listInstances,
  listProfiles,
  loadLauncherSettings,
  saveLauncherSettings,
  setActiveProfile,
  stopInstance,
} from "./lib/tauriBridge";
import { HomePage } from "./pages/HomePage";
import { InstancesPage } from "./pages/InstancesPage";
import { ModrinthPage } from "./pages/ModrinthPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ThemesPage } from "./pages/ThemesPage";
import { getThemeById } from "./theme/themes";
import type {
  AppInfo,
  CreateInstanceRequest,
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
  const [route, setRoute] = useState<NavRoute>("home");
  const appliedStartupRoute = useRef(false);
  const [windowHidden, setWindowHidden] = useState<boolean>(
    typeof document !== "undefined" ? document.hidden : false
  );
  const [modrinthInstanceId, setModrinthInstanceId] = useState<string | undefined>(undefined);
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);
  const [system, setSystem] = useState<SystemSnapshot>(FALLBACK_SYSTEM_SNAPSHOT);
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS);
  const [metadata, setMetadata] = useState<MinecraftMetadataSummary | null>(null);
  const [javaList, setJavaList] = useState<JavaInstallation[]>([]);
  const [profileStore, setProfileStore] = useState<ProfileStore>({
    activeProfileId: null,
    profiles: [],
  });
  const [instances, setInstances] = useState<GameInstance[]>([]);
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
    ]).then(([info, snap, loadedSettings, meta, javas, profiles, insts, status]) => {
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

  const animationsPaused =
    windowHidden || (settings.pauseEffectsInGame && launchStatus.running);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", settings.theme);
    root.setAttribute("data-reduced-motion", String(settings.reducedMotion));
    root.setAttribute("data-animations-paused", String(animationsPaused));
    root.style.setProperty("--glass-alpha", String(settings.glassOpacity));
  }, [settings.theme, settings.glassOpacity, settings.reducedMotion, animationsPaused]);

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
    const status = await launchInstance(instanceId);
    setLaunchStatus(status);
  };

  const handleStopInstance = async () => {
    const status = await stopInstance();
    setLaunchStatus(status);
  };

  const activeTheme = getThemeById(settings.theme);
  const activeProfile =
    profileStore.profiles.find((p) => p.id === profileStore.activeProfileId) ?? null;

  return (
    <div className="launcher-shell">
      <NatureBackdrop
        theme={settings.theme}
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
              metadata={metadata}
              javaInstallations={javaList}
              settings={settings}
              launchStatus={launchStatus}
              onRefreshMetadata={async () => setMetadata(await fetchMinecraftMetadata(true))}
              onRefreshJava={async () => setJavaList(await detectJavaInstallations())}
              onRefreshInstances={handleRefreshInstances}
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
              onGoToInstances={() => setRoute("instances")}
            />
          )}
          {route === "performance" && (
            <PerformancePage
              instances={instances}
              onSettingsUpdated={setSettings}
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
            <ThemesPage settings={settings} onUpdateSettings={handleUpdateSettings} />
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
    </div>
  );
}

export default App;
