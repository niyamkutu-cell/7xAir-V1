use crate::client_manager::{check_client_integrity, ClientIntegrityReport};
use crate::config::LauncherSettings;
use crate::instances::GameInstance;
use crate::java::detect_java_installations;
use crate::modrinth::{list_installed_content, run_compatibility_checks, CompatibilityReport};
use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use sysinfo::{Disks, Pid, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceTelemetry {
    pub cpu_brand: String,
    pub cpu_threads: usize,
    pub cpu_usage_percent: f32,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    pub ram_usage_percent: f32,
    pub free_disk_gb: f64,
    pub gpu_name: String,
    pub game_running: bool,
    pub game_pid: Option<u32>,
    pub game_ram_mb: Option<u64>,
    pub game_cpu_percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationPreset {
    pub id: String, // "competitive_pvp" | "balanced" | "low_end"
    pub name: String,
    pub description: String,
    pub recommended_ram_mb: u32,
    pub jvm_args: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedModHint {
    pub slug: String,
    pub name: String,
    pub reason: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationRecommendations {
    pub presets: Vec<OptimizationPreset>,
    pub recommended_ram_mb: u32,
    pub warnings: Vec<String>,
    pub fabric_mods: Vec<RecommendedModHint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCheckItem {
    pub id: String,
    pub label: String,
    pub status: String, // "pass" | "warning" | "fail"
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub overall_status: String, // "healthy" | "warning" | "critical"
    pub health_score: u32,
    pub checks: Vec<DiagnosticCheckItem>,
    pub compatibility: Option<CompatibilityReport>,
    pub client_integrity: Option<ClientIntegrityReport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashFinding {
    pub code: String,
    pub severity: String, // "critical" | "warning"
    pub title: String,
    pub summary: String,
    pub recommendation: String,
    pub matched_line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashAnalysisReport {
    pub instance_id: String,
    pub analyzed_file: Option<String>,
    pub crash_reports_found: usize,
    pub findings: Vec<CrashFinding>,
    pub excerpt: Vec<String>,
}

static GPU_NAME_CACHE: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn detect_gpu_name() -> String {
    GPU_NAME_CACHE
        .get_or_init(|| {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                if let Ok(output) = Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-NonInteractive",
                        "-WindowStyle",
                        "Hidden",
                        "-Command",
                        "$gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name; $ded = $gpus | Where-Object { $_ -match 'NVIDIA|GeForce|RTX|GTX|Radeon|RX' } | Select-Object -First 1; if ($ded) { $ded } else { $gpus | Select-Object -First 1 }",
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                {
                    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !name.is_empty() {
                        return name;
                    }
                }
            }
            "Auto-detected GPU".to_string()
        })
        .clone()
}

fn free_disk_space_gb(target_path: &Path) -> f64 {
    let disks = Disks::new_with_refreshed_list();
    let mut best_match_len = 0usize;
    let mut best_free_bytes = 0u64;

    for disk in disks.list() {
        let mount = disk.mount_point();
        if target_path.starts_with(mount) {
            let len = mount.as_os_str().len();
            if len >= best_match_len {
                best_match_len = len;
                best_free_bytes = disk.available_space();
            }
        }
    }

    if best_free_bytes == 0 {
        if let Some(first) = disks.list().first() {
            best_free_bytes = first.available_space();
        }
    }
    (best_free_bytes as f64) / (1024.0 * 1024.0 * 1024.0)
}

pub fn collect_performance_telemetry(
    paths: &LauncherPaths,
    running_pid: Option<u32>,
) -> PerformanceTelemetry {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::new()
            .with_cpu(sysinfo::CpuRefreshKind::everything())
            .with_memory(sysinfo::MemoryRefreshKind::everything()),
    );

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_threads = sys.cpus().len().max(1);
    let cpu_usage_percent = sys.global_cpu_usage();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let used_ram_mb = sys.used_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);
    let ram_usage_percent = if total_ram_mb > 0 {
        (used_ram_mb as f32 / total_ram_mb as f32) * 100.0
    } else {
        0.0
    };

    let (game_ram_mb, game_cpu_percent) = if let Some(pid_u32) = running_pid {
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[Pid::from_u32(pid_u32)]));
        if let Some(proc) = sys.process(Pid::from_u32(pid_u32)) {
            (Some(proc.memory() / (1024 * 1024)), Some(proc.cpu_usage()))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    PerformanceTelemetry {
        cpu_brand,
        cpu_threads,
        cpu_usage_percent: (cpu_usage_percent * 10.0).round() / 10.0,
        total_ram_mb,
        used_ram_mb,
        available_ram_mb,
        ram_usage_percent: (ram_usage_percent * 10.0).round() / 10.0,
        free_disk_gb: (free_disk_space_gb(Path::new(&paths.root_dir)) * 10.0).round() / 10.0,
        gpu_name: detect_gpu_name(),
        game_running: running_pid.is_some(),
        game_pid: running_pid,
        game_ram_mb,
        game_cpu_percent,
    }
}

pub fn build_optimization_recommendations(
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    instance: Option<&GameInstance>,
) -> OptimizationRecommendations {
    let telemetry = collect_performance_telemetry(paths, None);
    let total_ram = telemetry.total_ram_mb.max(4096);

    // Avoid over-allocating heap (too much heap increases G1GC pause spikes in PvP)
    let pvp_ram: u32 = if total_ram >= 16384 {
        4096
    } else if total_ram >= 8192 {
        3072
    } else {
        2048
    };
    let balanced_ram: u32 = if total_ram >= 16384 {
        6144
    } else if total_ram >= 8192 {
        4096
    } else {
        2560
    };
    let low_end_ram: u32 = if total_ram >= 8192 { 2560 } else { 2048 };

    let max_fps_ram: u32 = if total_ram >= 16384 {
        6144
    } else if total_ram >= 8192 {
        4096
    } else {
        2560
    };

    let detected_java_major = detect_java_installations(paths)
        .first()
        .map(|j| j.major_version)
        .unwrap_or(21);
    let max_perf_jvm = if detected_java_major >= 23 {
        "-XX:+UseZGC -XX:+AlwaysPreTouch -XX:+DisableExplicitGC -XX:+UnlockExperimentalVMOptions".to_string()
    } else if detected_java_major >= 21 {
        "-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch -XX:+DisableExplicitGC -XX:+UnlockExperimentalVMOptions".to_string()
    } else {
        "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=35 -XX:+AlwaysPreTouch -XX:+DisableExplicitGC".to_string()
    };

    let presets = vec![
        OptimizationPreset {
            id: "7xair_max_performance".to_string(),
            name: "7xAir MAXIMUM PERFORMANCE".to_string(),
            description: format!(
                "Java {detected_java_major}-tuned low-pause ZGC, matched Xms/Xmx heap pre-touch, dedicated GPU hints, and zero background launcher overhead."
            ),
            recommended_ram_mb: max_fps_ram,
            jvm_args: max_perf_jvm,
        },
        OptimizationPreset {
            id: "balanced".to_string(),
            name: "Balanced".to_string(),
            description: "Smooth frame pacing and steady throughput for modded Fabric instances.".to_string(),
            recommended_ram_mb: balanced_ram,
            jvm_args: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=50 -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=25 -XX:G1HeapRegionSize=8M".to_string(),
        },
        OptimizationPreset {
            id: "max_fps".to_string(),
            name: "Maximum FPS".to_string(),
            description: "High-throughput G1GC with heap pre-touch and disabled explicit GC for smooth sustained frame rates.".to_string(),
            recommended_ram_mb: max_fps_ram,
            jvm_args: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=35 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M".to_string(),
        },
        OptimizationPreset {
            id: "low_end".to_string(),
            name: "Low Resource Usage".to_string(),
            description: "Conservative memory footprint for 8 GB systems or background multitasking.".to_string(),
            recommended_ram_mb: low_end_ram,
            jvm_args: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:G1ReservePercent=15".to_string(),
        },
        OptimizationPreset {
            id: "competitive_pvp".to_string(),
            name: "PvP Performance".to_string(),
            description: "Low-latency G1GC tuning capped to prevent GC frame-time spikes during combat.".to_string(),
            recommended_ram_mb: pvp_ram,
            jvm_args: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=20 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:+AlwaysPreTouch".to_string(),
        },
    ];

    let mut warnings = Vec::new();
    let active_ram = instance
        .and_then(|i| i.ram_mb_override)
        .unwrap_or(settings.allocated_ram_mb);
    if active_ram > 10240 {
        warnings.push(
            "Allocating more than 10 GB to Minecraft can cause longer GC pauses; 4–8 GB is optimal for most Fabric setups.".to_string(),
        );
    }
    if (active_ram as u64) > telemetry.available_ram_mb.saturating_sub(1024) {
        warnings.push(format!(
            "Configured heap ({active_ram} MB) is close to currently available RAM ({} MB).",
            telemetry.available_ram_mb
        ));
    }

    let installed_items = instance
        .map(list_installed_content)
        .unwrap_or_default();
    let has_mod = |needle: &str| {
        installed_items.iter().any(|item| {
            item.enabled
                && (item.filename.to_ascii_lowercase().contains(needle)
                    || item.title.to_ascii_lowercase().contains(needle))
        })
    };

    let fabric_mods = vec![
        RecommendedModHint {
            slug: "sodium".to_string(),
            name: "Sodium".to_string(),
            reason: "Modern OpenGL rendering engine with major FPS and frame-time improvements.".to_string(),
            installed: has_mod("sodium"),
        },
        RecommendedModHint {
            slug: "lithium".to_string(),
            name: "Lithium".to_string(),
            reason: "General-purpose game logic, physics, and tick optimization with vanilla parity.".to_string(),
            installed: has_mod("lithium"),
        },
        RecommendedModHint {
            slug: "ferrite-core".to_string(),
            name: "FerriteCore".to_string(),
            reason: "Significantly reduces Minecraft memory usage and GC pressure.".to_string(),
            installed: has_mod("ferrite"),
        },
        RecommendedModHint {
            slug: "immediatelyfast".to_string(),
            name: "ImmediatelyFast".to_string(),
            reason: "Speeds up HUD, entity, and immediate-mode rendering performance.".to_string(),
            installed: has_mod("immediatelyfast"),
        },
        RecommendedModHint {
            slug: "entityculling".to_string(),
            name: "Entity Culling".to_string(),
            reason: "Skips rendering hidden entities and block entities behind walls.".to_string(),
            installed: has_mod("entityculling"),
        },
    ];

    OptimizationRecommendations {
        presets,
        recommended_ram_mb: pvp_ram,
        warnings,
        fabric_mods,
    }
}

pub fn run_instance_diagnostics(
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    instance: Option<&GameInstance>,
) -> DiagnosticsReport {
    let mut checks: Vec<DiagnosticCheckItem> = Vec::new();
    let mut score: i32 = 100;

    // 1. Java 21+ check
    let javas = detect_java_installations(paths);
    if let Some(best) = javas.first() {
        if best.major_version >= 21 {
            checks.push(DiagnosticCheckItem {
                id: "java_runtime".to_string(),
                label: "Java 21+ Runtime".to_string(),
                status: "pass".to_string(),
                detail: format!("Found Java {} ({}) at {}", best.major_version, best.vendor, best.path),
            });
        } else {
            score -= 20;
            checks.push(DiagnosticCheckItem {
                id: "java_runtime".to_string(),
                label: "Java 21+ Runtime".to_string(),
                status: "warning".to_string(),
                detail: format!(
                    "Detected Java {}, but Minecraft 1.21.11+ requires Java 21.",
                    best.major_version
                ),
            });
        }
    } else {
        score -= 35;
        checks.push(DiagnosticCheckItem {
            id: "java_runtime".to_string(),
            label: "Java 21+ Runtime".to_string(),
            status: "fail".to_string(),
            detail: "No Java runtime found in PATH, JAVA_HOME, or managed runtime/.".to_string(),
        });
    }

    // 2. Disk & RAM headroom
    let telemetry = collect_performance_telemetry(paths, None);
    if telemetry.free_disk_gb < 4.0 {
        score -= 20;
        checks.push(DiagnosticCheckItem {
            id: "disk_space".to_string(),
            label: "Storage Headroom".to_string(),
            status: "warning".to_string(),
            detail: format!("Only {:.1} GB free on launcher drive.", telemetry.free_disk_gb),
        });
    } else {
        checks.push(DiagnosticCheckItem {
            id: "disk_space".to_string(),
            label: "Storage Headroom".to_string(),
            status: "pass".to_string(),
            detail: format!("{:.1} GB free on launcher drive.", telemetry.free_disk_gb),
        });
    }

    let target_ram = instance
        .and_then(|i| i.ram_mb_override)
        .unwrap_or(settings.allocated_ram_mb);
    if (target_ram as u64) > telemetry.available_ram_mb {
        score -= 20;
        checks.push(DiagnosticCheckItem {
            id: "ram_headroom".to_string(),
            label: "Memory Allocation".to_string(),
            status: "warning".to_string(),
            detail: format!(
                "Allocated {} MB exceeds currently available {} MB RAM.",
                target_ram, telemetry.available_ram_mb
            ),
        });
    } else {
        checks.push(DiagnosticCheckItem {
            id: "ram_headroom".to_string(),
            label: "Memory Allocation".to_string(),
            status: "pass".to_string(),
            detail: format!(
                "{} MB allocated ({} MB available / {} MB total).",
                target_ram, telemetry.available_ram_mb, telemetry.total_ram_mb
            ),
        });
    }

    // 3. Instance compatibility & 7xAir client integrity
    let mut compat_report = None;
    let mut client_integrity = None;

    if let Some(inst) = instance {
        let compat = run_compatibility_checks(inst);
        if compat.compatible {
            checks.push(DiagnosticCheckItem {
                id: "mod_compatibility".to_string(),
                label: "Mod & Resource-Pack Compatibility".to_string(),
                status: if compat.warning_count > 0 { "warning" } else { "pass" }.to_string(),
                detail: format!(
                    "MC {} ({}) — {} error(s), {} warning(s).",
                    compat.mc_version, compat.loader, compat.error_count, compat.warning_count
                ),
            });
            if compat.warning_count > 0 {
                score -= 5;
            }
        } else {
            score -= 25;
            checks.push(DiagnosticCheckItem {
                id: "mod_compatibility".to_string(),
                label: "Mod & Resource-Pack Compatibility".to_string(),
                status: "fail".to_string(),
                detail: format!(
                    "{} compatibility error(s) found for MC {} ({}).",
                    compat.error_count, compat.mc_version, compat.loader
                ),
            });
        }
        compat_report = Some(compat);

        let integrity = check_client_integrity(paths, inst, settings.auto_install_client);
        if integrity.healthy {
            checks.push(DiagnosticCheckItem {
                id: "client_integrity".to_string(),
                label: "7xAir Client Integrity".to_string(),
                status: "pass".to_string(),
                detail: format!(
                    "Healthy (override: {:?}, effective: {}).",
                    integrity.override_mode,
                    if integrity.effective_enabled { "ON" } else { "OFF" }
                ),
            });
        } else {
            score -= 15;
            checks.push(DiagnosticCheckItem {
                id: "client_integrity".to_string(),
                label: "7xAir Client Integrity".to_string(),
                status: "warning".to_string(),
                detail: integrity
                    .issues
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Client integrity check requires attention.".to_string()),
            });
        }
        client_integrity = Some(integrity);
    }

    let final_score = score.clamp(0, 100) as u32;
    let overall_status = if checks.iter().any(|c| c.status == "fail") {
        "critical"
    } else if checks.iter().any(|c| c.status == "warning") {
        "warning"
    } else {
        "healthy"
    };

    DiagnosticsReport {
        overall_status: overall_status.to_string(),
        health_score: final_score,
        checks,
        compatibility: compat_report,
        client_integrity,
    }
}

pub fn analyze_crash_log_text(instance_id: &str, file_label: Option<String>, crash_count: usize, content: &str) -> CrashAnalysisReport {
    let mut findings: Vec<CrashFinding> = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    let patterns: [(&str, &str, &str, &str, &str, &[&str]); 6] = [
        (
            "OUT_OF_MEMORY",
            "critical",
            "Out of Memory (Heap Exhausted)",
            "The JVM ran out of heap space while loading assets or rendering chunks.",
            "Increase allocated RAM in Performance Center (e.g. 4096–6144 MB) and install FerriteCore.",
            &["OutOfMemoryError", "GC overhead limit exceeded"],
        ),
        (
            "UNSUPPORTED_JAVA_VERSION",
            "critical",
            "Incompatible Java Runtime Version",
            "Minecraft or a Fabric mod was compiled for a newer Java bytecode version (Java 21).",
            "Install Eclipse Temurin / OpenJDK 21 and select it in Settings -> Java.",
            &["UnsupportedClassVersionError", "class file version 65.0", "class file version 66.0"],
        ),
        (
            "MIXIN_CONFLICT",
            "critical",
            "Fabric Mixin Injection Conflict",
            "A mod mixin failed to apply against this Minecraft version or conflicted with another mod.",
            "Disable recently added mods, verify all mods match the instance MC version, and re-run Compatibility Check.",
            &["MixinTransformerError", "MixinApplyError", "InvalidInjectionException"],
        ),
        (
            "MOD_RESOLUTION_FAILURE",
            "critical",
            "Fabric Mod Dependency or Version Error",
            "Fabric Loader rejected the mod set due to missing dependencies or incompatible versions.",
            "Open Modrinth -> Compatibility Check to resolve missing dependencies or update outdated mods.",
            &["ModResolutionException", "Incompatible mods found!", "Incompatible mod set"],
        ),
        (
            "GPU_DRIVER_CRASH",
            "critical",
            "OpenGL / Graphics Driver Crash",
            "The native graphics driver or GLFW context crashed.",
            "Update your NVIDIA/AMD/Intel GPU driver and ensure Minecraft runs on the dedicated GPU.",
            &["GLFW error", "EXCEPTION_ACCESS_VIOLATION", "nvoglv64.dll", "atio6axx.dll", "igxelpicd64.dll"],
        ),
        (
            "MISSING_CLASS_OR_CORRUPT_JAR",
            "warning",
            "Missing Class or Corrupt Archive",
            "A required library or mod class was missing at runtime.",
            "Run Repair on the 7xAir Client and verify Fabric loader libraries.",
            &["NoClassDefFoundError", "ClassNotFoundException", "ZipException"],
        ),
    ];

    for (code, severity, title, summary, rec, needles) in patterns {
        if let Some(matched) = lines
            .iter()
            .find(|line| needles.iter().any(|n| line.contains(n)))
        {
            findings.push(CrashFinding {
                code: code.to_string(),
                severity: severity.to_string(),
                title: title.to_string(),
                summary: summary.to_string(),
                recommendation: rec.to_string(),
                matched_line: matched.trim().chars().take(180).collect(),
            });
        }
    }

    let excerpt: Vec<String> = lines
        .iter()
        .rev()
        .take(20)
        .rev()
        .map(|l| (*l).to_string())
        .collect();

    CrashAnalysisReport {
        instance_id: instance_id.to_string(),
        analyzed_file: file_label,
        crash_reports_found: crash_count,
        findings,
        excerpt,
    }
}

pub fn analyze_instance_crash_logs(instance: &GameInstance) -> CrashAnalysisReport {
    let inst_dir = PathBuf::from(&instance.instance_dir);
    let crash_dir = inst_dir.join("crash-reports");

    let mut crash_files: Vec<PathBuf> = fs::read_dir(&crash_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("txt"))
        .collect();

    crash_files.sort_by_key(|p| {
        fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
    });

    let crash_count = crash_files.len();
    let target_file = crash_files
        .last()
        .cloned()
        .or_else(|| {
            let latest = inst_dir.join("logs").join("latest.log");
            latest.exists().then_some(latest)
        })
        .or_else(|| {
            let launch_log = inst_dir.join("logs").join("7xair-launch.log");
            launch_log.exists().then_some(launch_log)
        });

    let Some(file_path) = target_file else {
        return CrashAnalysisReport {
            instance_id: instance.id.clone(),
            analyzed_file: None,
            crash_reports_found: 0,
            findings: Vec::new(),
            excerpt: Vec::new(),
        };
    };

    let content = fs::read_to_string(&file_path).unwrap_or_default();
    let label = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string());
    analyze_crash_log_text(&instance.id, label, crash_count, &content)
}

// ============================================================================
// Part 1: Mod Optimization Audit, Graphics Presets (options.txt), & Dedicated GPU
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModAuditFinding {
    pub severity: String, // "conflict" | "redundant" | "warning"
    pub title: String,
    pub mods_involved: Vec<String>,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModAuditReport {
    pub instance_id: String,
    pub total_mods: usize,
    pub findings: Vec<ModAuditFinding>,
}

pub fn audit_instance_optimization_mods(instance: &GameInstance) -> ModAuditReport {
    let items = list_installed_content(instance).unwrap_or_default();
    let enabled_mods: Vec<String> = items
        .iter()
        .filter(|i| i.project_type == "mod" && i.enabled)
        .map(|i| format!("{} {}", i.title, i.filename).to_ascii_lowercase())
        .collect();

    let has = |needle: &str| enabled_mods.iter().any(|m| m.contains(needle));
    let mut findings = Vec::new();

    if has("sodium") && has("vulkanmod") {
        findings.push(ModAuditFinding {
            severity: "conflict".to_string(),
            title: "Conflicting Render Engines (Sodium + VulkanMod)".to_string(),
            mods_involved: vec!["Sodium".to_string(), "VulkanMod".to_string()],
            recommendation: "Disable either Sodium or VulkanMod — both replace Minecraft's renderer and conflict.".to_string(),
        });
    }
    if has("sodium") && (has("optifine") || has("optifabric")) {
        findings.push(ModAuditFinding {
            severity: "conflict".to_string(),
            title: "Incompatible Renderer (Sodium + OptiFine)".to_string(),
            mods_involved: vec!["Sodium".to_string(), "OptiFine".to_string()],
            recommendation: "Remove OptiFine/OptiFabric when using Sodium on Fabric.".to_string(),
        });
    }
    if has("immediatelyfast") && has("vulkanmod") {
        findings.push(ModAuditFinding {
            severity: "conflict".to_string(),
            title: "OpenGL Batching Conflict (ImmediatelyFast + VulkanMod)".to_string(),
            mods_involved: vec!["ImmediatelyFast".to_string(), "VulkanMod".to_string()],
            recommendation: "Disable ImmediatelyFast when running VulkanMod.".to_string(),
        });
    }
    if has("starlight") || has("phosphor") {
        findings.push(ModAuditFinding {
            severity: "redundant".to_string(),
            title: "Redundant Lighting Mod on Minecraft 1.21+".to_string(),
            mods_involved: vec!["Starlight / Phosphor".to_string()],
            recommendation: "Minecraft 1.20+ already includes the rewritten lighting engine; disable this mod to avoid unnecessary overhead.".to_string(),
        });
    }
    if has("lazydfu") {
        findings.push(ModAuditFinding {
            severity: "redundant".to_string(),
            title: "Redundant Startup Mod (LazyDFU)".to_string(),
            mods_involved: vec!["LazyDFU".to_string()],
            recommendation: "Minecraft 1.19.4+ already initializes DataFixerUpper lazily; LazyDFU is no longer needed.".to_string(),
        });
    }

    ModAuditReport {
        instance_id: instance.id.clone(),
        total_mods: enabled_mods.len(),
        findings,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsOptions {
    pub render_distance: u32,
    pub simulation_distance: u32,
    pub particles: u32,            // 0 = All, 1 = Decreased, 2 = Minimal
    pub entity_distance_scaling: f32,
    pub render_clouds: String,     // "true" | "fast" | "false"
    pub graphics_mode: u32,        // 0 = Fast, 1 = Fancy, 2 = Fabulous
    pub entity_shadows: bool,
    pub enable_vsync: bool,
    pub max_fps: u32,              // 260 = Unlimited in Minecraft options.txt
}

impl Default for GraphicsOptions {
    fn default() -> Self {
        Self {
            render_distance: 12,
            simulation_distance: 8,
            particles: 1,
            entity_distance_scaling: 1.0,
            render_clouds: "fast".to_string(),
            graphics_mode: 1,
            entity_shadows: true,
            enable_vsync: false,
            max_fps: 260,
        }
    }
}

pub fn read_instance_graphics_options(instance: &GameInstance) -> GraphicsOptions {
    let mut opts = GraphicsOptions::default();
    let path = PathBuf::from(&instance.instance_dir).join("options.txt");
    let Ok(raw) = fs::read_to_string(&path) else {
        return opts;
    };
    for line in raw.lines() {
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let val = v.trim();
        match k.trim() {
            "renderDistance" => if let Ok(n) = val.parse() { opts.render_distance = n; },
            "simulationDistance" => if let Ok(n) = val.parse() { opts.simulation_distance = n; },
            "particles" => if let Ok(n) = val.parse() { opts.particles = n; },
            "entityDistanceScaling" => if let Ok(n) = val.parse() { opts.entity_distance_scaling = n; },
            "renderClouds" => opts.render_clouds = val.trim_matches('"').to_string(),
            "graphicsMode" => if let Ok(n) = val.parse() { opts.graphics_mode = n; },
            "entityShadows" => opts.entity_shadows = val == "true",
            "enableVsync" => opts.enable_vsync = val == "true",
            "maxFps" => if let Ok(n) = val.parse() { opts.max_fps = n; },
            _ => {}
        }
    }
    opts
}

pub fn save_instance_graphics_options(
    instance: &GameInstance,
    opts: &GraphicsOptions,
) -> Result<GraphicsOptions, String> {
    let path = PathBuf::from(&instance.instance_dir).join("options.txt");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let updates: Vec<(&str, String)> = vec![
        ("renderDistance", opts.render_distance.clamp(2, 32).to_string()),
        ("simulationDistance", opts.simulation_distance.clamp(5, 32).to_string()),
        ("particles", opts.particles.min(2).to_string()),
        ("entityDistanceScaling", format!("{:.2}", opts.entity_distance_scaling.clamp(0.5, 5.0))),
        ("renderClouds", format!("\"{}\"", opts.render_clouds)),
        ("graphicsMode", opts.graphics_mode.min(2).to_string()),
        ("entityShadows", opts.entity_shadows.to_string()),
        ("enableVsync", opts.enable_vsync.to_string()),
        ("maxFps", opts.max_fps.clamp(30, 260).to_string()),
    ];

    let mut lines: Vec<String> = existing.lines().map(str::to_string).collect();
    for (key, val) in &updates {
        let prefix = format!("{key}:");
        if let Some(slot) = lines.iter_mut().find(|l| l.starts_with(&prefix)) {
            *slot = format!("{key}:{val}");
        } else {
            lines.push(format!("{key}:{val}"));
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("txt.tmp");
    fs::write(&tmp, lines.join("\n") + "\n").map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(read_instance_graphics_options(instance))
}

/// Safely configures Windows 10/11 per-user DirectX High-Performance GPU preference
/// for the specified Java executable (`GpuPreference=2;`) so Minecraft runs on the
/// dedicated NVIDIA/AMD GPU instead of integrated laptop graphics.
pub fn set_windows_high_perf_gpu_preference(java_path: &str) -> Result<String, String> {
    let trimmed = java_path.trim();
    if trimmed.is_empty() {
        return Err("No Java executable path provided.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("reg.exe")
            .args([
                "add",
                r"HKCU\Software\Microsoft\DirectX\UserGpuPreferences",
                "/v",
                trimmed,
                "/t",
                "REG_SZ",
                "/d",
                "GpuPreference=2;",
                "/f",
            ])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to run reg.exe: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Windows GPU preference update failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        return Ok(format!(
            "Configured Windows High-Performance dedicated GPU preference for {trimmed}."
        ));
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(format!(
            "Dedicated GPU environment hints (__NV_PRIME_RENDER_OFFLOAD=1) will be applied for {trimmed} at launch."
        ))
    }
}

// ===== Built-In Performance Optimizer: Process Audit, Safe Cleanup Center & JVM Backup/Validation =====

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMemoryEntry {
    pub pid: u32,
    pub name: String,
    pub ram_mb: u64,
    pub cpu_percent: f32,
    pub is_java: bool,
    pub is_protected: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemoryAudit {
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    pub gpu_usage_percent: Option<f32>,
    pub disk_activity_mb_s: Option<f64>,
    pub live_fps: Option<f64>,
    pub live_frame_time_ms: Option<f64>,
    pub java_processes: Vec<ProcessMemoryEntry>,
    pub top_background_consumers: Vec<ProcessMemoryEntry>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCategoryPreview {
    pub id: String,
    pub label: String,
    pub description: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub sample_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupScanReport {
    pub total_files: usize,
    pub total_bytes: u64,
    pub used_ram_mb_before: u64,
    pub available_ram_mb_before: u64,
    pub categories: Vec<CleanupCategoryPreview>,
    pub safety_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionResult {
    pub deleted_files: usize,
    pub freed_bytes: u64,
    pub skipped_files: usize,
    pub used_ram_mb_before: u64,
    pub used_ram_mb_after: u64,
    pub available_ram_mb_before: u64,
    pub available_ram_mb_after: u64,
    pub applied_categories: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JvmValidationReport {
    pub valid: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub recommended_ram_mb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JvmBackupEntry {
    pub id: String,
    pub created_at_epoch: u64,
    pub label: String,
    pub previous_jvm_args: String,
    pub previous_ram_mb: u32,
    pub applied_jvm_args: String,
    pub applied_ram_mb: u32,
}

fn is_protected_process_name(name_lower: &str) -> bool {
    const PROTECTED: &[&str] = &[
        "system", "registry", "smss", "csrss", "wininit", "services", "lsass", "svchost",
        "winlogon", "dwm", "explorer", "msmpeng", "securityhealth", "defender", "antimalware",
        "nvdisplay", "amdrsserv", "igfx", "java", "javaw", "minecraft", "7xair", "sevenxair",
        "systemd", "init", "kernel",
    ];
    PROTECTED.iter().any(|p| name_lower.contains(p))
}

pub fn audit_system_memory_and_processes(paths: &LauncherPaths) -> SystemMemoryAudit {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::new()
            .with_memory(sysinfo::MemoryRefreshKind::everything())
            .with_processes(sysinfo::ProcessRefreshKind::everything()),
    );
    sys.refresh_memory();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let used_ram_mb = sys.used_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);

    let mut java_processes = Vec::new();
    let mut others = Vec::new();

    for (pid, proc_info) in sys.processes() {
        let name = proc_info.name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        let ram_mb = proc_info.memory() / (1024 * 1024);
        let is_java = lower.contains("java");
        let is_protected = is_protected_process_name(&lower);
        let entry = ProcessMemoryEntry {
            pid: pid.as_u32(),
            name,
            ram_mb,
            cpu_percent: (proc_info.cpu_usage() * 10.0).round() / 10.0,
            is_java,
            is_protected,
            note: if is_java {
                "Active Java / Minecraft runtime (protected)".to_string()
            } else if is_protected {
                "Protected OS, driver, or security process (never terminated)".to_string()
            } else if ram_mb >= 700 {
                "High background memory usage — consider closing manually before gaming.".to_string()
            } else {
                "Normal background process".to_string()
            },
        };
        if is_java {
            java_processes.push(entry);
        } else if ram_mb >= 80 {
            others.push(entry);
        }
    }

    others.sort_by(|a, b| b.ram_mb.cmp(&a.ram_mb));
    others.truncate(8);

    let mut recommendations = Vec::new();
    if available_ram_mb < 3072 {
        recommendations.push(format!(
            "Only {available_ram_mb} MB RAM is currently free. Close unused browser tabs or heavy background apps before launching Minecraft."
        ));
    } else {
        recommendations.push(format!(
            "{available_ram_mb} MB RAM is available. Safe Minecraft heap allocation is 4096–{} MB.",
            (total_ram_mb / 2).clamp(4096, 8192)
        ));
    }
    let _ = paths;

    SystemMemoryAudit {
        total_ram_mb,
        used_ram_mb,
        available_ram_mb,
        gpu_usage_percent: None, // Honest null when OS API does not expose live GPU utilization
        disk_activity_mb_s: None,
        live_fps: None,
        live_frame_time_ms: None,
        java_processes,
        top_background_consumers: others,
        recommendations,
    }
}

fn is_forbidden_personal_or_game_path(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_ascii_lowercase();
    const FORBIDDEN: &[&str] = &[
        "saves", "worlds", "screenshots", "mods", "resourcepacks", "shaderpacks",
        "config", "profiles.json", "instances.json", "settings.json", "wallpapers",
        "customization.json", "music-state.json", "7xair-launch.log",
    ];
    FORBIDDEN.iter().any(|tok| lower.contains(tok))
}

fn collect_safe_files_in_dir(
    dir: &Path,
    predicate: impl Fn(&Path) -> bool,
) -> Vec<(PathBuf, u64)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() || is_forbidden_personal_or_game_path(&p) {
            continue;
        }
        if predicate(&p) {
            if let Ok(meta) = fs::metadata(&p) {
                out.push((p, meta.len()));
            }
        }
    }
    out
}

fn build_cleanup_buckets(paths: &LauncherPaths) -> Vec<(String, String, String, Vec<(PathBuf, u64)>)> {
    let root = PathBuf::from(&paths.root_dir);
    let cache_dir = PathBuf::from(&paths.cache_dir);
    let logs_dir = root.join("logs");
    let staging_dir = root.join("updates").join("staging");
    let os_tmp = std::env::temp_dir();

    vec![
        (
            "old_7xair_temp".to_string(),
            "Old 7xAir Temporary Files".to_string(),
            "Leftover .tmp and .part files inside 7xAir's own cache directory.".to_string(),
            collect_safe_files_in_dir(&cache_dir, |p| {
                matches!(
                    p.extension().and_then(|e| e.to_str()),
                    Some("tmp") | Some("part")
                )
            }),
        ),
        (
            "eligible_app_cache".to_string(),
            "Eligible Application Cache".to_string(),
            "Stale metadata cache files inside 7xAir's http cache folder.".to_string(),
            collect_safe_files_in_dir(&cache_dir.join("http"), |_| true),
        ),
        (
            "old_7xair_logs".to_string(),
            "Old 7xAir Diagnostic Logs".to_string(),
            "Archived diagnostic .log files inside 7xAir/logs (never deletes active launch logs).".to_string(),
            collect_safe_files_in_dir(&logs_dir, |p| {
                p.extension().and_then(|e| e.to_str()) == Some("log")
            }),
        ),
        (
            "unused_temp_installers".to_string(),
            "Unused Temporary Installer Files".to_string(),
            "Leftover temporary installer downloads inside 7xAir/updates/staging.".to_string(),
            collect_safe_files_in_dir(&staging_dir, |p| {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                name.ends_with(".tmp") || name.ends_with(".part") || name.ends_with(".old")
            }),
        ),
        (
            "selected_os_temp".to_string(),
            "Selected 7xAir Temp Files".to_string(),
            "Temporary files prefixed with '7xair-' in the system temp folder.".to_string(),
            collect_safe_files_in_dir(&os_tmp, |p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_ascii_lowercase().starts_with("7xair-"))
                    .unwrap_or(false)
            }),
        ),
    ]
}

pub fn scan_safe_cleanup_candidates(paths: &LauncherPaths) -> CleanupScanReport {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::new().with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();
    let used_before = sys.used_memory() / (1024 * 1024);
    let avail_before = sys.available_memory() / (1024 * 1024);

    let buckets = build_cleanup_buckets(paths);
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;
    let mut categories = Vec::new();

    for (id, label, description, files) in buckets {
        let count = files.len();
        let bytes: u64 = files.iter().map(|(_, b)| *b).sum();
        total_files += count;
        total_bytes += bytes;
        let sample_files = files
            .iter()
            .take(5)
            .filter_map(|(p, _)| p.file_name().and_then(|n| n.to_str()).map(|s| s.to_string()))
            .collect();
        categories.push(CleanupCategoryPreview {
            id,
            label,
            description,
            file_count: count,
            total_bytes: bytes,
            sample_files,
        });
    }

    CleanupScanReport {
        total_files,
        total_bytes,
        used_ram_mb_before: used_before,
        available_ram_mb_before: avail_before,
        categories,
        safety_note: "Protected: personal files, Minecraft worlds/saves, screenshots, mods, resource packs, and configs are never scanned or deleted.".to_string(),
    }
}

pub fn execute_safe_cleanup(
    paths: &LauncherPaths,
    selected_categories: &[String],
) -> CleanupExecutionResult {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::new().with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();
    let used_before = sys.used_memory() / (1024 * 1024);
    let avail_before = sys.available_memory() / (1024 * 1024);

    let buckets = build_cleanup_buckets(paths);
    let mut deleted_files = 0usize;
    let mut freed_bytes = 0u64;
    let mut skipped_files = 0usize;
    let mut applied_categories = Vec::new();

    for (id, _, _, files) in buckets {
        if !selected_categories.iter().any(|c| c == &id) {
            continue;
        }
        applied_categories.push(id);
        for (file_path, size) in files {
            if is_forbidden_personal_or_game_path(&file_path) {
                skipped_files += 1;
                continue;
            }
            if fs::remove_file(&file_path).is_ok() {
                deleted_files += 1;
                freed_bytes += size;
            } else {
                skipped_files += 1;
            }
        }
    }

    sys.refresh_memory();
    let used_after = sys.used_memory() / (1024 * 1024);
    let avail_after = sys.available_memory() / (1024 * 1024);
    let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);

    CleanupExecutionResult {
        deleted_files,
        freed_bytes,
        skipped_files,
        used_ram_mb_before: used_before,
        used_ram_mb_after: used_after,
        available_ram_mb_before: avail_before,
        available_ram_mb_after: avail_after,
        applied_categories,
        summary: format!(
            "Safely removed {deleted_files} temporary/cache file(s) ({freed_mb:.2} MB freed). Zero personal or game files touched."
        ),
    }
}

pub fn validate_jvm_arguments(
    jvm_args: &str,
    allocated_ram_mb: u32,
    java_major: u32,
) -> JvmValidationReport {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::new().with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();
    let total_ram_mb = (sys.total_memory() / (1024 * 1024)) as u32;
    let recommended_ram_mb = (total_ram_mb / 2).clamp(4096, 8192);

    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    let has_g1 = jvm_args.contains("UseG1GC");
    let has_zgc = jvm_args.contains("UseZGC");
    let has_shen = jvm_args.contains("UseShenandoahGC");
    let gc_count = [has_g1, has_zgc, has_shen].iter().filter(|&&b| b).count();
    if gc_count > 1 {
        errors.push("Conflicting garbage collectors detected (choose only one of G1GC, ZGC, or Shenandoah).".to_string());
    }
    if java_major >= 23 && jvm_args.contains("-XX:+ZGenerational") {
        warnings.push("Java 23+ uses Generational ZGC by default; remove deprecated -XX:+ZGenerational flag.".to_string());
    }
    if total_ram_mb > 0 && allocated_ram_mb > (total_ram_mb * 75 / 100) {
        warnings.push(format!(
            "Allocated {allocated_ram_mb} MB exceeds 75% of installed RAM ({total_ram_mb} MB) and may starve Windows or GPU drivers."
        ));
    }
    if allocated_ram_mb < 2048 {
        warnings.push("Allocating less than 2048 MB may cause frequent GC pauses with Fabric mods.".to_string());
    }
    if jvm_args.contains("-Xmx") || jvm_args.contains("-Xms") {
        warnings.push("Manual -Xms/-Xmx flags found inside JVM args; 7xAir manages heap sizing via the RAM slider.".to_string());
    }

    JvmValidationReport {
        valid: errors.is_empty(),
        warnings,
        errors,
        recommended_ram_mb,
    }
}

fn jvm_backups_path(paths: &LauncherPaths) -> PathBuf {
    PathBuf::from(&paths.root_dir).join("jvm-backups.json")
}

pub fn list_jvm_backups(paths: &LauncherPaths) -> Vec<JvmBackupEntry> {
    let path = jvm_backups_path(paths);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<JvmBackupEntry>>(&raw).ok())
        .unwrap_or_default()
}

pub fn record_jvm_backup(
    paths: &LauncherPaths,
    label: String,
    previous_jvm_args: String,
    previous_ram_mb: u32,
    applied_jvm_args: String,
    applied_ram_mb: u32,
) -> Result<JvmBackupEntry, String> {
    let mut list = list_jvm_backups(paths);
    let entry = JvmBackupEntry {
        id: uuid::Uuid::new_v4().to_string(),
        created_at_epoch: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        label,
        previous_jvm_args,
        previous_ram_mb,
        applied_jvm_args,
        applied_ram_mb,
    };
    list.insert(0, entry.clone());
    if list.len() > 12 {
        list.truncate(12);
    }
    let path = jvm_backups_path(paths);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(&tmp, raw).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(entry)
}
