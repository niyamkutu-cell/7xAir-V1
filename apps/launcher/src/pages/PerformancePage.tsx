import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileWarning,
  Gauge,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { DEFAULT_SETTINGS, NAV_ITEMS } from "../lib/defaults";
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
  JavaInstallation,
  LauncherSettings,
  NavRoute,
  OptimizationRecommendations,
  PerformanceTelemetry,
} from "../types/launcher";

interface PerformancePageProps {
  instances: GameInstance[];
  settings: LauncherSettings;
  javaInstallations: JavaInstallation[];
  onSettingsUpdated: (next: LauncherSettings) => void;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
  onRefreshInstances: () => Promise<void>;
}

const SAFE_FPS_FLAGS = [
  {
    flag: "-XX:+UseG1GC",
    label: "G1 Garbage Collector",
    desc: "Reduces long GC pauses compared to legacy collectors.",
  },
  {
    flag: "-XX:+AlwaysPreTouch",
    label: "Pre-Touch Heap Memory",
    desc: "Allocates heap pages on launch to reduce in-game micro-stutters.",
  },
  {
    flag: "-XX:+DisableExplicitGC",
    label: "Disable Explicit System.gc()",
    desc: "Prevents mods from triggering sudden full-heap freeze spikes.",
  },
  {
    flag: "-XX:+ParallelRefProcEnabled",
    label: "Parallel Reference Processing",
    desc: "Uses multiple CPU threads during GC reference cleanup.",
  },
] as const;

