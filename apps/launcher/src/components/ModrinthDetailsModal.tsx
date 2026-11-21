import { Download, Layers, Package, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getModrinthVersions } from "../lib/tauriBridge";
import type {
  ContentProjectType,
  ModrinthSearchHit,
  ModrinthVersion,
} from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface ModrinthDetailsModalProps {
  hit: ModrinthSearchHit;
  projectType: ContentProjectType;
  mcVersionFilter: string;
  loaderFilter: string;
  onClose: () => void;
  onSelectInstall: (hit: ModrinthSearchHit, versionId?: string) => void;
}

export function ModrinthDetailsModal({
  hit,
  projectType,
  mcVersionFilter,
  loaderFilter,
  onClose,
  onSelectInstall,
}: ModrinthDetailsModalProps) {
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getModrinthVersions(
      hit.project_id,
      mcVersionFilter || null,
      projectType === "mod" && loaderFilter ? loaderFilter : null,
      projectType
    )
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hit.project_id, mcVersionFilter, loaderFilter, projectType]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <GlassPanel
        className="panel-pad"
        style={{ width: "100%", maxWidth: 640, maxHeight: "82vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="instance-icon-badge" style={{ width: 52, height: 52 }}>
              {hit.icon_url ? (
                <img
                  src={hit.icon_url}
                  alt={hit.title}
                  style={{ width: 44, height: 44, borderRadius: 9, objectFit: "cover" }}
                />
              ) : (
                <Package size={22} />
              )}
            </div>
            <div>
              <h2 className="section-title" style={{ margin: 0, fontSize: 18 }}>
                {hit.title}
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                by {hit.author} · {hit.downloads.toLocaleString()} downloads
              </div>
            </div>
          </div>
          <button type="button" className="window-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <p className="hero-copy" style={{ marginBottom: 14 }}>
          {hit.description}
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {hit.categories.slice(0, 8).map((cat) => (
            <span key={cat} className="nav-badge" style={{ textTransform: "capitalize" }}>
              {cat}
            </span>
          ))}
        </div>

        <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}>
          <Layers size={14} />
          Available Versions & Dependencies
        </h3>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <span className="spinner-ring" />
            Fetching official Modrinth versions...
          </div>
        ) : error ? (
          <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
            {error}
          </div>
        ) : versions.length === 0 ? (
          <p className="hero-copy">
            No versions matched the active filter. Try clearing the Minecraft version or loader filter.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {versions.slice(0, 10).map((ver) => {
              const reqDeps = ver.dependencies.filter((d) => d.dependency_type === "required");
              const optDeps = ver.dependencies.filter((d) => d.dependency_type === "optional");
              return (
                <div
                  key={ver.id}
                  className="glass-panel--subtle"
                  style={{
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{ver.version_number}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      MC: {ver.game_versions.slice(-4).join(", ")} · Loaders:{" "}
                      {ver.loaders.join(", ") || "any"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Dependencies: {reqDeps.length} required, {optDeps.length} optional
                    </div>
                  </div>

                  <button
                    type="button"
                    className="glass-button glass-button--primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => onSelectInstall(hit, ver.id)}
                  >
                    <Download size={13} /> Install
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
