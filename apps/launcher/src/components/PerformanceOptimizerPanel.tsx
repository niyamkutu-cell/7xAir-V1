import {
  Activity,
  CheckCircle2,
  Cpu,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  backupAndApplyJvmProfile,
  getJvmBackups,
  getSystemMemoryAudit,
  revertJvmBackup,
  runSafeCleanup,
  scanCleanupCenter,
  validateJvmArguments,
} from "../lib/tauriBridge";
import type {
  CleanupExecutionResult,
  CleanupScanReport,
  JvmBackupEntry,
  JvmValidationReport,
  LauncherSettings,
  SystemMemoryAudit,
} from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface PerformanceOptimizerPanelProps {
  settings: LauncherSettings;
  onSettingsChanged: (next: LauncherSettings) => void;
}

const FIVE_PROFILES = [
  {
    id: "max-performance",
    name: "Maximum Performance",
    ramMb: 4096,
    jvmArgs: "-XX:+UseZGC -XX:+AlwaysPreTouch -XX:+DisableExplicitGC -XX:+UnlockExperimentalVMOptions",
    explanation:
      "Minimizes GC pause spikes using Generational ZGC with pre-touched heap. Best for maximizing stable frame pacing on Java 21+.",
  },
  {
    id: "balanced",
    name: "Balanced",
    ramMb: 4096,
    jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:MaxGCPauseMillis=35",
    explanation:
      "Balanced memory footprint and smooth frame pacing for general survival, shaders, and everyday modpacks.",
  },
  {
    id: "visual-quality",
    name: "Visual Quality",
    ramMb: 6144,
    jvmArgs: "-XX:+UseG1GC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=25 -XX:MaxGCPauseMillis=40",
    explanation:
      "Extra heap headroom for higher render distances, HD resource packs, and shader pipelines without starving Windows.",
  },
  {
    id: "competitive-pvp",
    name: "Competitive PvP",
    ramMb: 4096,
    jvmArgs: "-XX:+UseZGC -XX:+AlwaysPreTouch -XX:+DisableExplicitGC",
    explanation:
      "Low-latency heap tuning for crisp hit registration and consistent 1% low FPS in PvP arenas.",
  },
  {
    id: "custom",
    name: "Custom",
    ramMb: 4096,
    jvmArgs: "",
    explanation:
      "Edit your own JVM arguments and RAM allocation below with automatic safety validation and backup before applying.",
  },
] as const;

