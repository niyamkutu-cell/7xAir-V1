import { Download, FileText, Layers, Package, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getModrinthVersions } from "../lib/tauriBridge";
import type { ModrinthSearchHit, ModrinthVersion } from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface ModpackDetailsModalProps {
  hit: ModrinthSearchHit;
  mcVersionFilter: string;
  loaderFilter: string;
  onClose: () => void;
  onSelectInstall: (hit: ModrinthSearchHit, version: ModrinthVersion) => void;
}

export function ModpackDetailsModal({
  hit,
  mcVersionFilter,
  loaderFilter,
  onClose,
  onSelectInstall,
}: ModpackDetailsModalProps) {
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getModrinthVersions(
      hit.project_id,
      mcVersionFilter || null,
      loaderFilter || null,
      "modpack"
    )
      .then((list) => {
        if (cancelled) return;
        // Only display releases that contain a downloadable .mrpack file
        const valid = list.filter((v) =>
          v.files.some((f) => f.filename.endsWith(".mrpack")) || v.files.length > 0
        );
        setVersions(valid);
        setSelectedVersionId(valid[0]?.id ?? "");
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
  }, [hit.project_id, mcVersionFilter, loaderFilter]);

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0] ?? null;
  const coverUrl = hit.gallery?.[0] || hit.icon_url || null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <GlassPanel
        className="panel-pad"
        style={{ width: "100%", maxWidth: 680, maxHeight: "86vh", overflowY: "auto" }}
      >
        {/* Header + Cover Image */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <div className="instance-icon-badge" style={{ width: 58, height: 58, flexShrink: 0 }}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={hit.title}
                  style={{ width: 50, height: 50, borderRadius: 10, objectFit: "cover" }}
                />
              ) : (
                <Package size={24} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="section-title" style={{ margin: 0, fontSize: 19 }}>
                {hit.title}
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                by {hit.author} · {hit.downloads.toLocaleString()} downloads
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {hit.categories.slice(0, 6).map((cat) => (
                  <span key={cat} className="nav-badge" style={{ textTransform: "capitalize" }}>
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button type="button" className="window-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <p className="hero-copy" style={{ marginBottom: 16 }}>
          {hit.description}
        </p>

        {/* Compatible Release Selector */}
        <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}>
          <Layers size={14} />
          Compatible Modpack Releases ({versions.length})
        </h3>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <span className="spinner-ring" />
            Fetching official Modrinth modpack releases...
          </div>
        ) : error ? (
          <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
            {error}
          </div>
        ) : versions.length === 0 ? (
          <div className="toast-banner" style={{ borderColor: "rgba(251, 146, 60, 0.55)" }}>
            No compatible modpack releases found for the selected Minecraft version / loader filter.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                aria-label="Choose compatible modpack release"
                className="glass-select"
                style={{ flex: "1 1 280px" }}
                value={selectedVersion?.id ?? ""}
                onChange={(e) => setSelectedVersionId(e.target.value)}
              >
                {versions.slice(0, 25).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version_number} — MC {v.game_versions.slice(-3).join(", ")} ({v.loaders.join(", ") || "any"})
                  </option>
                ))}
              </select>

              {selectedVersion && (
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  onClick={() => onSelectInstall(hit, selectedVersion)}
                >
                  <Download size={14} /> Install Release
                </button>
              )}
            </div>

            {selectedVersion && (
              <GlassPanel subtle className="panel-pad" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 11 }}>
                    Release {selectedVersion.version_number}
                  </span>
                  <span className="nav-badge">
                    MC: {selectedVersion.game_versions.join(", ")}
                  </span>
                  <span className="nav-badge" style={{ textTransform: "capitalize" }}>
                    Loader: {selectedVersion.loaders.join(", ") || "unspecified"}
                  </span>
                  <span className="nav-badge">
                    Dependencies: {selectedVersion.dependencies.length}
                  </span>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <FileText size={13} /> Changelog
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    maxHeight: 160,
                    overflowY: "auto",
                    lineHeight: 1.45,
                  }}
                >
                  {selectedVersion.changelog?.trim() || "No changelog provided for this release."}
                </div>
              </GlassPanel>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
