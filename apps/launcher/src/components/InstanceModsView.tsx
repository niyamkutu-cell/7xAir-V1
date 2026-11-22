import {
  ArrowLeft,
  AlertTriangle,
  ArrowUpCircle,
  ExternalLink,
  Layers,
  RotateCcw,
  CheckCircle2,
  FolderOpen,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  checkInstanceUpdates,
  checkModpackUpdate,
  getClientIntegrity,
  getModpackStatus,
  listInstanceContent,
  openInstanceFolder,
  openInstanceModsFolder,
  rollbackModpackUpdate,
  updateModrinthModpack,
  removeInstanceClient,
  removeInstanceContent,
  repairInstanceClient,
  setInstanceClientOverride,
  syncInstanceClient,
  toggleInstanceContent,
  updateInstanceClient,
  updateInstanceContent,
} from "../lib/tauriBridge";
import type {
  ClientIntegrityReport,
  ClientOverrideMode,
  ContentUpdateInfo,
  GameInstance,
  InstalledContentItem,
  LauncherSettings,
  ModpackStatusReport,
  ModpackUpdateInfo,
} from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface InstanceModsViewProps {
  instance: GameInstance;
  settings: LauncherSettings;
  onBack: () => void;
  onOpenModrinth: (instanceId: string) => void;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onRefreshInstances: () => Promise<void>;
}

type SortKey = "name-asc" | "name-desc" | "enabled-first" | "disabled-first" | "newest";
type FilterMode = "all" | "enabled" | "disabled";