export function PerformanceOptimizerPanel({
  settings,
  onSettingsChanged,
}: PerformanceOptimizerPanelProps) {
  const [audit, setAudit] = useState<SystemMemoryAudit | null>(null);
  const [cleanupScan, setCleanupScan] = useState<CleanupScanReport | null>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupExecutionResult | null>(null);
  const [jvmValidation, setJvmValidation] = useState<JvmValidationReport | null>(null);
  const [backups, setBackups] = useState<JvmBackupEntry[]>([]);
  const [customJvm, setCustomJvm] = useState(settings.jvmArgs);
  const [customRam, setCustomRam] = useState(settings.allocatedRamMb);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = async () => {
    const [memAudit, scan, bks] = await Promise.all([
      getSystemMemoryAudit().catch(() => null),
      scanCleanupCenter().catch(() => null),
      getJvmBackups().catch(() => []),
    ]);
    if (memAudit) setAudit(memAudit);
    if (scan) {
      setCleanupScan(scan);
      setSelectedCats(scan.categories.filter((c) => c.fileCount > 0).map((c) => c.id));
    }
    setBackups(bks);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const handleValidateJvm = async () => {
    const rep = await validateJvmArguments(customJvm, customRam, 21);
    setJvmValidation(rep);
  };

  const handleApplyWithBackup = async (label: string, args: string, ramMb: number) => {
    setError(null);
    setNotice(null);
    try {
      const validation = await validateJvmArguments(args, ramMb, 21);
      setJvmValidation(validation);
      if (!validation.valid) {
        setError(`Blocked invalid JVM configuration: ${validation.errors.join(" ")}`);
        return;
      }
      await backupAndApplyJvmProfile(label, args, ramMb);
      setCustomJvm(args);
      setCustomRam(ramMb);
      onSettingsChanged({ ...settings, jvmArgs: args, allocatedRamMb: ramMb });
      setBackups(await getJvmBackups());
      setNotice(`Backed up previous JVM args and applied "${label}" safely.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRevert = async (backupId: string) => {
    setError(null);
    try {
      const restored = await revertJvmBackup(backupId);
      setCustomJvm(restored.jvmArgs);
      setCustomRam(restored.allocatedRamMb);
      onSettingsChanged(restored);
      setNotice("Reverted JVM arguments and RAM allocation to the saved backup.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRunCleanup = async () => {
    setError(null);
    try {
      const res = await runSafeCleanup(selectedCats);
      setCleanupResult(res);
      setConfirmCleanup(false);
      await refreshAll();
      setNotice(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* A & B: Real System Telemetry, Java Processes & Memory Optimizer */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <Activity size={16} />
              Memory Optimizer &amp; Process Audit
            </h2>
            <div className="setting-desc">
              Real OS metrics — unavailable sensors are explicitly labeled instead of showing fake zeros. Protected OS, driver, security, and Java processes are never terminated.
            </div>
          </div>
          <button type="button" className="glass-button" onClick={() => void refreshAll()}>
            Refresh Audit
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <div className="glass-panel--subtle" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Available / Used RAM</div>
            <strong>
              {audit ? `${audit.availableRamMb} MB free / ${audit.usedRamMb} MB used` : "Loading..."}
            </strong>
          </div>
          <div className="glass-panel--subtle" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>GPU Utilization</div>
            <strong>
              {audit?.gpuUsagePercent != null ? `${audit.gpuUsagePercent}%` : "Unavailable on OS API"}
            </strong>
          </div>
          <div className="glass-panel--subtle" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Disk Activity</div>
            <strong>
              {audit?.diskActivityMbS != null ? `${audit.diskActivityMbS} MB/s` : "Unavailable on OS API"}
            </strong>
          </div>
          <div className="glass-panel--subtle" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Live FPS / Frame Time</div>
            <strong>
              {audit?.liveFps != null
                ? `${audit.liveFps} FPS (${audit.liveFrameTimeMs ?? "—"} ms)`
                : "In-game HUD only"}
            </strong>
          </div>
        </div>

        {audit && audit.recommendations.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            {audit.recommendations.join(" · ")}
          </div>
        )}

        {audit && (audit.javaProcesses.length > 0 || audit.topBackgroundConsumers.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {audit.javaProcesses.map((p) => (
              <div key={p.pid} className="glass-panel--subtle" style={{ padding: 9, fontSize: 12 }}>
                <strong>
                  <Cpu size={12} style={{ marginRight: 5 }} />
                  {p.name} (PID {p.pid})
                </strong>
                <div style={{ color: "var(--text-muted)" }}>
                  {p.ramMb} MB RAM · {p.cpuPercent}% CPU · {p.note}
                </div>
              </div>
            ))}
            {audit.topBackgroundConsumers.slice(0, 4).map((p) => (
              <div key={p.pid} className="glass-panel--subtle" style={{ padding: 9, fontSize: 12 }}>
                <strong>
                  {p.name} (PID {p.pid}) {p.isProtected ? "· Protected" : ""}
                </strong>
                <div style={{ color: "var(--text-muted)" }}>
                  {p.ramMb} MB RAM · {p.note}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* C: Safe Cleanup Center (Preview + Explicit Confirmation) */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <HardDrive size={16} />
              Safe Cleanup Center
            </h2>
            <div className="setting-desc">
              {cleanupScan?.safetyNote ??
                "Preview eligible temporary and cache files before any deletion. Personal files, worlds, screenshots, mods, and saves are strictly protected."}
            </div>
          </div>
          <span className="glass-pill">
            {cleanupScan
              ? `${cleanupScan.totalFiles} file(s) · ${(cleanupScan.totalBytes / (1024 * 1024)).toFixed(2)} MB`
              : "Scanning..."}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(cleanupScan?.categories ?? []).map((cat) => {
            const checked = selectedCats.includes(cat.id);
            return (
              <label
                key={cat.id}
                className="glass-panel--subtle"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedCats((prev) =>
                        prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id]
                      )
                    }
                  />
                  <span>
                    <strong style={{ fontSize: 12.5 }}>{cat.label}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{cat.description}</div>
                    {cat.sampleFiles.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        Preview: {cat.sampleFiles.join(", ")}
                      </div>
                    )}
                  </span>
                </span>
                <span className="glass-pill" style={{ fontSize: 11 }}>
                  {cat.fileCount} · {(cat.totalBytes / 1024).toFixed(1)} KB
                </span>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!confirmCleanup ? (
            <button
              type="button"
              className="glass-button glass-button--primary"
              disabled={selectedCats.length === 0}
              onClick={() => setConfirmCleanup(true)}
            >
              <Trash2 size={14} /> Preview &amp; Confirm Safe Cleanup
            </button>
          ) : (
            <>
              <button
                type="button"
                className="glass-button glass-button--primary"
                onClick={() => void handleRunCleanup()}
              >
                <CheckCircle2 size={14} /> Confirm Delete Selected Temp/Cache Files
              </button>
              <button
                type="button"
                className="glass-button"
                onClick={() => setConfirmCleanup(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </GlassPanel>

      {/* D & E: 5 Performance Profiles + JVM Validator & Safe Backup */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Sparkles size={16} />
          5 Safe Performance Profiles (Auto-Backup Before Apply)
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 14 }}>
          {FIVE_PROFILES.map((prof) => (
            <div key={prof.id} className="glass-panel--subtle" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <strong>{prof.name}</strong>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", flex: 1 }}>{prof.explanation}</div>
              {prof.id !== "custom" && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ marginTop: 4 }}
                  onClick={() => void handleApplyWithBackup(prof.name, prof.jvmArgs, prof.ramMb)}
                >
                  Backup &amp; Apply ({prof.ramMb} MB)
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Custom JVM Validation & Apply */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="glass-input"
            style={{ flex: "1 1 260px" }}
            value={customJvm}
            onChange={(e) => setCustomJvm(e.target.value)}
            placeholder="Custom JVM arguments..."
          />
          <input
            type="number"
            className="glass-input"
            style={{ width: 115 }}
            min={1024}
            max={32768}
            step={512}
            value={customRam}
            onChange={(e) => setCustomRam(Number(e.target.value) || 4096)}
          />
          <button type="button" className="glass-button" onClick={() => void handleValidateJvm()}>
            Validate JVM
          </button>
          <button
            type="button"
            className="glass-button glass-button--primary"
            onClick={() => void handleApplyWithBackup("Custom Profile", customJvm, customRam)}
          >
            Backup &amp; Apply Custom
          </button>
        </div>

        {jvmValidation && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <strong style={{ color: jvmValidation.valid ? "#86efac" : "#fca5a5" }}>
              {jvmValidation.valid ? "JVM Arguments Validated" : "JVM Validation Errors Found"}
            </strong>{" "}
            · Recommended RAM: {jvmValidation.recommendedRamMb} MB
            {jvmValidation.errors.length > 0 && (
              <div style={{ color: "#fca5a5", marginTop: 3 }}>{jvmValidation.errors.join(" · ")}</div>
            )}
            {jvmValidation.warnings.length > 0 && (
              <div style={{ color: "#fde047", marginTop: 3 }}>{jvmValidation.warnings.join(" · ")}</div>
            )}
          </div>
        )}
      </GlassPanel>

      {/* F: Honest Performance Report & Reversible Changes */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ShieldCheck size={16} />
          Performance Report &amp; Reversible Changes
        </h2>

        {cleanupResult && (
          <div className="glass-panel--subtle" style={{ padding: 10, marginBottom: 10, fontSize: 12 }}>
            <strong>Latest Cleanup Before / After:</strong> Used RAM {cleanupResult.usedRamMbBefore} MB →{" "}
            {cleanupResult.usedRamMbAfter} MB · Available RAM {cleanupResult.availableRamMbBefore} MB →{" "}
            {cleanupResult.availableRamMbAfter} MB · {cleanupResult.deletedFiles} file(s) removed (
            {(cleanupResult.freedBytes / (1024 * 1024)).toFixed(2)} MB freed).
          </div>
        )}

        {backups.length === 0 ? (
          <p className="hero-copy">
            No reversible JVM/profile changes recorded yet. Applying any profile automatically creates a 1-click backup here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {backups.slice(0, 5).map((bk) => (
              <div
                key={bk.id}
                className="glass-panel--subtle"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  fontSize: 12,
                }}
              >
                <div>
                  <strong>{bk.label}</strong> ({bk.previousRamMb} MB → {bk.appliedRamMb} MB)
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Previous args backed up safely — click Revert anytime to restore.
                  </div>
                </div>
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => void handleRevert(bk.id)}
                >
                  <RotateCcw size={13} /> Revert
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
