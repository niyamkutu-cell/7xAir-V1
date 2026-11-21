use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::WebviewWindow;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherPaths {
    pub root_dir: String,
    pub settings_file: String,
    pub profiles_file: String,
    pub instances_file: String,
    pub instances_dir: String,
    pub runtime_dir: String,
    pub cache_dir: String,
    pub assets_dir: String,
    pub libraries_dir: String,
    pub versions_dir: String,
}

impl LauncherPaths {
    /// Resolves %APPDATA%\7xAir on Windows and XDG data/config fallback on other OSes.
    pub fn resolve() -> Self {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("7xAir");

        let settings_file = base.join("settings.json");
        let profiles_file = base.join("profiles.json");
        let instances_file = base.join("instances.json");
        let instances_dir = base.join("instances");
        let runtime_dir = base.join("runtime");
        let cache_dir = base.join("cache");
        let assets_dir = base.join("assets");
        let libraries_dir = base.join("libraries");
        let versions_dir = base.join("versions");

        Self {
            root_dir: base.to_string_lossy().to_string(),
            settings_file: settings_file.to_string_lossy().to_string(),
            profiles_file: profiles_file.to_string_lossy().to_string(),
            instances_file: instances_file.to_string_lossy().to_string(),
            instances_dir: instances_dir.to_string_lossy().to_string(),
            runtime_dir: runtime_dir.to_string_lossy().to_string(),
            cache_dir: cache_dir.to_string_lossy().to_string(),
            assets_dir: assets_dir.to_string_lossy().to_string(),
            libraries_dir: libraries_dir.to_string_lossy().to_string(),
            versions_dir: versions_dir.to_string_lossy().to_string(),
        }
    }

    pub fn ensure_layout(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.root_dir)?;
        fs::create_dir_all(&self.instances_dir)?;
        fs::create_dir_all(&self.runtime_dir)?;
        fs::create_dir_all(&self.cache_dir)?;
        fs::create_dir_all(&self.assets_dir)?;
        fs::create_dir_all(&self.libraries_dir)?;
        fs::create_dir_all(&self.versions_dir)?;
        Ok(())
    }

    pub fn settings_path(&self) -> PathBuf {
        PathBuf::from(&self.settings_file)
    }

    pub fn profiles_path(&self) -> PathBuf {
        PathBuf::from(&self.profiles_file)
    }

    pub fn instances_file_path(&self) -> PathBuf {
        PathBuf::from(&self.instances_file)
    }

    pub fn instances_path(&self) -> PathBuf {
        PathBuf::from(&self.instances_dir)
    }

    pub fn cache_path(&self) -> PathBuf {
        PathBuf::from(&self.cache_dir)
    }

    pub fn assets_path(&self) -> PathBuf {
        PathBuf::from(&self.assets_dir)
    }

    pub fn libraries_path(&self) -> PathBuf {
        PathBuf::from(&self.libraries_dir)
    }

    pub fn versions_path(&self) -> PathBuf {
        PathBuf::from(&self.versions_dir)
    }
}

/// Applies native Windows 10/11 translucent backdrop (Mica on Win 11, Acrylic fallback on Win 10).
#[cfg(target_os = "windows")]
pub fn apply_windows_glass_backdrop(window: &WebviewWindow) {
    use window_vibrancy::{apply_acrylic, apply_mica};

    if apply_mica(window, Some(true)).is_err() {
        let _ = apply_acrylic(window, Some((14, 18, 28, 165)));
    }
}

#[cfg(not(target_os = "windows"))]
pub fn apply_windows_glass_backdrop(_window: &WebviewWindow) {}
