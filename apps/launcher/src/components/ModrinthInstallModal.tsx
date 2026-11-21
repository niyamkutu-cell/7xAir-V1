import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Package,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getModrinthVersions,
  installModrinthContent,
  listInstanceContent,
} from "../lib/tauriBridge";
import type {
  ContentProjectType,
  GameInstance,
  InstalledContentItem,
  ModrinthSearchHit,
  ModrinthVersion,
} from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface ModrinthInstallModalProps {
  hit: ModrinthSearchHit;
  projectType: ContentProjectType;
  preferredVersionId?: string;
  instances: GameInstance[];
  initialInstanceId?: string;
  onClose: () => void;
  onGoToInstances: () => void;
  onOpenInstanceMods: (instanceId: string) => void;
}

export function ModrinthInstallModal({
  hit,
  projectType,
  preferredVersionId,
  instances,
  initialInstanceId,
  onClose,
  onGoToInstances,
  onOpenInstanceMods,
}: ModrinthInstallModalProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    initialInstanceId && instances.some((i) => i.id === initialInstanceId)
      ? initialInstanceId
      : instances[0]?.id ?? ""
  );
  const [checking, setChecking] = useState(false);
  const [compatibleVersions, setCompatibleVersions] = useState<ModrinthVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(preferredVersionId ?? "");
  const [existingMod, setExistingMod] = useState<InstalledContentItem | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [installedSummary, setInstalledSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedInstance =
    instances.find((i) => i.id === selectedInstanceId) ?? null;

  // Validate compatibility and check for duplicates whenever the user switches target instance
  useEffect(() => {
    if (!selectedInstance) return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    setInstalledSummary(null);
    setConfirmOverwrite(false);

    void Promise.all([
      getModrinthVersions(
        hit.project_id,
        selectedInstance.mcVersion,
        projectType === "mod" ? selectedInstance.loader : null,
        projectType
      ),
      listInstanceContent(selectedInstance.id),
    ])
      .then(([versions, installedItems]) => {
        if (cancelled) return;
        setCompatibleVersions(versions);
        if (preferredVersionId && versions.some((v) => v.id === preferredVersionId)) {
          setSelectedVersionId(preferredVersionId);
        } else {
          setSelectedVersionId(versions[0]?.id ?? "");
        }
        const dup =
          installedItems.find(
            (item) =>
              item.projectId === hit.project_id ||
              item.title.toLowerCase() === hit.title.toLowerCase()
          ) ?? null;
        setExistingMod(dup);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setCompatibleVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedInstance?.id, hit.project_id, projectType, preferredVersionId]);

  const chosenVersion =
    compatibleVersions.find((v) => v.id === selectedVersionId) ??
    compatibleVersions[0] ??
    null;

  const requiredDeps = (chosenVersion?.dependencies ?? []).filter(
    (d) => d.dependency_type === "required"
  );

  const handleInstall = async () => {
    if (!selectedInstance || !chosenVersion) return;
    if (existingMod && !confirmOverwrite) {
      setError("This mod is already installed in the selected instance. Confirm overwrite to replace it.");
      return;
    }

    setInstalling(true);
    setError(null);
    setProgressStage("Downloading mod & resolving required dependencies...");
    try {
      const result = await installModrinthContent({
        instanceId: selectedInstance.id,
        projectId: hit.project_id,
        versionId: chosenVersion.id,
        projectType,
        title: hit.title,
      });
      const depCount = Math.max(0, result.installed.length - 1);
      setProgressStage("Verified SHA-512 & installed successfully.");
      setInstalledSummary(
        `Installed ${hit.title} (${chosenVersion.version_number})${
          depCount > 0 ? ` + ${depCount} required dependenc${depCount === 1 ? "y" : "ies"}` : ""
        } into "${selectedInstance.name}".`
      );
      setExistingMod(result.installed[0] ?? existingMod);
    } catch (err) {
      setProgressStage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <GlassPanel className="panel-pad" style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Download size={16} />
            Install {hit.title}
          </h2>
          <button type="button" className="window-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {instances.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="hero-copy">
              You don&apos;t have any Minecraft instances yet. Create an instance first so this mod installs cleanly into its isolated mods folder.
            </p>
            <button
              type="button"
              className="glass-button glass-button--primary"
              onClick={() => {
                onClose();
                onGoToInstances();
              }}
            >
              Go to Instances
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Select Target Instance (installs only into this instance)
              <select
                aria-label="Choose instance for installation"
                className="glass-select"
                style={{ marginTop: 5 }}
                value={selectedInstanceId}
                disabled={installing}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
              >
                {instances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} — MC {inst.mcVersion} ({inst.loader})
                  </option>
                ))}
              </select>
            </label>

            {checking ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                <span className="spinner-ring" />
                Checking Minecraft version & loader compatibility...
              </div>
            ) : compatibleVersions.length > 0 && chosenVersion ? (
              <div className="glass-panel--subtle" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="auth-status-badge auth-status-badge--verified">
                    <CheckCircle2 size={12} />
                    Compatible with MC {selectedInstance?.mcVersion} ({selectedInstance?.loader})
                  </span>
                  <span className="nav-badge">
                    {requiredDeps.length} Required Dep{requiredDeps.length === 1 ? "" : "s"}
                  </span>
                </div>

                <label style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  Mod Version
                  <select
                    aria-label="Choose mod version"
                    className="glass-select"
                    style={{ marginTop: 4 }}
                    value={chosenVersion.id}
                    disabled={installing}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                  >
                    {compatibleVersions.slice(0, 15).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_number} — {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div
                className="toast-banner"
                style={{ borderColor: "rgba(239, 68, 68, 0.55)", display: "flex", alignItems: "center", gap: 8 }}
              >
                <AlertTriangle size={15} />
                <span>
                  No compatible version of {hit.title} found for MC {selectedInstance?.mcVersion} ({selectedInstance?.loader}).
                </span>
              </div>
            )}

            {existingMod && !installedSummary && (
              <div
                className="toast-banner"
                style={{ borderColor: "rgba(251, 191, 36, 0.55)", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <AlertTriangle size={14} />
                  Already installed in {selectedInstance?.name} ({existingMod.versionNumber})
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={confirmOverwrite}
                    onChange={(e) => setConfirmOverwrite(e.target.checked)}
                  />
                  Confirm overwrite / replace existing mod file
                </label>
              </div>
            )}

            {installing && progressStage && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span className="spinner-ring" />
                <span>{progressStage}</span>
              </div>
            )}

            {installedSummary && (
              <div className="toast-banner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <CheckCircle2 size={15} />
                  <span>{installedSummary}</span>
                </div>
                {selectedInstance && (
                  <button
                    type="button"
                    className="glass-button glass-button--primary"
                    onClick={() => {
                      onClose();
                      onOpenInstanceMods(selectedInstance.id);
                    }}
                  >
                    <Package size={14} />
                    Open in Instance Mods Manager
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" className="glass-button" onClick={onClose}>
                Close
              </button>
              {!installedSummary && (
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={
                    checking ||
                    installing ||
                    !chosenVersion ||
                    (Boolean(existingMod) && !confirmOverwrite)
                  }
                  onClick={() => void handleInstall()}
                >
                  {installing ? (
                    <>
                      <span className="spinner-ring" style={{ borderTopColor: "#050c14" }} />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Install into {selectedInstance?.name}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
