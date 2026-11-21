import { CheckCircle2, Download, FolderOpen, Package, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getModpackInstallProgress,
  installModrinthModpack,
} from "../lib/tauriBridge";
import type {
  InstallModpackResult,
  ModpackInstallProgress,
  ModrinthSearchHit,
  ModrinthVersion,
} from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface ModpackInstallModalProps {
  hit: ModrinthSearchHit;
  version: ModrinthVersion;
  onClose: () => void;
  onInstalled: (result: InstallModpackResult) => Promise<void>;
  onGoToInstances: () => void;
}

export function ModpackInstallModal({
  hit,
  version,
  onClose,
  onInstalled,
  onGoToInstances,
}: ModpackInstallModalProps) {
  const defaultMc = version.game_versions[version.game_versions.length - 1] ?? "1.21.11";
  const defaultLoader = version.loaders[0] ?? "fabric";

  const [instanceName, setInstanceName] = useState<string>(`${hit.title}`);
  const [selectedMcVersion, setSelectedMcVersion] = useState<string>(defaultMc);
  const [selectedLoader, setSelectedLoader] = useState<string>(defaultLoader);
  const [loaderVersion, setLoaderVersion] = useState<string>("auto (from manifest)");
  const [installDir, setInstallDir] = useState<string>("");
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<ModpackInstallProgress | null>(null);
  const [result, setResult] = useState<InstallModpackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  const handleInstall = async () => {
    const cleanName = instanceName.trim();
    if (cleanName.length < 2) {
      setError("Instance name must be at least 2 characters.");
      return;
    }

    setInstalling(true);
    setError(null);
    setResult(null);
    setProgress({
      active: true,
      modpackName: hit.title,
      stage: "Starting modpack installation...",
      completedFiles: 0,
      totalFiles: 0,
      percent: 5,
      installedModCount: 0,
      createdInstanceId: null,
      error: null,
    });

    pollRef.current = window.setInterval(() => {
      void getModpackInstallProgress().then((p) => {
        if (p.active || p.percent > 0) setProgress(p);
      });
    }, 350);

    try {
      const res = await installModrinthModpack({
        projectId: hit.project_id,
        versionId: version.id,
        modpackName: hit.title,
        instanceName: cleanName,
        iconUrl: hit.gallery?.[0] || hit.icon_url || null,
        mcVersionOverride: selectedMcVersion,
        loaderOverride: selectedLoader,
        loaderVersionOverride:
          loaderVersion.trim() && !loaderVersion.startsWith("auto")
            ? loaderVersion.trim()
            : null,
        instanceDirOverride: installDir.trim() || null,
      });
      setResult(res);
      setProgress({
        active: false,
        modpackName: hit.title,
        stage: `Installed ${res.installedFiles} files (${res.installedMods} mods, ${res.extractedOverrides} overrides).`,
        completedFiles: res.installedFiles,
        totalFiles: res.installedFiles,
        percent: 100,
        installedModCount: res.installedMods,
        createdInstanceId: res.instance.id,
        error: null,
      });
      await onInstalled(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setInstalling(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <GlassPanel className="panel-pad" style={{ width: "100%", maxWidth: 540 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} />
            Install Modpack — {hit.title}
          </h2>
          <button
            type="button"
            className="window-btn"
            aria-label="Close"
            disabled={installing}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Instance Name
            <input
              type="text"
              className="glass-input"
              style={{ marginTop: 4 }}
              disabled={installing || Boolean(result)}
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Minecraft Version (compatible)
              <select
                className="glass-select"
                style={{ marginTop: 4 }}
                disabled={installing || Boolean(result)}
                value={selectedMcVersion}
                onChange={(e) => setSelectedMcVersion(e.target.value)}
              >
                {(version.game_versions.length > 0 ? version.game_versions : [defaultMc]).map((v) => (
                  <option key={v} value={v}>
                    Minecraft {v}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Mod Loader (compatible)
              <select
                className="glass-select"
                style={{ marginTop: 4 }}
                disabled={installing || Boolean(result)}
                value={selectedLoader}
                onChange={(e) => setSelectedLoader(e.target.value)}
              >
                {(version.loaders.length > 0 ? version.loaders : [defaultLoader]).map((ld) => (
                  <option key={ld} value={ld} style={{ textTransform: "capitalize" }}>
                    {ld}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Loader Version (defaults to .mrpack manifest version)
            <input
              type="text"
              className="glass-input"
              style={{ marginTop: 4 }}
              disabled={installing || Boolean(result)}
              value={loaderVersion}
              onChange={(e) => setLoaderVersion(e.target.value)}
            />
          </label>

          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Installation Directory (optional — defaults to isolated 7xAir instance folder)
            <input
              type="text"
              className="glass-input"
              style={{ marginTop: 4 }}
              placeholder="Default isolated 7xAir instances directory"
              disabled={installing || Boolean(result)}
              value={installDir}
              onChange={(e) => setInstallDir(e.target.value)}
            />
          </label>

          {/* Actual Installation Progress */}
          {progress && (
            <GlassPanel subtle style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span>{progress.stage}</span>
                <strong>{progress.percent}%</strong>
              </div>
              <div
                style={{
                  height: 7,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.1)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, var(--accent), #f87171)",
                    transition: "width 180ms ease",
                  }}
                />
              </div>
              {progress.totalFiles > 0 && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                  Files: {progress.completedFiles} / {progress.totalFiles} · Mods installed: {progress.installedModCount}
                </div>
              )}
            </GlassPanel>
          )}

          {error && (
            <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
              {error}
            </div>
          )}

          {result && (
            <div
              className="toast-banner"
              style={{
                borderColor: "rgba(74, 222, 128, 0.55)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} color="#4ade80" />
              <span>
                Created isolated instance <strong>{result.instance.name}</strong> (MC {result.mcVersion},{" "}
                {result.loader} {result.loaderVersion ?? ""}, {result.installedMods} mods).
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="glass-button"
              disabled={installing}
              onClick={onClose}
            >
              {result ? "Close" : "Cancel"}
            </button>
            {result ? (
              <button
                type="button"
                className="glass-button glass-button--primary"
                onClick={() => {
                  onClose();
                  onGoToInstances();
                }}
              >
                <FolderOpen size={14} /> Open in Instances
              </button>
            ) : (
              <button
                type="button"
                className="glass-button glass-button--primary"
                disabled={installing}
                onClick={() => void handleInstall()}
              >
                {installing ? <span className="spinner-ring" /> : <Download size={14} />}
                {installing ? "Installing Modpack..." : "Install Modpack"}
              </button>
            )}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
