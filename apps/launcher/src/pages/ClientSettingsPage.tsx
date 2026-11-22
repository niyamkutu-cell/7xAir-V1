import {
  CheckCircle2,
  Layers,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import {
  getClientIntegrity,
  removeInstanceClient,
  repairInstanceClient,
  setInstanceClientOverride,
  syncAllClients,
  updateInstanceClient,
} from "../lib/tauriBridge";
import { SEVEN_THEMES } from "../theme/themes";
import type {
  ClientIntegrityReport,
  ClientOverrideMode,
  GameInstance,
  LauncherSettings,
  ThemeId,
} from "../types/launcher";

interface ClientSettingsPageProps {
  settings: LauncherSettings;
  instances: GameInstance[];
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onRefreshInstances: () => Promise<void>;
}

export function ClientSettingsPage({
  settings,
  instances,
  onUpdateSettings,
  onRefreshInstances,
}: ClientSettingsPageProps) {
  const [reports, setReports] = useState<Record<string, ClientIntegrityReport>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fabricInstances = instances.filter((i) => i.loader === "fabric");

  const refreshReports = async () => {
    const entries = await Promise.all(
      fabricInstances.map(async (inst) => {
        try {
          const rep = await getClientIntegrity(inst.id);
          return [inst.id, rep] as const;
        } catch {
          return null;
        }
      })
    );
    const next: Record<string, ClientIntegrityReport> = {};
    for (const item of entries) {
      if (item) next[item[0]] = item[1];
    }
    setReports(next);
  };

  useEffect(() => {
    void refreshReports();
  }, [instances.length, settings.autoInstallClient]);

  const handleSyncAll = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const synced = await syncAllClients();
      const map: Record<string, ClientIntegrityReport> = {};
      for (const r of synced) map[r.instanceId] = r;
      setReports(map);
      setNotice(`Synchronized 7xAir Fabric client across ${synced.length} instance(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runInstanceAction = async (
    instanceId: string,
    label: string,
    fn: () => Promise<ClientIntegrityReport>
  ) => {
    setError(null);
    setNotice(null);
    try {
      const rep = await fn();
      setReports((prev) => ({ ...prev, [instanceId]: rep }));
      await onRefreshInstances();
      setNotice(`${label}: ${rep.healthy ? "Healthy" : rep.issues.join("; ") || "Updated"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Settings</h1>
          <p className="page-subtitle">
            Manage the automatic 7xAir translucent glass Fabric client, per-instance overrides, integrity verification, and HUD theme sync.
          </p>
        </div>
        <button
          type="button"
          className="glass-button glass-button--primary"
          disabled={busy}
          onClick={() => void handleSyncAll()}
        >
          {busy ? <span className="spinner-ring" style={{ borderTopColor: "#050c14" }} /> : <RefreshCw size={14} />}
          Sync All Instances
        </button>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} />
          Global 7xAir Fabric Client Policy
        </h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">AUTO-INSTALL 7XAIR CLIENT MOD</div>
            <div className="setting-desc">
              ON: Automatically installs, verifies metadata/SHA-256, backs up before updating, and isolates the 7xAir client per instance (1.21.11 &amp; 26.2). OFF: Stops auto-installs/updates without deleting existing JARs.
            </div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${settings.autoInstallClient ? "toggle-btn--on" : ""}`}
            onClick={() =>
              void onUpdateSettings({ autoInstallClient: !settings.autoInstallClient })
            }
          >
            {settings.autoInstallClient ? "ON" : "OFF"}
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Synced In-Game HUD Theme</div>
            <div className="setting-desc">
              Your launcher theme automatically syncs to the translucent floating glass ClickGUI (Right Shift) and HUD Editor (H).
            </div>
          </div>
          <select
            aria-label="Synced client theme"
            className="glass-select"
            style={{ width: 200 }}
            value={settings.theme}
            onChange={(e) => void onUpdateSettings({ theme: e.target.value as ThemeId })}
          >
            {SEVEN_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">
              Floating Glass Opacity ({Math.round(settings.glassOpacity * 100)}%)
            </div>
            <div className="setting-desc">
              Controls translucent glass depth across the launcher and synced in-game panels.
            </div>
          </div>
          <input
            type="range"
            aria-label="Client glass opacity"
            min={0.35}
            max={0.95}
            step={0.02}
            value={settings.glassOpacity}
            onChange={(e) => void onUpdateSettings({ glassOpacity: Number(e.target.value) })}
            style={{ width: 200 }}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={16} />
          Per-Instance Client Overrides & Integrity ({fabricInstances.length} Fabric)
        </h2>

        {fabricInstances.length === 0 ? (
          <p className="hero-copy">
            No Fabric instances yet. Create a Minecraft 1.21.11 or 26.2 Fabric instance in the Instances tab to manage per-instance client settings.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fabricInstances.map((inst) => {
              const rep = reports[inst.id];
              return (
                <div
                  key={inst.id}
                  className="glass-panel--subtle"
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{inst.name}</strong>
                      <span className="nav-badge">MC {inst.mcVersion}</span>
                      {rep && (
                        <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                          <CheckCircle2 size={11} />
                          {rep.installed
                            ? rep.healthy
                              ? "Verified Installed"
                              : "Needs Repair"
                            : rep.effectiveEnabled
                              ? "Pending Sync"
                              : "Disabled"}
                        </span>
                      )}
                    </div>
                    {rep && (
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                        {rep.statusMessage}
                        {rep.installedVersion ? ` · Installed: v${rep.installedVersion}` : ""}
                        {rep.updateAvailable && rep.bundleVersion ? ` · Update: v${rep.bundleVersion}` : ""}
                        {rep.lastBackupPath ? " · Previous JAR backed up" : ""}
                      </div>
                    )}
                    {rep && rep.issues.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "#fca5a5", marginTop: 3 }}>
                        {rep.issues.join(" · ")}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <select
                      aria-label={`Client override for ${inst.name}`}
                      className="glass-select"
                      style={{ width: 175 }}
                      value={inst.clientOverride}
                      onChange={(e) =>
                        void runInstanceAction(inst.id, `${inst.name} override`, () =>
                          setInstanceClientOverride(inst.id, e.target.value as ClientOverrideMode)
                        )
                      }
                    >
                      <option value="inherit">
                        Inherit Global ({settings.autoInstallClient ? "ON" : "OFF"})
                      </option>
                      <option value="force_on">Force ON</option>
                      <option value="force_off">Force OFF</option>
                    </select>

                    <button
                      type="button"
                      className="glass-button"
                      onClick={() =>
                        void runInstanceAction(inst.id, `Updated ${inst.name}`, () =>
                          updateInstanceClient(inst.id)
                        )
                      }
                    >
                      <RefreshCw size={13} /> Update
                    </button>

                    <button
                      type="button"
                      className="glass-button"
                      onClick={() =>
                        void runInstanceAction(inst.id, `Repaired ${inst.name}`, () =>
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
                        void runInstanceAction(inst.id, `Removed client from ${inst.name}`, () =>
                          removeInstanceClient(inst.id)
                        )
                      }
                    >
                      <Trash2 size={13} /> Remove
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
