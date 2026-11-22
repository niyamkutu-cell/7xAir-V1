import {
  AlertTriangle,
  Box,
  Copy,
  Download,
  FolderOpen,
  Package,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sliders,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { InstanceModsView } from "../components/InstanceModsView";
import {
  fetchFabricLoaders,
  getInstanceFabricApiStatus,
  listInstanceContent,
  openInstanceFolder,
  syncInstanceFabricApi,
  updateInstance,
} from "../lib/tauriBridge";
import type {
  ClientOverrideMode,
  CreateInstanceRequest,
  FabricApiStatus,
  FabricLoaderOption,
  GameInstance,
  JavaInstallation,
  LauncherSettings,
  LaunchStatus,
  MinecraftMetadataSummary,
} from "../types/launcher";

interface InstancesPageProps {
  instances: GameInstance[];
  initialModsInstanceId?: string | null;
  metadata: MinecraftMetadataSummary | null;
  javaInstallations: JavaInstallation[];
  settings: LauncherSettings;
  launchStatus: LaunchStatus;
  onRefreshMetadata: () => Promise<void>;
  onRefreshJava: () => Promise<void>;
  onRefreshInstances: () => Promise<void>;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onCreateInstance: (req: CreateInstanceRequest) => Promise<void>;
  onCloneInstance: (sourceId: string, newName: string) => Promise<void>;
  onDeleteInstance: (instanceId: string) => Promise<void>;
  onManageContent: (instanceId: string) => void;
  onLaunchInstance: (instanceId: string) => Promise<void>;
  onStopInstance: () => Promise<void>;
}

const SUPPORTED_VERSIONS = ["1.21.11", "26.2"] as const;

export function InstancesPage({
  instances,
  initialModsInstanceId,
  metadata,
  javaInstallations,
  settings,
  launchStatus,
  onRefreshMetadata,
  onRefreshJava,
  onRefreshInstances,
  onUpdateSettings,
  onCreateInstance,
  onCloneInstance,
  onDeleteInstance,
  onManageContent,
  onLaunchInstance,
  onStopInstance,
}: InstancesPageProps) {
  const [name, setName] = useState("7xAir Fabric 1.21.11");
  const [mcVersion, setMcVersion] = useState<string>(settings.defaultMcVersion || "1.21.11");
  const [loader, setLoader] = useState<"fabric" | "vanilla">("fabric");
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderOption[]>([]);
  const [selectedFabric, setSelectedFabric] = useState<string>("");
  const [autoInstallFabricLoader, setAutoInstallFabricLoader] = useState<boolean>(true);
  const [autoInstallFabricApi, setAutoInstallFabricApi] = useState<boolean>(true);
  const [createJavaPath, setCreateJavaPath] = useState<string>("");
  const [createInstanceDir, setCreateInstanceDir] = useState<string>("");
  const [ramOverride, setRamOverride] = useState<string>("");
  const [modCounts, setModCounts] = useState<Record<string, number>>({});
  const [fabricApiStatuses, setFabricApiStatuses] = useState<Record<string, FabricApiStatus>>({});
  const [syncingApiId, setSyncingApiId] = useState<string | null>(null);

  const [editingInstance, setEditingInstance] = useState<GameInstance | null>(null);
  const [editName, setEditName] = useState("");
  const [editFabricLoader, setEditFabricLoader] = useState("");
  const [editFabricLoadersList, setEditFabricLoadersList] = useState<FabricLoaderOption[]>([]);
  const [editAutoFabricLoader, setEditAutoFabricLoader] = useState(true);
  const [editAutoFabricApi, setEditAutoFabricApi] = useState(true);
  const [editRam, setEditRam] = useState("");
  const [editJavaPath, setEditJavaPath] = useState("");
  const [editJvmArgs, setEditJvmArgs] = useState("");
  const [editClientOverride, setEditClientOverride] = useState<ClientOverrideMode>("inherit");
  const [confirmDelete, setConfirmDelete] = useState<GameInstance | null>(null);
  const [modsInstanceId, setModsInstanceId] = useState<string | null>(initialModsInstanceId ?? null);

  useEffect(() => {
    if (initialModsInstanceId) setModsInstanceId(initialModsInstanceId);
  }, [initialModsInstanceId]);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loader !== "fabric") return;
    let active = true;
    void fetchFabricLoaders(mcVersion).then((list) => {
      if (!active) return;
      setFabricLoaders(list);
      if (list.length > 0 && !list.some((l) => l.version === selectedFabric)) {
        setSelectedFabric(list[0].version);
      }
    });
    return () => {
      active = false;
    };
  }, [mcVersion, loader]);

  useEffect(() => {
    if (!editingInstance || editingInstance.loader !== "fabric") return;
    let active = true;
    void fetchFabricLoaders(editingInstance.mcVersion).then((list) => {
      if (!active) return;
      setEditFabricLoadersList(list);
    });
    return () => {
      active = false;
    };
  }, [editingInstance]);

  // Fetch real installed mod count and Fabric API status per instance
  const refreshPerInstanceStatus = async (list: GameInstance[]) => {
    const pairs = await Promise.all(
      list.map(async (inst) => {
        let count = 0;
        let apiStatus: FabricApiStatus | null = null;
        try {
          const items = await listInstanceContent(inst.id);
          count = items.filter((item) => item.projectType === "mod").length;
        } catch {
          count = 0;
        }
        try {
          apiStatus = await getInstanceFabricApiStatus(inst.id);
        } catch {
          apiStatus = null;
        }
        return [inst.id, count, apiStatus] as const;
      })
    );
    const nextCounts: Record<string, number> = {};
    const nextApi: Record<string, FabricApiStatus> = {};
    for (const [id, count, api] of pairs) {
      nextCounts[id] = count;
      if (api) nextApi[id] = api;
    }
    setModCounts(nextCounts);
    setFabricApiStatuses(nextApi);
  };

  useEffect(() => {
    let active = true;
    void refreshPerInstanceStatus(instances).then(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [instances]);

  const handleCreate = async () => {
    setError(null);
    setNotice(null);
    try {
      await onCreateInstance({
        name: name.trim() || `7xAir ${mcVersion}`,
        mcVersion,
        loader,
        fabricLoaderVersion: loader === "fabric" ? selectedFabric || null : null,
        autoInstallFabricLoader: loader === "fabric" ? autoInstallFabricLoader : false,
        autoInstallFabricApi: loader === "fabric" ? autoInstallFabricApi : false,
        autoInstallClient: loader === "fabric" && settings.autoInstallClient,
        clientOverride: "inherit",
        ramMbOverride: ramOverride.trim() ? Number(ramOverride) : null,
        javaPathOverride: createJavaPath.trim() || null,
        instanceDirOverride: createInstanceDir.trim() || null,
      });
      setNotice(`Created independent MC ${mcVersion} instance "${name.trim() || `7xAir ${mcVersion}`}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSyncFabricApi = async (inst: GameInstance, forceUpdate = false) => {
    setSyncingApiId(inst.id);
    setError(null);
    setNotice(null);
    try {
      const status = await syncInstanceFabricApi(inst.id, forceUpdate);
      setFabricApiStatuses((prev) => ({ ...prev, [inst.id]: status }));
      setNotice(`${inst.name}: ${status.message}`);
      await refreshPerInstanceStatus(instances);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingApiId(null);
    }
  };

  const handleClone = async (inst: GameInstance) => {
    setError(null);
    setNotice(null);
    try {
      const cloneName = `${inst.name} Copy`;
      await onCloneInstance(inst.id, cloneName);
      setNotice(`Cloned "${inst.name}" into independent instance "${cloneName}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEditModal = (inst: GameInstance) => {
    setEditingInstance(inst);
    setEditName(inst.name);
    setEditFabricLoader(inst.fabricLoaderVersion ?? "");
    setEditAutoFabricLoader(inst.autoInstallFabricLoader ?? true);
    setEditAutoFabricApi(inst.autoInstallFabricApi ?? true);
    setEditRam(inst.ramMbOverride ? String(inst.ramMbOverride) : "");
    setEditJavaPath(inst.javaPathOverride ?? "");
    setEditJvmArgs(inst.jvmArgsOverride ?? "");
    setEditClientOverride(inst.clientOverride);
  };

  const handleSaveEdit = async () => {
    if (!editingInstance) return;
    setError(null);
    setNotice(null);
    try {
      await updateInstance({
        id: editingInstance.id,
        name: editName.trim() || editingInstance.name,
        fabricLoaderVersion:
          editingInstance.loader === "fabric" && editFabricLoader.trim()
            ? editFabricLoader.trim()
            : undefined,
        autoInstallFabricLoader:
          editingInstance.loader === "fabric" ? editAutoFabricLoader : false,
        autoInstallFabricApi:
          editingInstance.loader === "fabric" ? editAutoFabricApi : false,
        ramMbOverride: editRam.trim() ? Number(editRam) : undefined,
        javaPathOverride: editJavaPath.trim(),
        jvmArgsOverride: editJvmArgs.trim(),
        clientOverride: editClientOverride,
      });
      await onRefreshInstances();
      setNotice(`Saved settings for "${editName.trim() || editingInstance.name}".`);
      setEditingInstance(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    setError(null);
    try {
      await onDeleteInstance(target.id);
      setNotice(`Deleted instance "${target.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatJavaLabel = (inst: GameInstance) => {
    if (inst.javaPathOverride) {
      const matched = javaInstallations.find((j) => j.path === inst.javaPathOverride);
      return matched ? `Java ${matched.majorVersion} (Custom)` : "Custom Java";
    }
    const autoJava = javaInstallations[0];
    return autoJava ? `Auto Java ${autoJava.majorVersion}` : "Auto Java";
  };

  const formatFabricApiBadge = (inst: GameInstance, status?: FabricApiStatus) => {
    if (inst.loader !== "fabric") return null;
    if (!status) return "Fabric API: Checking...";
    if (status.status === "installed") {
      return `Fabric API ${status.installedVersion ?? "Installed"}`;
    }
    if (status.status === "unavailable") {
      return `Fabric API: Unavailable for ${inst.mcVersion}`;
    }
    if (status.status === "disabled") {
      return "Fabric API: Auto OFF";
    }
    if (status.status === "update_available") {
      return "Fabric API: Update Available";
    }
    return "Fabric API: Pending Install";
  };

  const activeModsInstance = modsInstanceId
    ? instances.find((i) => i.id === modsInstanceId) ?? null
    : null;

  if (activeModsInstance) {
    return (
      <InstanceModsView
        instance={activeModsInstance}
        settings={settings}
        onBack={() => setModsInstanceId(null)}
        onOpenModrinth={onManageContent}
        onUpdateSettings={onUpdateSettings}
        onRefreshInstances={onRefreshInstances}
      />
    );
  }

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Instances</h1>
          <p className="page-subtitle">
            Independent Minecraft 1.21.11 & 26.2 profiles with isolated Fabric Loader, Fabric API, Java runtimes, mods, and folders.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="glass-button"
            onClick={() => void onRefreshMetadata()}
          >
            <RefreshCw size={14} /> Refresh Versions
          </button>
          <button
            type="button"
            className="glass-button"
            onClick={() => void onRefreshJava()}
          >
            Detect Java ({javaInstallations.length})
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Managed Instance Cards Grid */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Your Instances ({instances.length})
          </h2>
          <span className="nav-badge">Isolated Directories</span>
        </div>

        {instances.length === 0 ? (
          <p className="hero-copy">
            No instances yet. Create your first Minecraft 1.21.11 or 26.2 instance below.
          </p>
        ) : (
          <div className="instance-cards-grid">
            {instances.map((inst) => {
              const isRunning = launchStatus.running && launchStatus.instanceId === inst.id;
              const modCount = modCounts[inst.id] ?? 0;
              const apiStatus = fabricApiStatuses[inst.id];
              const apiBadge = formatFabricApiBadge(inst, apiStatus);
              return (
                <GlassPanel key={inst.id} subtle className="instance-card">
                  <div>
                    <div className="instance-card-top">
                      <div className="instance-icon-badge" aria-hidden="true">
                        {inst.modpackIconUrl ? (
                          <img
                            src={inst.modpackIconUrl}
                            alt={inst.modpackName ?? inst.name}
                            style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }}
                          />
                        ) : (
                          <Box size={22} />
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 750,
                            fontSize: 15,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {inst.name}
                        </div>
                        <div className="instance-card-meta">
                          <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                            MC {inst.mcVersion}
                          </span>
                          <span className="nav-badge" style={{ textTransform: "capitalize" }}>
                            {inst.loader === "vanilla"
                              ? "Vanilla"
                              : `${inst.loader} ${inst.fabricLoaderVersion ?? "auto"}`}
                          </span>
                          {inst.modpackName && (
                            <span
                              className="nav-badge"
                              style={{ borderColor: "rgba(74, 222, 128, 0.45)", color: "#86efac" }}
                            >
                              Modpack: {inst.modpackName} ({inst.modpackStatus ?? "installed"})
                            </span>
                          )}
                          <span className="nav-badge">{formatJavaLabel(inst)}</span>
                          <span className="nav-badge">
                            {modCount} {modCount === 1 ? "Mod" : "Mods"}
                          </span>
                          {apiBadge && (
                            <span
                              className="nav-badge"
                              style={
                                apiStatus?.status === "unavailable"
                                  ? { borderColor: "rgba(251, 146, 60, 0.55)", color: "#fdba74" }
                                  : apiStatus?.status === "installed"
                                  ? { borderColor: "rgba(74, 222, 128, 0.45)", color: "#86efac" }
                                  : undefined
                              }
                            >
                              {apiBadge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="instance-card-actions">
                    {isRunning ? (
                      <button
                        type="button"
                        className="glass-button"
                        style={{ flex: "1 1 110px" }}
                        onClick={() => void onStopInstance()}
                      >
                        <Square size={14} /> Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="glass-button glass-button--primary"
                        style={{ flex: "1 1 110px" }}
                        onClick={() => void onLaunchInstance(inst.id)}
                      >
                        <Play size={14} fill="currentColor" /> Play
                      </button>
                    )}

                    <button
                      type="button"
                      className="glass-button"
                      title={`Manage mods for ${inst.name}`}
                      onClick={() => setModsInstanceId(inst.id)}
                    >
                      <Package size={13} /> MODS
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      title={`Instance settings for ${inst.name}`}
                      onClick={() => openEditModal(inst)}
                    >
                      <Sliders size={13} /> Settings
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      title={`Edit instance ${inst.name}`}
                      onClick={() => openEditModal(inst)}
                    >
                      <Pencil size={13} /> Edit Instance
                    </button>

                    {inst.loader === "fabric" && (
                      <button
                        type="button"
                        className="glass-button"
                        disabled={syncingApiId === inst.id}
                        title={`Install or update compatible Fabric API for MC ${inst.mcVersion}`}
                        onClick={() => void handleSyncFabricApi(inst, true)}
                      >
                        <Download size={13} /> {syncingApiId === inst.id ? "Syncing..." : "Fabric API"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="glass-button"
                      title={`Open folder for ${inst.name}`}
                      aria-label={`Open folder for ${inst.name}`}
                      onClick={() =>
                        void openInstanceFolder(inst.id).catch((err) =>
                          setError(err instanceof Error ? err.message : String(err))
                        )
                      }
                    >
                      <FolderOpen size={13} /> Open Folder
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      title={`Clone ${inst.name}`}
                      aria-label={`Clone ${inst.name}`}
                      onClick={() => void handleClone(inst)}
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      title={`Delete ${inst.name}`}
                      aria-label={`Delete ${inst.name}`}
                      onClick={() => setConfirmDelete(inst)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* Create New Instance + Runtimes */}
      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title">Create New Instance</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Instance name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select
                aria-label="Minecraft version"
                className="glass-select"
                value={mcVersion}
                onChange={(e) => {
                  const nextVer = e.target.value;
                  setMcVersion(nextVer);
                  if (name.startsWith("7xAir Fabric ")) {
                    setName(`7xAir Fabric ${nextVer}`);
                  }
                }}
              >
                {SUPPORTED_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    Minecraft {v}
                  </option>
                ))}
              </select>
              <select
                aria-label="Mod loader"
                className="glass-select"
                value={loader}
                onChange={(e) => setLoader(e.target.value as "fabric" | "vanilla")}
              >
                <option value="fabric">Fabric</option>
                <option value="vanilla">Vanilla</option>
              </select>
            </div>
            {loader === "fabric" && (
              <>
                <select
                  aria-label="Fabric loader version"
                  className="glass-select"
                  value={selectedFabric}
                  onChange={(e) => setSelectedFabric(e.target.value)}
                >
                  {fabricLoaders.map((fl) => (
                    <option key={fl.version} value={fl.version}>
                      Fabric Loader {fl.version} {fl.stable ? "(Stable)" : "(Beta)"}
                    </option>
                  ))}
                </select>

                {/* Two independent per-instance Fabric settings */}
                <div
                  className="glass-panel--subtle"
                  style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoInstallFabricLoader}
                      onChange={(e) => setAutoInstallFabricLoader(e.target.checked)}
                    />
                    <span>
                      <strong>Auto-Install Fabric Loader</strong> — Automatically install & manage compatible Fabric Loader for MC {mcVersion}
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoInstallFabricApi}
                      onChange={(e) => setAutoInstallFabricApi(e.target.checked)}
                    />
                    <span>
                      <strong>Auto-Install Fabric API</strong> — Independently install compatible Fabric API JAR into this instance's mods folder
                    </span>
                  </label>
                </div>
              </>
            )}

            <select
              aria-label="Java runtime"
              className="glass-select"
              value={createJavaPath}
              onChange={(e) => setCreateJavaPath(e.target.value)}
            >
              <option value="">Java Runtime: Auto-detect per MC metadata</option>
              {javaInstallations.map((j) => (
                <option key={j.path} value={j.path}>
                  Java {j.majorVersion} ({j.vendor}) — {j.path}
                </option>
              ))}
            </select>

            <input
              type="text"
              className="glass-input"
              placeholder="Instance directory override (optional — defaults to isolated 7xAir folder)"
              value={createInstanceDir}
              onChange={(e) => setCreateInstanceDir(e.target.value)}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                className="glass-input"
                placeholder={`RAM override MB (default ${settings.allocatedRamMb})`}
                min={1024}
                max={32768}
                step={512}
                value={ramOverride}
                onChange={(e) => setRamOverride(e.target.value)}
              />
              <button
                type="button"
                className="glass-button glass-button--primary"
                onClick={() => void handleCreate()}
              >
                <Plus size={15} /> Create
              </button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title">Supported Versions & Java Runtimes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {(metadata?.targetCompatibility ?? []).map((t) => (
              <div
                key={t.version}
                className="glass-panel--subtle"
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12.5,
                }}
              >
                <strong>Minecraft {t.version}</strong>
                <span className="nav-badge">
                  {t.status === "available" ? "Official Available" : "Pending Official Release"}
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            Detected Java ({javaInstallations.length}) — 1.21.11 requires Java 21; 26.2 reads official version metadata:
          </div>
          {javaInstallations.length === 0 ? (
            <div className="path-mono">
              No Java runtime detected. Set a custom Java path or install Java 21+.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {javaInstallations.slice(0, 3).map((j) => (
                <div key={j.path} className="path-mono">
                  Java {j.majorVersion} ({j.vendor}){j.recommended ? " ★" : ""} — {j.path}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Edit Instance Settings Modal */}
      {editingInstance && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <GlassPanel className="panel-pad" style={{ width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={16} />
                Instance Settings — {editingInstance.name} (MC {editingInstance.mcVersion})
              </h2>
              <button
                type="button"
                className="window-btn"
                aria-label="Close"
                onClick={() => setEditingInstance(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Instance Name
                <input
                  type="text"
                  className="glass-input"
                  style={{ marginTop: 4 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>

              {editingInstance.loader === "fabric" && (
                <>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Fabric Loader Version (MC {editingInstance.mcVersion})
                    <select
                      className="glass-select"
                      style={{ marginTop: 4 }}
                      value={editFabricLoader}
                      onChange={(e) => setEditFabricLoader(e.target.value)}
                    >
                      {editFabricLoadersList.map((fl) => (
                        <option key={fl.version} value={fl.version}>
                          Fabric Loader {fl.version} {fl.stable ? "(Stable)" : "(Beta)"}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Independent per-instance Fabric toggles */}
                  <div
                    className="glass-panel--subtle"
                    style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={editAutoFabricLoader}
                        onChange={(e) => setEditAutoFabricLoader(e.target.checked)}
                      />
                      <span>
                        <strong>Auto-Install Fabric Loader</strong> ({editAutoFabricLoader ? "ON" : "OFF"})
                      </span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={editAutoFabricApi}
                        onChange={(e) => setEditAutoFabricApi(e.target.checked)}
                      />
                      <span>
                        <strong>Auto-Install Fabric API</strong> ({editAutoFabricApi ? "ON" : "OFF"})
                      </span>
                    </label>
                  </div>

                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    7xAir Fabric Client Override
                    <select
                      className="glass-select"
                      style={{ marginTop: 4 }}
                      value={editClientOverride}
                      onChange={(e) => setEditClientOverride(e.target.value as ClientOverrideMode)}
                    >
                      <option value="inherit">Inherit Global ({settings.autoInstallClient ? "ON" : "OFF"})</option>
                      <option value="force_on">Force ON</option>
                      <option value="force_off">Force OFF</option>
                    </select>
                  </label>
                </>
              )}

              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                RAM Override (MB, leave blank for global {settings.allocatedRamMb} MB)
                <input
                  type="number"
                  className="glass-input"
                  style={{ marginTop: 4 }}
                  min={1024}
                  max={32768}
                  step={512}
                  placeholder={String(settings.allocatedRamMb)}
                  value={editRam}
                  onChange={(e) => setEditRam(e.target.value)}
                />
              </label>

              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Custom Java Executable Path (leave blank for automatic metadata detection)
                <input
                  type="text"
                  className="glass-input"
                  style={{ marginTop: 4 }}
                  placeholder="Auto-detect required Java version"
                  value={editJavaPath}
                  onChange={(e) => setEditJavaPath(e.target.value)}
                />
              </label>

              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                JVM Arguments Override (optional)
                <input
                  type="text"
                  className="glass-input"
                  style={{ marginTop: 4 }}
                  placeholder={settings.jvmArgs}
                  value={editJvmArgs}
                  onChange={(e) => setEditJvmArgs(e.target.value)}
                />
              </label>

              <div className="path-mono">{editingInstance.instanceDir}</div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => setEditingInstance(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  onClick={() => void handleSaveEdit()}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Delete Instance Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <GlassPanel className="panel-pad" style={{ width: "100%", maxWidth: 420 }}>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "#fca5a5" }}>
              <AlertTriangle size={16} />
              Delete Instance?
            </h2>
            <p className="hero-copy" style={{ marginBottom: 14 }}>
              Are you sure you want to permanently delete{" "}
              <strong style={{ color: "var(--text-primary)" }}>{confirmDelete.name}</strong> (MC{" "}
              {confirmDelete.mcVersion}) and its isolated files? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="glass-button"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glass-button"
                style={{
                  background: "rgba(239, 68, 68, 0.24)",
                  borderColor: "rgba(239, 68, 68, 0.6)",
                  color: "#fecaca",
                }}
                onClick={() => void handleConfirmDelete()}
              >
                <Trash2 size={14} /> Confirm Delete
              </button>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
