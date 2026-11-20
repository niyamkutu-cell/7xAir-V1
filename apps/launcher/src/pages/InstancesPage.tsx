import {
  ArrowUpCircle,
  Copy,
  FolderOpen,
  Cpu,
  Package,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import {
  fetchFabricLoaders,
  getClientIntegrity,
  openInstanceFolder,
  removeInstanceClient,
  repairInstanceClient,
  setInstanceClientOverride,
  syncAllClients,
  updateInstanceClient,
} from "../lib/tauriBridge";
import type {
  ClientIntegrityReport,
  ClientOverrideMode,
  CreateInstanceRequest,
  FabricLoaderOption,
  GameInstance,
  JavaInstallation,
  LauncherSettings,
  LaunchStatus,
  MinecraftMetadataSummary,
} from "../types/launcher";

interface InstancesPageProps {
  instances: GameInstance[];
  metadata: MinecraftMetadataSummary | null;
  javaInstallations: JavaInstallation[];
  settings: LauncherSettings;
  launchStatus: LaunchStatus;
  onRefreshMetadata: () => Promise<void>;
  onRefreshJava: () => Promise<void>;
  onRefreshInstances: () => Promise<void>;
  onCreateInstance: (req: CreateInstanceRequest) => Promise<void>;
  onCloneInstance: (sourceId: string, newName: string) => Promise<void>;
  onDeleteInstance: (instanceId: string) => Promise<void>;
  onManageContent: (instanceId: string) => void;
  onLaunchInstance: (instanceId: string) => Promise<void>;
  onStopInstance: () => Promise<void>;
}

export function InstancesPage({
  instances,
  metadata,
  javaInstallations,
  settings,
  launchStatus,
  onRefreshMetadata,
  onRefreshJava,
  onRefreshInstances,
  onCreateInstance,
  onCloneInstance,
  onDeleteInstance,
  onManageContent,
  onLaunchInstance,
  onStopInstance,
}: InstancesPageProps) {
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState<string>(settings.defaultMcVersion);
  const [loader, setLoader] = useState<"fabric" | "vanilla">("fabric");
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderOption[]>([]);
  const [selectedLoaderVer, setSelectedLoaderVer] = useState<string>("");
  const [clientOverride, setClientOverride] = useState<ClientOverrideMode>("inherit");
  const [ramOverride, setRamOverride] = useState<string>("");
  const [integrityReport, setIntegrityReport] = useState<ClientIntegrityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchFabricLoaders(mcVersion).then((list) => {
      if (!active) return;
      setFabricLoaders(list);
      const rec = list.find((item) => item.recommended) ?? list[0];
      setSelectedLoaderVer(rec?.version ?? "");
    });
    return () => {
      active = false;
    };
  }, [mcVersion]);

  const versionChoices = ["1.21.11", "26.2"] as const;

  const handleCreate = async () => {
    setError(null);
    setNotice(null);
    try {
      const effectiveAuto =
        loader === "fabric" &&
        (clientOverride === "force_on" ||
          (clientOverride === "inherit" && settings.autoInstallClient));
      await onCreateInstance({
        name: name.trim(),
        mcVersion,
        loader,
        fabricLoaderVersion: loader === "fabric" ? selectedLoaderVer || null : null,
        autoInstallClient: effectiveAuto,
        clientOverride: loader === "fabric" ? clientOverride : "force_off",
        ramMbOverride: ramOverride.trim() ? Number(ramOverride) : null,
      });
      setName("");
      setRamOverride("");
      setNotice(`Created independent instance for Minecraft ${mcVersion} (${loader}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClone = async (inst: GameInstance) => {
    setError(null);
    setNotice(null);
    try {
      await onCloneInstance(inst.id, `${inst.name} Copy`);
      setNotice(`Cloned '${inst.name}' into an independent instance directory.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runClientAction = async (
    label: string,
    fn: () => Promise<ClientIntegrityReport>
  ) => {
    setError(null);
    setNotice(null);
    try {
      const report = await fn();
      setIntegrityReport(report);
      await onRefreshInstances();
      setNotice(`${label}: ${report.healthy ? "Healthy" : `${report.issues.length} issue(s) found`}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Independent Instances & 7xAir Client Manager</h1>
          <p className="page-subtitle">
            Global Auto-Client is <strong>{settings.autoInstallClient ? "ON" : "OFF"}</strong>. Override per instance, update, repair, remove, or verify SHA-256 integrity.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="glass-button"
            onClick={() => {
              void syncAllClients().then((reports) => {
                setNotice(`Synchronized 7xAir Client across ${reports.length} instance(s).`);
                void onRefreshInstances();
              });
            }}
          >
            <ShieldCheck size={14} /> Sync All Clients
          </button>
          <button type="button" className="glass-button" onClick={() => void onRefreshMetadata()}>
            <RefreshCw size={14} /> Sync Mojang Meta
          </button>
          <button type="button" className="glass-button" onClick={() => void onRefreshJava()}>
            <Cpu size={14} /> Scan Java
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title">Create New Instance</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Instance name (e.g. PvP 1.21.11)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <select
                aria-label="Minecraft version"
                className="glass-select"
                value={mcVersion}
                onChange={(e) => setMcVersion(e.target.value)}
              >
                {versionChoices.map((ver) => (
                  <option key={ver} value={ver}>
                    Minecraft {ver}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select
                  aria-label="Fabric loader version"
                  className="glass-select"
                  value={selectedLoaderVer}
                  onChange={(e) => setSelectedLoaderVer(e.target.value)}
                >
                  {fabricLoaders.map((fl) => (
                    <option key={fl.version} value={fl.version}>
                      Fabric {fl.version}{" "}
                      {fl.recommended ? "(Recommended)" : fl.stable ? "(Stable)" : "(Beta)"}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="7xAir Client override mode"
                  className="glass-select"
                  value={clientOverride}
                  onChange={(e) => setClientOverride(e.target.value as ClientOverrideMode)}
                >
                  <option value="inherit">
                    7xAir Client: Inherit ({settings.autoInstallClient ? "ON" : "OFF"})
                  </option>
                  <option value="force_on">7xAir Client: Force ON</option>
                  <option value="force_off">7xAir Client: Force OFF</option>
                </select>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
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
                <Plus size={15} /> Create Instance
              </button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title">Mojang Targets & Java Runtimes</h2>
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
            Detected Java ({javaInstallations.length}):
          </div>
          {javaInstallations.length === 0 ? (
            <div className="path-mono">No Java runtime detected. Set path in Settings or install Java 21.</div>
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

      <GlassPanel className="panel-pad">
        <h2 className="section-title">Managed Instances ({instances.length})</h2>
        {instances.length === 0 ? (
          <p className="hero-copy">No instances yet. Create your first 1.21.11 or 26.2 instance above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {instances.map((inst) => {
              const isRunning = launchStatus.running && launchStatus.instanceId === inst.id;
              return (
                <div
                  key={inst.id}
                  className="glass-panel--subtle"
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{inst.name}</strong>
                        <span className="nav-badge">MC {inst.mcVersion}</span>
                        <span className="nav-badge">
                          {inst.loader === "fabric"
                            ? `Fabric ${inst.fabricLoaderVersion ?? "auto"}`
                            : "Vanilla"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                        {inst.instanceDir}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="glass-button"
                        onClick={() => onManageContent(inst.id)}
                      >
                        <Package size={14} /> Mods & Packs
                      </button>

                      <button
                        type="button"
                        className="glass-button"
                        title={`Open folder for ${inst.name}`}
                        onClick={() =>
                          void openInstanceFolder(inst.id).catch((err) =>
                            setError(err instanceof Error ? err.message : String(err))
                          )
                        }
                      >
                        <FolderOpen size={14} /> Open Folder
                      </button>

                      <button
                        type="button"
                        className="glass-button"
                        aria-label={`Clone ${inst.name}`}
                        onClick={() => void handleClone(inst)}
                      >
                        <Copy size={14} />
                      </button>

                      {isRunning ? (
                        <button
                          type="button"
                          className="glass-button"
                          onClick={() => void onStopInstance()}
                        >
                          <Square size={14} /> Stop (PID {launchStatus.pid})
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="glass-button glass-button--primary"
                          onClick={() => void onLaunchInstance(inst.id)}
                        >
                          <Play size={14} /> Launch
                        </button>
                      )}

                      <button
                        type="button"
                        className="glass-button"
                        aria-label={`Delete ${inst.name}`}
                        onClick={() => void onDeleteInstance(inst.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {inst.loader === "fabric" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        paddingTop: 8,
                        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                      }}
                    >
                      <select
                        aria-label={`7xAir Client override for ${inst.name}`}
                        className="glass-select"
                        style={{ width: 210 }}
                        value={inst.clientOverride ?? "inherit"}
                        onChange={(e) =>
                          void runClientAction("Override updated", () =>
                            setInstanceClientOverride(
                              inst.id,
                              e.target.value as ClientOverrideMode
                            )
                          )
                        }
                      >
                        <option value="inherit">
                          Client: Inherit ({settings.autoInstallClient ? "ON" : "OFF"})
                        </option>
                        <option value="force_on">Client: Force ON</option>
                        <option value="force_off">Client: Force OFF</option>
                      </select>

                      <button
                        type="button"
                        className="glass-button"
                        onClick={() =>
                          void runClientAction("Integrity check", () =>
                            getClientIntegrity(inst.id)
                          )
                        }
                      >
                        <ShieldCheck size={13} /> Verify
                      </button>
                      <button
                        type="button"
                        className="glass-button"
                        onClick={() =>
                          void runClientAction("Client updated", () =>
                            updateInstanceClient(inst.id)
                          )
                        }
                      >
                        <ArrowUpCircle size={13} /> Update
                      </button>
                      <button
                        type="button"
                        className="glass-button"
                        onClick={() =>
                          void runClientAction("Client repaired", () =>
                            repairInstanceClient(inst.id)
                          )
                        }
                      >
                        <Wrench size={13} /> Repair
                      </button>
                      <button
                        type="button"
                        className="glass-button"
                        onClick={() =>
                          void runClientAction("Client removed", () =>
                            removeInstanceClient(inst.id)
                          )
                        }
                      >
                        Remove Client
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {integrityReport && (
        <GlassPanel className="panel-pad">
          <h2 className="section-title">
            7xAir Client Integrity Report ({integrityReport.mcVersion} ·{" "}
            {integrityReport.healthy ? "Healthy" : "Attention Needed"})
          </h2>
          <div className="path-mono" style={{ marginBottom: 8 }}>
            Override: {integrityReport.overrideMode} | Effective:{" "}
            {integrityReport.effectiveEnabled ? "ON" : "OFF"} | Bundle:{" "}
            {integrityReport.bundleAvailable ? integrityReport.bundleVersion : "Not staged"} |
            ZIP Header: {integrityReport.validZipHeader ? "OK" : "N/A"} | SHA-256 Match:{" "}
            {integrityReport.hashMatchesBundle ? "MATCH" : "MISMATCH/NONE"}
          </div>
          {integrityReport.issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {integrityReport.issues.map((issue, idx) => (
                <div key={idx} className="path-mono">
                  {issue}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {launchStatus.logs.length > 0 && (
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={15} />
            Live Launch Console {launchStatus.running ? `(PID ${launchStatus.pid})` : ""}
          </h2>
          <pre
            className="path-mono"
            style={{
              maxHeight: 200,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {launchStatus.logs.join("\n")}
          </pre>
        </GlassPanel>
      )}
    </div>
  );
}
