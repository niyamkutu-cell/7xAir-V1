use crate::client_manager::{check_client_integrity, ClientIntegrityReport};
use crate::config::LauncherSettings;
use crate::instances::GameInstance;
use crate::java::detect_java_installations;
use crate::modrinth::{list_installed_content, run_compatibility_checks, CompatibilityReport};
use crate::windows::LauncherPaths;
use serde::Serialize;
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
                        "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)",
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
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

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

    let presets = vec![
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
