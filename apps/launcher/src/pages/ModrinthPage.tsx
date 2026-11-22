import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flame,
  Info,
  Layers,
  Package,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { ModpackDetailsModal } from "../components/ModpackDetailsModal";
import { ModpackInstallModal } from "../components/ModpackInstallModal";
import { ModrinthDetailsModal } from "../components/ModrinthDetailsModal";
import { ModrinthInstallModal } from "../components/ModrinthInstallModal";
import { getModrinthVersions, searchModrinth } from "../lib/tauriBridge";
import type {
  ContentProjectType,
  GameInstance,
  ModrinthSearchHit,
  ModrinthVersion,
} from "../types/launcher";

interface ModrinthPageProps {
  instances: GameInstance[];
  initialInstanceId?: string;
  onGoToInstances: () => void;
  onOpenInstanceMods: (instanceId: string) => void;
  onRefreshInstances?: () => Promise<void>;
}

const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"] as const;
const PAGE_SIZE = 24;
const CACHE_TTL_MS = 180_000;

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function ModrinthPage({
  instances,
  initialInstanceId,
  onGoToInstances,
  onOpenInstanceMods,
  onRefreshInstances,
}: ModrinthPageProps) {
  const [projectType, setProjectType] = useState<ContentProjectType>("mod");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"downloads" | "updated" | "relevance" | "newest">(
    "downloads"
  );
  const [mcVersionFilter, setMcVersionFilter] = useState<string>("");
  const [loaderFilter, setLoaderFilter] = useState<string>("fabric");
  const [page, setPage] = useState<number>(0);
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mods modals (preserved)
  const [detailsHit, setDetailsHit] = useState<ModrinthSearchHit | null>(null);
  const [installTarget, setInstallTarget] = useState<{
    hit: ModrinthSearchHit;
    versionId?: string;
  } | null>(null);

  // Modpacks modals (new Part 1)
  const [modpackDetailsHit, setModpackDetailsHit] = useState<ModrinthSearchHit | null>(null);
  const [modpackInstallTarget, setModpackInstallTarget] = useState<{
    hit: ModrinthSearchHit;
    version: ModrinthVersion;
  } | null>(null);
  const [resolvingModpackId, setResolvingModpackId] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, { ts: number; hits: ModrinthSearchHit[]; total: number }>>(
    new Map()
  );

  const runSearch = async (forceRefresh = false, targetPage = page) => {
    const usesLoader = projectType === "mod" || projectType === "modpack";
    const key = JSON.stringify({
      query: query.trim(),
      projectType,
      mcVersionFilter,
      loader: usesLoader ? loaderFilter : "",
      sortBy,
      offset: targetPage * PAGE_SIZE,
    });

    const cached = cacheRef.current.get(key);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setHits(cached.hits);
      setTotalHits(cached.total);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resp = await searchModrinth({
        query: query.trim(),
        projectType,
        mcVersion: mcVersionFilter || undefined,
        loader: usesLoader && loaderFilter ? loaderFilter : undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: targetPage * PAGE_SIZE,
      });
      setHits(resp.hits);
      setTotalHits(resp.total_hits);
      cacheRef.current.set(key, {
        ts: Date.now(),
        hits: resp.hits,
        total: resp.total_hits,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Modrinth API error: ${err.message}`
          : "Failed to reach the official Modrinth API."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    void runSearch(false, 0);
  }, [projectType, sortBy, mcVersionFilter, loaderFilter]);

  const handleQuickInstallModpack = async (hit: ModrinthSearchHit) => {
    setResolvingModpackId(hit.project_id);
    setError(null);
    try {
      const versions = await getModrinthVersions(
        hit.project_id,
        mcVersionFilter || null,
        loaderFilter || null,
        "modpack"
      );
      const compatible = versions.find(
        (v) => v.files.some((f) => f.filename.endsWith(".mrpack")) || v.files.length > 0
      );
      if (!compatible) {
        setError(
          `No compatible Modrinth modpack release found for "${hit.title}" with the current version/loader filter.`
        );
        return;
      }
      setModpackInstallTarget({ hit, version: compatible });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingModpackId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalHits / PAGE_SIZE));

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Modrinth</h1>
          <p className="page-subtitle">
            Browse official Modrinth Mods, Modpacks, and Resource Packs with version-checked installation into isolated 7xAir instances.
          </p>
        </div>

        {/* Independent Modrinth Categories: Mods, Modpacks, Resource Packs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`toggle-btn ${projectType === "mod" ? "toggle-btn--on" : ""}`}
            onClick={() => setProjectType("mod")}
          >
            Mods
          </button>
          <button
            type="button"
            className={`toggle-btn ${projectType === "modpack" ? "toggle-btn--on" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setProjectType("modpack")}
          >
            <Layers size={13} /> Modpacks
          </button>
          <button
            type="button"
            className={`toggle-btn ${projectType === "resourcepack" ? "toggle-btn--on" : ""}`}
            onClick={() => setProjectType("resourcepack")}
          >
            Resource Packs
          </button>
          <button
            type="button"
            className="glass-button"
            disabled={loading}
            onClick={() => void runSearch(true, page)}
          >
            {loading ? <span className="spinner-ring" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Search, Browse Tabs & Filters */}
      <GlassPanel className="panel-pad" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}>
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
                placeholder={
                  projectType === "modpack"
                    ? "Search official Modrinth modpacks (e.g. Fabulously Optimized, Simply Optimized)..."
                    : projectType === "mod"
                    ? "Search Modrinth mods (e.g. Sodium, Lithium, Iris)..."
                    : "Search Modrinth resource packs..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(0);
                    void runSearch(true, 0);
                  }
                }}
              />
            </div>

            <button
              type="button"
              className="glass-button glass-button--primary"
              disabled={loading}
              onClick={() => {
                setPage(0);
                void runSearch(true, 0);
              }}
            >
              <Search size={14} /> Search
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`toggle-btn ${sortBy === "downloads" ? "toggle-btn--on" : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setSortBy("downloads")}
            >
              <Flame size={13} /> Popular
            </button>
            <button
              type="button"
              className={`toggle-btn ${sortBy === "updated" ? "toggle-btn--on" : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setSortBy("updated")}
            >
              <Clock size={13} /> Recently Updated
            </button>
            <button
              type="button"
              className={`toggle-btn ${sortBy === "relevance" ? "toggle-btn--on" : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setSortBy("relevance")}
            >
              <Sparkles size={13} /> Relevance
            </button>
            <button
              type="button"
              className={`toggle-btn ${sortBy === "newest" ? "toggle-btn--on" : ""}`}
              onClick={() => setSortBy("newest")}
            >
              Newest
            </button>

            <select
              aria-label="Filter by Minecraft version"
              className="glass-select"
              style={{ width: 165 }}
              value={mcVersionFilter}
              onChange={(e) => setMcVersionFilter(e.target.value)}
            >
              <option value="">All MC Versions</option>
              <option value="1.21.11">Minecraft 1.21.11</option>
              <option value="26.2">Minecraft 26.2</option>
            </select>

            {(projectType === "mod" || projectType === "modpack") && (
              <select
                aria-label="Filter by mod loader"
                className="glass-select"
                style={{ width: 165 }}
                value={loaderFilter}
                onChange={(e) => setLoaderFilter(e.target.value)}
              >
                <option value="">All Loaders</option>
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="neoforge">NeoForge</option>
                <option value="quilt">Quilt</option>
              </select>
            )}

            {totalHits > 0 && (
              <span className="nav-badge" style={{ marginLeft: "auto" }}>
                {totalHits.toLocaleString()} {projectType === "modpack" ? "modpacks" : "results"}
              </span>
            )}
          </div>
        </div>
      </GlassPanel>

      {error && (
        <div
          className="toast-banner"
          style={{
            borderColor: "rgba(239, 68, 68, 0.55)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            className="glass-button"
            style={{ padding: "5px 10px", fontSize: 11.5 }}
            onClick={() => void runSearch(true, page)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Grid */}
      {loading && hits.length === 0 ? (
        <GlassPanel className="panel-pad" style={{ textAlign: "center", padding: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
            <span className="spinner-ring" />
            Loading official Modrinth {projectType === "modpack" ? "modpacks" : "catalog"}...
          </div>
        </GlassPanel>
      ) : hits.length === 0 ? (
        <GlassPanel className="panel-pad">
          <p className="hero-copy">
            No compatible {projectType === "modpack" ? "modpacks" : "projects"} matched your search or version filter. Try clearing the Minecraft version or loader filter.
          </p>
        </GlassPanel>
      ) : (
        <>
          <div className="modrinth-cards-grid">
            {hits.map((hit) => {
              const supportedLoaders = hit.categories.filter((c) =>
                (KNOWN_LOADERS as readonly string[]).includes(c.toLowerCase())
              );
              const recentVersions = hit.versions.slice(-3);
              const coverUrl =
                projectType === "modpack"
                  ? hit.gallery?.[0] || hit.icon_url || null
                  : hit.icon_url || null;

              return (
                <GlassPanel key={hit.project_id} subtle className="modrinth-card">
                  {projectType === "modpack" && coverUrl && (
                    <div
                      style={{
                        width: "100%",
                        height: 104,
                        borderRadius: 10,
                        overflow: "hidden",
                        marginBottom: 8,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(10,10,14,0.65)",
                      }}
                    >
                      <img
                        src={coverUrl}
                        alt={hit.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div className="instance-icon-badge" style={{ width: 46, height: 46, flexShrink: 0 }}>
                      {hit.icon_url ? (
                        <img
                          src={hit.icon_url}
                          alt={hit.title}
                          style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }}
                        />
                      ) : (
                        <Package size={20} />
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 750,
                          fontSize: 14.5,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {hit.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                        by {hit.author} · {formatDownloads(hit.downloads)} downloads
                      </div>
                    </div>
                  </div>

                  <p className="modrinth-card-desc">{hit.description}</p>

                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
                    {supportedLoaders.slice(0, 3).map((ld) => (
                      <span
                        key={ld}
                        className="glass-pill"
                        style={{ padding: "2px 7px", fontSize: 10, textTransform: "capitalize" }}
                      >
                        {ld}
                      </span>
                    ))}
                    {recentVersions.map((ver) => (
                      <span key={ver} className="nav-badge" style={{ fontSize: 10 }}>
                        {ver}
                      </span>
                    ))}
                    {projectType === "modpack" && hit.latest_version && (
                      <span className="nav-badge" style={{ fontSize: 10 }}>
                        Latest: {hit.latest_version}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="glass-button"
                      style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
                      onClick={() =>
                        projectType === "modpack"
                          ? setModpackDetailsHit(hit)
                          : setDetailsHit(hit)
                      }
                    >
                      <Info size={13} /> Details
                    </button>
                    <button
                      type="button"
                      className="glass-button glass-button--primary"
                      style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
                      disabled={resolvingModpackId === hit.project_id}
                      onClick={() =>
                        projectType === "modpack"
                          ? void handleQuickInstallModpack(hit)
                          : setInstallTarget({ hit })
                      }
                    >
                      {resolvingModpackId === hit.project_id ? (
                        <span className="spinner-ring" />
                      ) : (
                        <Download size={13} />
                      )}
                      Install
                    </button>
                  </div>
                </GlassPanel>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalHits > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="glass-button"
                disabled={page === 0 || loading}
                onClick={() => {
                  const prev = Math.max(0, page - 1);
                  setPage(prev);
                  void runSearch(false, prev);
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="nav-badge">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="glass-button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void runSearch(false, next);
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Existing Mods Details Modal */}
      {detailsHit && (
        <ModrinthDetailsModal
          hit={detailsHit}
          projectType={projectType}
          mcVersionFilter={mcVersionFilter}
          loaderFilter={loaderFilter}
          onClose={() => setDetailsHit(null)}
          onSelectInstall={(hit, versionId) => {
            setDetailsHit(null);
            setInstallTarget({ hit, versionId });
          }}
        />
      )}

      {/* Existing Mods Install Modal */}
      {installTarget && (
        <ModrinthInstallModal
          hit={installTarget.hit}
          projectType={projectType}
          preferredVersionId={installTarget.versionId}
          instances={instances}
          initialInstanceId={initialInstanceId}
          onClose={() => setInstallTarget(null)}
          onGoToInstances={onGoToInstances}
          onOpenInstanceMods={onOpenInstanceMods}
        />
      )}

      {/* New Modpacks Details Modal */}
      {modpackDetailsHit && (
        <ModpackDetailsModal
          hit={modpackDetailsHit}
          mcVersionFilter={mcVersionFilter}
          loaderFilter={loaderFilter}
          onClose={() => setModpackDetailsHit(null)}
          onSelectInstall={(hit, version) => {
            setModpackDetailsHit(null);
            setModpackInstallTarget({ hit, version });
          }}
        />
      )}

      {/* New Modpacks Install Modal */}
      {modpackInstallTarget && (
        <ModpackInstallModal
          hit={modpackInstallTarget.hit}
          version={modpackInstallTarget.version}
          onClose={() => setModpackInstallTarget(null)}
          onInstalled={async () => {
            if (onRefreshInstances) {
              await onRefreshInstances();
            }
          }}
          onGoToInstances={onGoToInstances}
        />
      )}
    </div>
  );
}