export function InstanceModsView({
  instance,
  settings,
  onBack,
  onOpenModrinth,
  onUpdateSettings,
  onRefreshInstances,
}: InstanceModsViewProps) {
  const [mods, setMods] = useState<InstalledContentItem[]>([]);
  const [updates, setUpdates] = useState<ContentUpdateInfo[]>([]);
  const [clientReport, setClientReport] = useState<ClientIntegrityReport | null>(null);
  const [modpackStatus, setModpackStatus] = useState<ModpackStatusReport | null>(null);
  const [modpackUpdate, setModpackUpdate] = useState<ModpackUpdateInfo | null>(null);
  const [confirmOverwriteModified, setConfirmOverwriteModified] = useState(false);
  const [updatingModpack, setUpdatingModpack] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name-asc");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [loading, setLoading] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMods = async () => {
    setLoading(true);
    setError(null);
    try {
      const effectiveAuto =
        instance.loader === "fabric" &&
        (instance.clientOverride === "force_on" ||
          (instance.clientOverride === "inherit" && settings.autoInstallClient));
      const integrity =
        instance.loader === "fabric"
          ? await (effectiveAuto
              ? syncInstanceClient(instance.id)
              : getClientIntegrity(instance.id)
            ).catch(() => null)
          : null;
      const [content, mpStatus] = await Promise.all([
        listInstanceContent(instance.id),
        getModpackStatus(instance.id).catch(() => null),
      ]);
      setMods(content.filter((c) => c.projectType === "mod"));
      setClientReport(integrity);
      setModpackStatus(mpStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMods();
  }, [instance.id, settings.autoInstallClient]);

  const handleToggle = async (mod: InstalledContentItem) => {
    setError(null);
    setNotice(null);
    try {
      const next = await toggleInstanceContent(instance.id, mod.filename, "mod", !mod.enabled);
      setMods(next.filter((c) => c.projectType === "mod"));
      setNotice(
        `${mod.title} ${!mod.enabled ? "enabled" : "disabled (kept safely as .disabled)"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemove = async (mod: InstalledContentItem) => {
    setError(null);
    setNotice(null);
    try {
      const next = await removeInstanceContent(instance.id, mod.filename, "mod");
      setMods(next.filter((c) => c.projectType === "mod"));
      setNotice(`Removed ${mod.title} from ${instance.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setError(null);
    setNotice(null);
    try {
      const found = await checkInstanceUpdates(instance.id);
      const modUpdates = found.filter((u) => u.projectType === "mod");
      setUpdates(modUpdates);
      setNotice(
        modUpdates.length > 0
          ? `Found ${modUpdates.length} mod update(s) for ${instance.name}.`
          : "All managed mods in this instance are up to date."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleApplyUpdate = async (upd: ContentUpdateInfo) => {
    setError(null);
    setNotice(null);
    try {
      await updateInstanceContent(instance.id, upd.projectId);
      setUpdates((prev) => prev.filter((u) => u.projectId !== upd.projectId));
      await loadMods();
      setNotice(`Updated ${upd.title} to ${upd.latestVersionNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCheckModpackUpdate = async () => {
    setError(null);
    setNotice(null);
    setConfirmOverwriteModified(false);
    try {
      const info = await checkModpackUpdate(instance.id);
      setModpackUpdate(info);
      setNotice(
        info.updateAvailable
          ? `Modpack update available: ${info.currentVersion} → ${info.latestVersionNumber}.`
          : `Modpack is up to date (${info.currentVersion}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateModpack = async () => {
    if (!modpackUpdate?.latestVersionId) return;
    if (modpackUpdate.conflicts.length > 0 && !confirmOverwriteModified) {
      setError("User-modified files detected. Confirm overwrite below before updating.");
      return;
    }
    setUpdatingModpack(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateModrinthModpack(
        instance.id,
        modpackUpdate.latestVersionId,
        confirmOverwriteModified
      );
      setModpackStatus(next);
      setModpackUpdate(null);
      setConfirmOverwriteModified(false);
      await onRefreshInstances();
      await loadMods();
      setNotice(`Updated modpack to ${next.versionNumber ?? "latest"} (backup saved for rollback).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingModpack(false);
    }
  };

  const handleRollbackModpack = async () => {
    setError(null);
    setNotice(null);
    try {
      const restored = await rollbackModpackUpdate(instance.id);
      setModpackStatus(restored);
      await onRefreshInstances();
      await loadMods();
      setNotice("Rolled back modpack to the previous backup snapshot.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOverrideChange = async (mode: ClientOverrideMode) => {
    setError(null);
    setNotice(null);
    try {
      const rep = await setInstanceClientOverride(instance.id, mode);
      setClientReport(rep);
      await onRefreshInstances();
      await loadMods();
      setNotice(`Updated 7xAir Client Mod policy for ${instance.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredMods = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = mods.filter((m) => {
      if (filter === "enabled" && !m.enabled) return false;
      if (filter === "disabled" && m.enabled) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.filename.toLowerCase().includes(q) ||
        m.versionNumber.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return b.title.toLowerCase().localeCompare(a.title.toLowerCase());
        case "enabled-first":
          return Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title);
        case "disabled-first":
          return Number(a.enabled) - Number(b.enabled) || a.title.localeCompare(b.title);
        case "newest":
          return b.installedAtEpoch - a.installedAtEpoch;
        default:
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      }
    });
  }, [mods, search, sortBy, filter]);

  const enabledCount = mods.filter((m) => m.enabled).length;
  const updateMap = new Map(updates.map((u) => [u.projectId, u]));

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="glass-button" onClick={onBack}>
            <ArrowLeft size={14} /> Instances
          </button>
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>{instance.name} — MODS</span>
              <span className="glass-pill" style={{ fontSize: 11 }}>
                {enabledCount} Enabled / {mods.length} Installed
              </span>
            </h1>
            <p className="page-subtitle">
              MC {instance.mcVersion} ·{" "}
              {instance.loader === "fabric"
                ? `Fabric ${instance.fabricLoaderVersion ?? "auto"}`
                : "Vanilla"}{" "}
              · Isolated directory: {instance.instanceDir}\mods
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="glass-button"
            disabled={loading}
            onClick={() => void loadMods()}
          >
            {loading ? <span className="spinner-ring" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            type="button"
            className="glass-button"
            onClick={() =>
              void openInstanceModsFolder(instance.id).catch((err) =>
                setError(err instanceof Error ? err.message : String(err))
              )
            }
          >
            <FolderOpen size={14} /> Open Mods Folder
          </button>
          <button
            type="button"
            className="glass-button"
            disabled={checkingUpdates}
            onClick={() => void handleCheckUpdates()}
          >
            {checkingUpdates ? <span className="spinner-ring" /> : <ArrowUpCircle size={14} />}
            Check Updates
          </button>
          <button
            type="button"
            className="glass-button glass-button--primary"
            onClick={() => onOpenModrinth(instance.id)}
          >
            <Sparkles size={14} /> Add Mods
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Dedicated Modpack Information & File Protection Section */}
      {modpackStatus?.isModpack && (
        <GlassPanel className="panel-pad" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={15} />
                Modpack Information — {modpackStatus.modpackName ?? instance.name}
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Author: {modpackStatus.author ?? "Modrinth"} · Installed: {modpackStatus.versionNumber ?? "unknown"} · MC{" "}
                {modpackStatus.mcVersion} ({modpackStatus.loader} {modpackStatus.loaderVersion ?? ""})
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span className="glass-pill" style={{ fontSize: 10.5 }}>
                  Managed Files: {modpackStatus.managedFileCount}
                </span>
                <span className="nav-badge">
                  User-Added Files: {modpackStatus.userAddedFileCount} (Protected)
                </span>
                <span
                  className="nav-badge"
                  style={
                    modpackStatus.userModifiedFiles.length > 0
                      ? { borderColor: "rgba(251, 146, 60, 0.55)", color: "#fdba74" }
                      : undefined
                  }
                >
                  User-Modified: {modpackStatus.userModifiedFiles.length}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="glass-button"
                onClick={() => void handleCheckModpackUpdate()}
              >
                <ArrowUpCircle size={13} /> Check for Updates
              </button>
              {modpackUpdate?.updateAvailable && modpackUpdate.compatible && (
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={updatingModpack}
                  onClick={() => void handleUpdateModpack()}
                >
                  {updatingModpack ? <span className="spinner-ring" /> : <ArrowUpCircle size={13} />}
                  Update Modpack ({modpackUpdate.latestVersionNumber})
                </button>
              )}
              {modpackStatus.backupAvailable && (
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => void handleRollbackModpack()}
                >
                  <RotateCcw size={13} /> Rollback
                </button>
              )}
              {modpackStatus.modpackPageUrl && (
                <a
                  href={modpackStatus.modpackPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-button"
                >
                  <ExternalLink size={13} /> Open Modpack Page
                </a>
              )}
              <button
                type="button"
                className="glass-button"
                onClick={() => void openInstanceFolder(instance.id)}
              >
                <FolderOpen size={13} /> Open Instance Folder
              </button>
            </div>
          </div>

          {modpackUpdate && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {modpackUpdate.updateAvailable
                  ? `Update Available: ${modpackUpdate.currentVersion} → ${modpackUpdate.latestVersionNumber}`
                  : `Up to date (${modpackUpdate.currentVersion})`}
                {" · "}
                <span style={{ color: "var(--text-secondary)" }}>{modpackUpdate.compatibilityMessage}</span>
              </div>
              {modpackUpdate.changelog && (
                <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: 110, overflowY: "auto", marginBottom: 8 }}>
                  {modpackUpdate.changelog}
                </div>
              )}
              {modpackUpdate.conflicts.length > 0 && (
                <div
                  className="toast-banner"
                  style={{ borderColor: "rgba(251, 146, 60, 0.55)", display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fdba74", fontWeight: 700 }}>
                    <AlertTriangle size={14} />
                    File Conflict Report ({modpackUpdate.conflicts.length} user-modified file(s))
                  </div>
                  <div style={{ fontSize: 11.5 }}>
                    {modpackUpdate.conflicts.slice(0, 6).map((c) => c.path).join(", ")}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={confirmOverwriteModified}
                      onChange={(e) => setConfirmOverwriteModified(e.target.checked)}
                    />
                    <span>I confirm backing up & overwriting these modified files during the modpack update</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      )}

      {/* AUTO-INSTALL 7XAIR CLIENT MOD Bar */}
      {instance.loader === "fabric" && (
        <GlassPanel className="panel-pad" style={{ padding: "14px 18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <ShieldCheck size={16} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  AUTO-INSTALL 7XAIR CLIENT MOD
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  Installs only into this instance&apos;s own mods folder (never global Minecraft).
                </div>
              </div>
              {clientReport && (
                <span className="glass-pill" style={{ padding: "2px 9px", fontSize: 10.5 }}>
                  <CheckCircle2 size={11} />
                  {clientReport.installed
                    ? clientReport.updateAvailable
                      ? `Update ${clientReport.bundleVersion ?? "Available"}`
                      : clientReport.healthy
                        ? `Verified ${clientReport.installedVersion ?? "Installed"}`
                        : "Validation Issue"
                    : clientReport.effectiveEnabled
                      ? clientReport.bundleAvailable
                        ? "Ready to Install"
                        : `No MC ${instance.mcVersion} Build`
                      : "Auto-Install OFF"}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`toggle-btn ${settings.autoInstallClient ? "toggle-btn--on" : ""}`}
                onClick={() =>
                  void onUpdateSettings({ autoInstallClient: !settings.autoInstallClient })
                }
              >
                Global: {settings.autoInstallClient ? "ON" : "OFF"}
              </button>
              <select
                aria-label="Per-instance 7xAir Client Mod override"
                className="glass-select"
                style={{ width: 170 }}
                value={instance.clientOverride}
                onChange={(e) => void handleOverrideChange(e.target.value as ClientOverrideMode)}
              >
                <option value="inherit">
                  Inherit ({settings.autoInstallClient ? "ON" : "OFF"})
                </option>
                <option value="force_on">Force ON</option>
                <option value="force_off">Force OFF</option>
              </select>
              {clientReport?.bundleAvailable && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ padding: "6px 10px", fontSize: 11.5 }}
                  onClick={async () => {
                    setError(null);
                    try {
                      const rep = await updateInstanceClient(instance.id);
                      setClientReport(rep);
                      await loadMods();
                      setNotice(
                        rep.lastBackupPath
                          ? `Updated 7xAir Client to ${rep.installedVersion ?? "latest"} (previous JAR backed up).`
                          : `Installed 7xAir Client ${rep.installedVersion ?? "latest"} into this instance's mods/.`
                      );
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  <RefreshCw size={12} /> {clientReport.updateAvailable ? "Update" : "Install/Update"}
                </button>
              )}
              {clientReport && (!clientReport.healthy || clientReport.duplicateCount > 0) && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ padding: "6px 10px", fontSize: 11.5 }}
                  onClick={async () => {
                    setError(null);
                    try {
                      const rep = await repairInstanceClient(instance.id);
                      setClientReport(rep);
                      await loadMods();
                      setNotice(`Repaired 7xAir Client in ${instance.name}.`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  <Wrench size={12} /> Repair
                </button>
              )}
              {clientReport?.installed && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ padding: "6px 10px", fontSize: 11.5 }}
                  onClick={async () => {
                    setError(null);
                    try {
                      const rep = await removeInstanceClient(instance.id);
                      setClientReport(rep);
                      await loadMods();
                      setNotice(`Removed 7xAir Client JAR from ${instance.name} (configs preserved).`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </div>
          {clientReport && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-secondary)" }}>
              <div>
                {clientReport.statusMessage}
                {clientReport.lastBackupPath ? " · Previous JAR backed up safely." : ""}
              </div>
              {clientReport.issues.length > 0 && (
                <div style={{ color: "#fca5a5", marginTop: 4 }}>
                  {clientReport.issues.join(" · ")}
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      )}

      {/* Search, Filter & Sort Controls */}
      <GlassPanel className="panel-pad" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              className="glass-input"
              style={{ paddingLeft: 34 }}
              placeholder="Search installed mods by name, version, filename, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "enabled", "disabled"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`toggle-btn ${filter === mode ? "toggle-btn--on" : ""}`}
                style={{ minWidth: 0, textTransform: "capitalize" }}
                onClick={() => setFilter(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <select
            aria-label="Sort mods"
            className="glass-select"
            style={{ width: 175 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="name-asc">Sort: Name (A–Z)</option>
            <option value="name-desc">Sort: Name (Z–A)</option>
            <option value="enabled-first">Sort: Enabled First</option>
            <option value="disabled-first">Sort: Disabled First</option>
            <option value="newest">Sort: Newest Installed</option>
          </select>
        </div>
      </GlassPanel>

      {/* Mod List */}
      <GlassPanel className="panel-pad">
        {filteredMods.length === 0 ? (
          <p className="hero-copy">
            {mods.length === 0
              ? "No mods installed in this instance yet. Click Add Mods to browse Modrinth or Open Mods Folder to drop .jar files."
              : "No mods match your current search or filter."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredMods.map((mod) => {
              const pendingUpd = mod.projectId ? updateMap.get(mod.projectId) : undefined;
              const is7xClient = mod.filename.toLowerCase().includes("7xair");
              return (
                <div
                  key={mod.filename}
                  className="glass-panel--subtle"
                  style={{
                    padding: "13px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                    opacity: mod.enabled ? 1 : 0.68,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      className="instance-icon-badge"
                      style={{ width: 40, height: 40, borderRadius: 10 }}
                    >
                      {mod.iconUrl ? (
                        <img
                          src={mod.iconUrl}
                          alt={mod.title}
                          style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover" }}
                        />
                      ) : (
                        <Package size={18} />
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 14 }}>{mod.title}</strong>
                        <span className="nav-badge">{mod.versionNumber}</span>
                        {is7xClient && (
                          <span className="glass-pill" style={{ padding: "1px 8px", fontSize: 10 }}>
                            7xAir Client
                          </span>
                        )}
                        {!mod.enabled && (
                          <span className="nav-badge" style={{ color: "#fca5a5" }}>
                            Disabled
                          </span>
                        )}
                      </div>
                      {mod.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            marginTop: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {mod.description}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {mod.enabled ? mod.filename : `${mod.filename}.disabled`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {pendingUpd && (
                      <button
                        type="button"
                        className="glass-button glass-button--primary"
                        style={{ padding: "6px 11px", fontSize: 12 }}
                        onClick={() => void handleApplyUpdate(pendingUpd)}
                      >
                        <ArrowUpCircle size={13} /> Update ({pendingUpd.latestVersionNumber})
                      </button>
                    )}

                    <button
                      type="button"
                      className={`toggle-btn ${mod.enabled ? "toggle-btn--on" : ""}`}
                      aria-label={`Toggle ${mod.title}`}
                      onClick={() => void handleToggle(mod)}
                    >
                      {mod.enabled ? "ON" : "OFF"}
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      title={`Remove ${mod.title}`}
                      aria-label={`Remove ${mod.title}`}
                      onClick={() => void handleRemove(mod)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
