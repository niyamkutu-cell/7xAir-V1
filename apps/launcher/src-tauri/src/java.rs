use crate::windows::LauncherPaths;
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInstallation {
    pub path: String,
    pub major_version: u32,
    pub raw_version: String,
    pub vendor: String,
    pub source: String,
    pub recommended: bool,
}

pub fn parse_java_major(version_output: &str) -> Option<(u32, String)> {
    // Handles: openjdk version "21.0.4", java version "1.8.0_411", openjdk 17.0.21
    for line in version_output.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("version") || lower.starts_with("openjdk ") || lower.starts_with("java ") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    let raw = &line[start + 1..start + 1 + end];
                    let parts: Vec<&str> = raw.split('.').collect();
                    if let Some(first) = parts.first() {
                        if let Ok(first_num) = first.parse::<u32>() {
                            if first_num == 1 {
                                if let Some(second) = parts.get(1) {
                                    if let Ok(second_num) = second.parse::<u32>() {
                                        return Some((second_num, raw.to_string()));
                                    }
                                }
                            } else {
                                return Some((first_num, raw.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn detect_vendor(output: &str) -> String {
    let lower = output.to_ascii_lowercase();
    if lower.contains("temurin") || lower.contains("adoptium") {
        "Eclipse Temurin".to_string()
    } else if lower.contains("zulu") {
        "Azul Zulu".to_string()
    } else if lower.contains("corretto") {
        "Amazon Corretto".to_string()
    } else if lower.contains("microsoft") {
        "Microsoft OpenJDK".to_string()
    } else if lower.contains("openjdk") {
        "OpenJDK".to_string()
    } else {
        "Java Runtime".to_string()
    }
}

fn java_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "javaw.exe"
    } else {
        "java"
    }
}

pub fn probe_java_path(bin_path: &Path, source: &str) -> Option<JavaInstallation> {
    probe_java_binary(bin_path, source)
}

fn probe_java_binary(bin_path: &Path, source: &str) -> Option<JavaInstallation> {
    if !bin_path.exists() {
        return None;
    }
    // Use `java.exe` for probing on Windows if `javaw.exe` was passed, since `javaw` suppresses stderr.
    let probe_path = if cfg!(target_os = "windows")
        && bin_path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.eq_ignore_ascii_case("javaw.exe"))
            .unwrap_or(false)
    {
        let sibling = bin_path.with_file_name("java.exe");
        if sibling.exists() {
            sibling
        } else {
            bin_path.to_path_buf()
        }
    } else {
        bin_path.to_path_buf()
    };

    let mut cmd = Command::new(&probe_path);
    cmd.arg("-version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().ok()?;
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let (major, raw_version) = parse_java_major(&combined)?;
    Some(JavaInstallation {
        path: bin_path.to_string_lossy().to_string(),
        major_version: major,
        raw_version,
        vendor: detect_vendor(&combined),
        source: source.to_string(),
        recommended: major >= 21,
    })
}

fn scan_directory_for_java(root: &Path, source: &str, out: &mut Vec<(PathBuf, String)>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let bin = java_binary_name();
    for entry in entries.flatten() {
        let candidate = entry.path().join("bin").join(bin);
        if candidate.exists() {
            out.push((candidate, source.to_string()));
        }
    }
}

pub fn detect_java_installations(paths: &LauncherPaths) -> Vec<JavaInstallation> {
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();
    let bin = java_binary_name();

    // 1. Managed 7xAir runtime directory
    scan_directory_for_java(Path::new(&paths.runtime_dir), "7xair-managed", &mut candidates);

    // 2. JAVA_HOME
    if let Ok(java_home) = env::var("JAVA_HOME") {
        candidates.push((PathBuf::from(java_home).join("bin").join(bin), "JAVA_HOME".to_string()));
    }

    // 3. PATH entries
    if let Ok(path_var) = env::var("PATH") {
        for dir in env::split_paths(&path_var) {
            let p = dir.join(bin);
            if p.exists() {
                candidates.push((p, "PATH".to_string()));
            }
        }
    }

    // 4. Platform standard install roots
    if cfg!(target_os = "windows") {
        for root in [
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\Zulu",
            r"C:\Program Files\Amazon Corretto",
            r"C:\Program Files\BellSoft",
        ] {
            scan_directory_for_java(Path::new(root), "windows-program-files", &mut candidates);
        }
    } else {
        scan_directory_for_java(Path::new("/usr/lib/jvm"), "system-jvm", &mut candidates);
    }

    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for (candidate, source) in candidates {
        let canonical = candidate
            .canonicalize()
            .unwrap_or_else(|_| candidate.clone());
        let key = canonical.to_string_lossy().to_string();
        if !seen.insert(key) {
            continue;
        }
        if let Some(info) = probe_java_binary(&canonical, &source) {
            results.push(info);
        }
    }

    results.sort_by(|a, b| {
        b.recommended
            .cmp(&a.recommended)
            .then_with(|| b.major_version.cmp(&a.major_version))
    });
    results
}