export function PerformancePage({
  instances,
  settings,
  javaInstallations,
  onSettingsUpdated,
  onUpdateSettings,
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
    }, 3000);
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
        `Applied '${presetId}' profile to ${
          scope === "instance" && activeInstanceId ? "selected instance" : "global launcher settings"
        }.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleJvmFlag = async (flag: string) => {
    const parts = settings.jvmArgs.split(/\s+/).filter(Boolean);
    const hasFlag = parts.includes(flag);
    const nextParts = hasFlag ? parts.filter((f) => f !== flag) : [...parts, flag];
    await onUpdateSettings({ jvmArgs: nextParts.join(" ") });
    setNotice(`${hasFlag ? "Removed" : "Enabled"} JVM flag ${flag}`);
  };

  const handleRevertPerformanceDefaults = async () => {
    await onUpdateSettings({
      allocatedRamMb: recs?.recommendedRamMb ?? DEFAULT_SETTINGS.allocatedRamMb,
      jvmArgs: DEFAULT_SETTINGS.jvmArgs,
      javaPath: "",
      pauseEffectsInGame: true,
    });
    setNotice("Reverted memory, Java, and JVM flags to safe recommended defaults.");
  };

  const xmsMb = Math.max(512, Math.floor(settings.allocatedRamMb / 2));

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance Center</h1>
          <p className="page-subtitle">
            FPS boost tuning, memory & Java configuration, reversible profiles, background resource management, and read-only crash analysis.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

          <button
            type="button"
            className="glass-button"
            onClick={() => void handleRevertPerformanceDefaults()}
          >
            <RotateCcw size={14} /> Revert Defaults
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Live System Telemetry Strip */}
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
        <GlassPanel className="panel-pad" style={{ padding: "12px 18px" }}>
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

      {/* Module 5: Performance Profiles + Module 1: FPS Boost */}
      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={16} /> Performance Profiles
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
            <Zap size={16} /> FPS Boost (Safe & Reversible)
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            {SAFE_FPS_FLAGS.map((item) => {
              const enabled = settings.jvmArgs.split(/\s+/).includes(item.flag);
              return (
                <div key={item.flag} className="setting-row" style={{ padding: "9px 0" }}>
                  <div>
                    <div className="setting-label">{item.label}</div>
                    <div className="setting-desc">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${enabled ? "toggle-btn--on" : ""}`}
                    onClick={() => void toggleJvmFlag(item.flag)}
                  >
                    {enabled ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })}
          </div>

          <h3 className="section-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} /> Recommended Fabric FPS Mods
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(recs?.fabricMods ?? []).map((mod) => (
              <div
                key={mod.slug}
                className="glass-panel--subtle"
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 12.5 }}>{mod.name}</strong>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{mod.reason}</div>
                </div>
                <span className="nav-badge">{mod.installed ? "Installed" : "Recommended"}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      {/* Module 2: Memory Management + Module 3 & 4: Java Configuration & JVM Arguments */}
      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={16} /> Memory Management
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 12 }}>
            <div className="glass-panel--subtle" style={{ padding: "10px 12px" }}>
              <div className="stat-label">Allocated RAM</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {settings.allocatedRamMb} MB ({(settings.allocatedRamMb / 1024).toFixed(1)} GB)
              </div>
            </div>
            <div className="glass-panel--subtle" style={{ padding: "10px 12px" }}>
              <div className="stat-label">Max System RAM</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {telemetry ? `${telemetry.totalRamMb} MB` : "Detecting..."}
              </div>
            </div>
            <div className="glass-panel--subtle" style={{ padding: "10px 12px" }}>
              <div className="stat-label">Recommended Allocation</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {recs ? `${recs.recommendedRamMb} MB` : "4096 MB"}
              </div>
            </div>
            <div className="glass-panel--subtle" style={{ padding: "10px 12px" }}>
              <div className="stat-label">Java Heap Flags</div>
              <div className="stat-value" style={{ fontSize: 13.5 }}>
                -Xms{xmsMb}M -Xmx{settings.allocatedRamMb}M
              </div>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Heap Allocation Slider</div>
              <div className="setting-desc">
                Keep headroom for Windows & GPU drivers to avoid swap stuttering.
              </div>
            </div>
            <input
              type="range"
              aria-label="Memory allocation MB"
              min={1024}
              max={16384}
              step={512}
              value={settings.allocatedRamMb}
              onChange={(e) =>
                void onUpdateSettings({ allocatedRamMb: Number(e.target.value) })
              }
              style={{ width: 190 }}
            />
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Cpu size={16} /> Java Configuration & JVM Arguments
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Java Executable Path (blank = auto-detect Java 21+)
              <input
                type="text"
                className="glass-input"
                style={{ marginTop: 4 }}
                placeholder="C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe"
                value={settings.javaPath}
                onChange={(e) => void onUpdateSettings({ javaPath: e.target.value })}
              />
            </label>

            {javaInstallations.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {javaInstallations.slice(0, 3).map((j) => (
                  <button
                    key={j.path}
                    type="button"
                    className="glass-button"
                    style={{ padding: "5px 10px", fontSize: 11.5 }}
                    onClick={() => void onUpdateSettings({ javaPath: j.path })}
                  >
                    Use Java {j.majorVersion} ({j.vendor})
                  </button>
                ))}
              </div>
            )}

            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Terminal size={13} /> JVM Arguments
              </span>
              <input
                type="text"
                className="glass-input"
                style={{ marginTop: 4 }}
                value={settings.jvmArgs}
                onChange={(e) => void onUpdateSettings({ jvmArgs: e.target.value })}
              />
            </label>
          </div>
        </GlassPanel>
      </div>

      {/* Module 7: Startup Optimization + Module 8: Background Resource Management */}
      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sliders size={16} /> Startup Optimization
          </h2>

          <div className="setting-row">
            <div>
              <div className="setting-label">Initial Startup Page</div>
              <div className="setting-desc">Open directly into your preferred workspace tab.</div>
            </div>
            <select
              aria-label="Startup screen"
              className="glass-select"
              style={{ width: 170 }}
              value={settings.startupRoute}
              onChange={(e) =>
                void onUpdateSettings({ startupRoute: e.target.value as NavRoute })
              }
            >
              {NAV_ITEMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Launch on Windows Startup</div>
              <div className="setting-desc">Pre-warm launcher state when signing in to Windows.</div>
            </div>
            <button
              type="button"
              className={`toggle-btn ${settings.launchOnStartup ? "toggle-btn--on" : ""}`}
              onClick={() =>
                void onUpdateSettings({ launchOnStartup: !settings.launchOnStartup })
              }
            >
              {settings.launchOnStartup ? "ON" : "OFF"}
            </button>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={16} /> Background Resource Management
          </h2>

          <div className="setting-row">
            <div>
              <div className="setting-label">Pause Launcher Effects While Playing</div>
              <div className="setting-desc">
                Stops 3D WebGL rendering, particles, and CSS animations while Minecraft is running or minimized.
              </div>
            </div>
            <button
              type="button"
              className={`toggle-btn ${settings.pauseEffectsInGame ? "toggle-btn--on" : ""}`}
              onClick={() =>
                void onUpdateSettings({ pauseEffectsInGame: !settings.pauseEffectsInGame })
              }
            >
              {settings.pauseEffectsInGame ? "ON" : "OFF"}
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Close Launcher on Game Start</div>
              <div className="setting-desc">Frees WebView memory while playing Minecraft.</div>
            </div>
            <button
              type="button"
              className={`toggle-btn ${settings.closeOnLaunch ? "toggle-btn--on" : ""}`}
              onClick={() =>
                void onUpdateSettings({ closeOnLaunch: !settings.closeOnLaunch })
              }
            >
              {settings.closeOnLaunch ? "ON" : "OFF"}
            </button>
          </div>
        </GlassPanel>
      </div>

      {/* Module 6: Diagnostics & Read-Only Crash Analyzer */}
      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} /> Instance Diagnostics
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(diagnostics?.checks ?? []).map((chk) => (
              <div
                key={chk.id}
                className="glass-panel--subtle"
                style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                {chk.status === "pass" ? (
                  <CheckCircle2 size={15} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertTriangle
                    size={15}
                    color={chk.status === "fail" ? "#f87171" : "#fbbf24"}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                )}
                <div>
                  <strong style={{ fontSize: 13 }}>{chk.label}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {chk.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileWarning size={16} /> Crash Analyzer (Read-Only)
          </h2>
          {!crashReport ? (
            <p className="hero-copy">
              Select an instance above to inspect its crash reports and latest.log without modifying any user files.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="path-mono">
                Crash Reports Found: {crashReport.crashReportsFound} | Analyzed:{" "}
                {crashReport.analyzedFile ?? "None"}
              </div>
              {crashReport.findings.length === 0 ? (
                <div className="toast-banner">
                  No known mod conflict, missing dependency, Java, loader, or memory crash signatures detected.
                </div>
              ) : (
                crashReport.findings.map((f, idx) => (
                  <div
                    key={`${f.code}-${idx}`}
                    className="glass-panel--subtle"
                    style={{
                      padding: "10px 12px",
                      borderColor:
                        f.severity === "critical"
                          ? "rgba(239, 68, 68, 0.5)"
                          : "rgba(251, 191, 36, 0.45)",
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>{f.title}</strong>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                      {f.summary}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 4 }}>
                      Suggested fix: {f.recommendation}
                    </div>
                    {f.matchedLine && (
                      <div className="path-mono" style={{ marginTop: 6, fontSize: 10.5 }}>
                        {f.matchedLine}
                      </div>
                    )}
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
