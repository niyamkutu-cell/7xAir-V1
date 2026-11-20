import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import {
  analyzeCrashLogs,
  applyPerformancePreset,
  getOptimizationRecommendations,
  getPerformanceTelemetry,
  runDiagnostics,
} from "../lib/tauriBridge";
import type {
  CrashAnalysisReport,
  DiagnosticsReport,
  GameInstance,
  LauncherSettings,
  OptimizationRecommendations,
  PerformanceTelemetry,
} from "../types/launcher";

interface PerformancePageProps {
  instances: GameInstance[];
  onSettingsUpdated: (next: LauncherSettings) => void;
  onRefreshInstances: () => Promise<void>;
}

export function PerformancePage({
  instances,
  onSettingsUpdated,
  onRefreshInstances,
}: PerformancePageProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    instances[0]?.id ?? ""
  );
  const [telemetry, setTelemetry] = useState<PerformanceTelemetry | null>(null);
  const [recs, setRecs] = useState<OptimizationRecommendations | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
  const [crashReport, setCrashReport] = useState<CrashAnalysisReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeInstanceId =
    instances.find((i) => i.id === selectedInstanceId)?.id ?? instances[0]?.id ?? "";

  const refreshAll = async (instId: string) => {
    try {
      const [tel, opt, diag] = await Promise.all([
        getPerformanceTelemetry(),
        getOptimizationRecommendations(instId || undefined),
        runDiagnostics(instId || undefined),
      ]);
      setTelemetry(tel);
      setRecs(opt);
      setDiagnostics(diag);
      if (instId) {
        setCrashReport(await analyzeCrashLogs(instId));
      } else {
        setCrashReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refreshAll(activeInstanceId);
  }, [activeInstanceId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void getPerformanceTelemetry().then(setTelemetry);
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

  const handleApplyPreset = async (presetId: string, scope: "global" | "instance") => {
    setError(null);
    setNotice(null);
    try {
      const updated = await applyPerformancePreset(
        presetId,
        scope === "instance" && activeInstanceId ? activeInstanceId : undefined
      );
      onSettingsUpdated(updated);
      await onRefreshInstances();
      await refreshAll(activeInstanceId);
      setNotice(
        `Applied '${presetId}' optimization preset to ${
          scope === "instance" && activeInstanceId ? "selected instance" : "global launcher settings"
        }.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance Center</h1>
          <p className="page-subtitle">
            Real-time hardware telemetry, G1GC optimization presets, diagnostics, compatibility, and crash-log analysis.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {instances.length > 0 && (
            <select
              aria-label="Inspect instance"
              className="glass-select"
              style={{ width: 210 }}
              value={activeInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} (MC {inst.mcVersion})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="glass-button"
            onClick={() => void refreshAll(activeInstanceId)}
          >
            <RefreshCw size={14} /> Run Diagnostics
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      <div className="stats-grid">
        <GlassPanel className="stat-card" interactive>
          <span className="stat-label">CPU Load</span>
          <span className="stat-value">
            {telemetry ? `${telemetry.cpuUsagePercent}% (${telemetry.cpuThreads}T)` : "—"}
          </span>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${Math.min(100, telemetry?.cpuUsagePercent ?? 0)}%` }}
            />
          </div>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <span className="stat-label">System RAM</span>
          <span className="stat-value">
            {telemetry
              ? `${(telemetry.usedRamMb / 1024).toFixed(1)} / ${(telemetry.totalRamMb / 1024).toFixed(1)} GB`
              : "—"}
          </span>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${Math.min(100, telemetry?.ramUsagePercent ?? 0)}%` }}
            />
          </div>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <span className="stat-label">Free Storage</span>
          <span className="stat-value">
            {telemetry ? `${telemetry.freeDiskGb.toFixed(1)} GB` : "—"}
          </span>
        </GlassPanel>
        <GlassPanel className="stat-card" interactive>
          <span className="stat-label">Health Score</span>
          <span className="stat-value">
            {diagnostics ? `${diagnostics.healthScore} / 100` : "—"}
          </span>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${Math.min(100, diagnostics?.healthScore ?? 0)}%` }}
            />
          </div>
        </GlassPanel>
      </div>

      {telemetry && (
        <GlassPanel className="panel-pad">
          <div className="path-mono">
            CPU: {telemetry.cpuBrand} | GPU: {telemetry.gpuName} | Minecraft Process:{" "}
            {telemetry.gameRunning
              ? `Running (PID ${telemetry.gamePid}, ${telemetry.gameRamMb ?? 0} MB RAM, ${
                  telemetry.gameCpuPercent?.toFixed(1) ?? "0.0"
                }% CPU)`
              : "Idle"}
          </div>
        </GlassPanel>
      )}

      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={16} /> Optimization Presets
          </h2>
          {recs?.warnings.map((w, idx) => (
            <div key={idx} className="toast-banner" style={{ marginBottom: 10 }}>
              {w}
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(recs?.presets ?? []).map((preset) => (
              <div
                key={preset.id}
                className="glass-panel--subtle"
                style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{preset.name}</strong>
                  <span className="nav-badge">{preset.recommendedRamMb} MB RAM</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {preset.description}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="glass-button glass-button--primary"
                    onClick={() => void handleApplyPreset(preset.id, "global")}
                  >
                    Apply Global
                  </button>
                  {activeInstanceId && (
                    <button
                      type="button"
                      className="glass-button"
                      onClick={() => void handleApplyPreset(preset.id, "instance")}
                    >
                      Apply to Instance
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} /> Recommended Fabric Optimization Mods
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(recs?.fabricMods ?? []).map((mod) => (
              <div
                key={mod.slug}
                className="glass-panel--subtle"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{mod.name}</strong>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{mod.reason}</div>
                </div>
                <span className="nav-badge">{mod.installed ? "Installed" : "Recommended"}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} /> System & Compatibility Diagnostics
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(diagnostics?.checks ?? []).map((chk) => (
              <div
                key={chk.id}
                className="glass-panel--subtle"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{chk.label}</strong>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{chk.detail}</div>
                </div>
                <span className="glass-pill" style={{ padding: "3px 8px", fontSize: 11 }}>
                  {chk.status === "pass" ? (
                    <>
                      <CheckCircle2 size={11} /> PASS
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={11} /> {chk.status.toUpperCase()}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileWarning size={16} /> Crash-Log Analyzer
          </h2>
          {!crashReport || !crashReport.analyzedFile ? (
            <p className="hero-copy">
              No crash reports or launch logs found for the selected instance yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="path-mono">
                Analyzed: {crashReport.analyzedFile} ({crashReport.crashReportsFound} crash report(s))
              </div>
              {crashReport.findings.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <Activity size={14} /> No known fatal crash signatures detected in the latest log.
                </div>
              ) : (
                crashReport.findings.map((f, idx) => (
                  <div
                    key={`${f.code}-${idx}`}
                    className="glass-panel--subtle"
                    style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <strong>
                      [{f.severity.toUpperCase()}] {f.title}
                    </strong>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.summary}</div>
                    <div style={{ fontSize: 12, color: "var(--accent)" }}>
                      Fix: {f.recommendation}
                    </div>
                    <div className="path-mono">{f.matchedLine}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
