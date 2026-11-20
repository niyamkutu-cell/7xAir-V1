import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import {
  checkInstanceCompatibility,
  checkInstanceUpdates,
  installModrinthContent,
  listInstanceContent,
  removeInstanceContent,
  searchModrinth,
  toggleInstanceContent,
  updateInstanceContent,
} from "../lib/tauriBridge";
import type {
  CompatibilityReport,
  ContentProjectType,
  ContentUpdateInfo,
  GameInstance,
  InstalledContentItem,
  ModrinthSearchHit,
} from "../types/launcher";

interface ModrinthPageProps {
  instances: GameInstance[];
  initialInstanceId?: string;
  onGoToInstances: () => void;
}

export function ModrinthPage({
  instances,
  initialInstanceId,
  onGoToInstances,
}: ModrinthPageProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    initialInstanceId || instances[0]?.id || ""
  );
  const [projectType, setProjectType] = useState<ContentProjectType>("mod");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [installed, setInstalled] = useState<InstalledContentItem[]>([]);
  const [updates, setUpdates] = useState<ContentUpdateInfo[]>([]);
  const [compat, setCompat] = useState<CompatibilityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeInstance =
    instances.find((i) => i.id === selectedInstanceId) ?? instances[0] ?? null;

  const refreshInstanceData = async (instId: string) => {
    const [items, report] = await Promise.all([
      listInstanceContent(instId),
      checkInstanceCompatibility(instId),
    ]);
    setInstalled(items);
    setCompat(report);
  };

  useEffect(() => {
    if (!activeInstance) return;
    setSelectedInstanceId(activeInstance.id);
    void refreshInstanceData(activeInstance.id);
  }, [activeInstance?.id]);

  const handleSearch = async () => {
    if (!activeInstance) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await searchModrinth({
        query,
        projectType,
        mcVersion: activeInstance.mcVersion,
        loader: projectType === "mod" ? activeInstance.loader : undefined,
        sortBy,
        limit: 20,
      });
      setHits(resp.hits);
      if (resp.hits.length === 0) {
        setNotice("No matching Modrinth projects returned for the current filters.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async (hit: ModrinthSearchHit) => {
    if (!activeInstance) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await installModrinthContent({
        instanceId: activeInstance.id,
        projectId: hit.project_id,
        projectType,
        title: hit.title,
      });
      const depCount = Math.max(0, result.installed.length - 1);
      setNotice(
        `Installed ${hit.title}${
          depCount > 0 ? ` (+ ${depCount} required dependenc${depCount === 1 ? "y" : "ies"})` : ""
        } into ${activeInstance.name}.`
      );
      await refreshInstanceData(activeInstance.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (!activeInstance) return;
    setBusy(true);
    setError(null);
    try {
      const found = await checkInstanceUpdates(activeInstance.id);
      setUpdates(found);
      setNotice(
        found.length === 0
          ? "All managed mods and resource packs are up to date."
          : `Found ${found.length} available update(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApplyUpdate = async (upd: ContentUpdateInfo) => {
    if (!activeInstance) return;
    setBusy(true);
    setError(null);
    try {
      await updateInstanceContent(activeInstance.id, upd.projectId);
      setUpdates((prev) => prev.filter((u) => u.projectId !== upd.projectId));
      setNotice(`Updated ${upd.title} to ${upd.latestVersionNumber}.`);
      await refreshInstanceData(activeInstance.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleItem = async (item: InstalledContentItem) => {
    if (!activeInstance) return;
    const next = await toggleInstanceContent(
      activeInstance.id,
      item.filename,
      item.projectType,
      !item.enabled
    );
    setInstalled(next);
    setCompat(await checkInstanceCompatibility(activeInstance.id));
  };

  const handleRemoveItem = async (item: InstalledContentItem) => {
    if (!activeInstance) return;
    const next = await removeInstanceContent(
      activeInstance.id,
      item.filename,
      item.projectType
    );
    setInstalled(next);
    setCompat(await checkInstanceCompatibility(activeInstance.id));
  };

  if (!activeInstance) {
    return (
      <GlassPanel className="panel-pad">
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          Modrinth Mods & Resource Packs
        </h1>
        <p className="hero-copy" style={{ marginBottom: 16 }}>
          Create an independent Minecraft instance first so mods and resource packs stay cleanly isolated per instance.
        </p>
        <button
          type="button"
          className="glass-button glass-button--primary"
          onClick={onGoToInstances}
        >
          Go to Instances
        </button>
      </GlassPanel>
    );
  }

  const filteredInstalled = installed.filter((i) => i.projectType === projectType);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Modrinth Content & Compatibility</h1>
          <p className="page-subtitle">
            Search, install with automatic dependency resolution, update, and verify compatibility per instance.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Target instance"
            className="glass-select"
            style={{ width: 220 }}
            value={activeInstance.id}
            onChange={(e) => setSelectedInstanceId(e.target.value)}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} ({inst.mcVersion} · {inst.loader})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="glass-button"
            disabled={busy}
            onClick={() => void handleCheckUpdates()}
          >
            <RefreshCw size={14} /> Check Updates
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`toggle-btn ${projectType === "mod" ? "toggle-btn--on" : ""}`}
            onClick={() => setProjectType("mod")}
          >
            Mods
          </button>
          <button
            type="button"
            className={`toggle-btn ${projectType === "resourcepack" ? "toggle-btn--on" : ""}`}
            onClick={() => setProjectType("resourcepack")}
          >
            Resource Packs
          </button>

          <input
            type="text"
            className="glass-input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder={`Search Modrinth ${projectType === "mod" ? "Fabric mods" : "resource packs"} for MC ${activeInstance.mcVersion}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch();
            }}
          />

          <select
            aria-label="Sort Modrinth results"
            className="glass-select"
            style={{ width: 150 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="relevance">Relevance</option>
            <option value="downloads">Downloads</option>
            <option value="updated">Updated</option>
            <option value="newest">Newest</option>
          </select>

          <button
            type="button"
            className="glass-button glass-button--primary"
            disabled={busy}
            onClick={() => void handleSearch()}
          >
            <Search size={14} /> Search
          </button>
        </div>

        {hits.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {hits.map((hit) => (
              <div
                key={hit.project_id}
                className="glass-panel--subtle"
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>{hit.title}</strong>
                    <span className="nav-badge">by {hit.author}</span>
                    <span className="nav-badge">{hit.downloads.toLocaleString()} DLs</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    {hit.description}
                  </div>
                </div>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={busy}
                  onClick={() => void handleInstall(hit)}
                >
                  <Download size={14} /> Install
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {updates.length > 0 && (
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ArrowUpCircle size={16} /> Available Updates ({updates.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {updates.map((upd) => (
              <div
                key={upd.projectId}
                className="glass-panel--subtle"
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{upd.title}</strong>{" "}
                  <span className="nav-badge">
                    {upd.currentVersion} → {upd.latestVersionNumber}
                  </span>
                </div>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={busy}
                  onClick={() => void handleApplyUpdate(upd)}
                >
                  Update
                </button>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={15} />
            Installed {projectType === "mod" ? "Mods" : "Resource Packs"} (
            {filteredInstalled.length})
          </h2>
          {filteredInstalled.length === 0 ? (
            <p className="hero-copy">
              No {projectType === "mod" ? "mods" : "resource packs"} installed in{" "}
              <strong>{activeInstance.name}</strong> yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredInstalled.map((item) => (
                <div
                  key={`${item.projectType}-${item.filename}`}
                  className="glass-panel--subtle"
                  style={{
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {item.title}{" "}
                      <span className="nav-badge">{item.versionNumber}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {item.filename}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className={`toggle-btn ${item.enabled ? "toggle-btn--on" : ""}`}
                      onClick={() => void handleToggleItem(item)}
                    >
                      {item.enabled ? "ON" : "OFF"}
                    </button>
                    <button
                      type="button"
                      className="glass-button"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => void handleRemoveItem(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {compat?.compatible ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
            Compatibility Check
          </h2>
          {compat && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="glass-pill">
                  {compat.compatible ? (
                    <>
                      <CheckCircle2 size={12} /> Ready to Launch
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={12} /> {compat.errorCount} Error(s)
                    </>
                  )}
                </span>
                <span className="nav-badge">
                  MC {compat.mcVersion} · {compat.loader}
                </span>
                {compat.warningCount > 0 && (
                  <span className="nav-badge">{compat.warningCount} Warning(s)</span>
                )}
              </div>

              {compat.issues.length === 0 ? (
                <p className="hero-copy">
                  All installed mods, dependencies, and resource packs pass compatibility checks for{" "}
                  <strong>{activeInstance.name}</strong>.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {compat.issues.map((issue, idx) => (
                    <div key={`${issue.code}-${idx}`} className="path-mono">
                      [{issue.severity.toUpperCase()}] {issue.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
