use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

pub const VALID_THEMES: [&str; 7] = [
    "azure-mountains",
    "sakura-valley",
    "emerald-wilderness",
    "frozen-peaks",
    "sunset-horizon",
    "midnight-forest",
    "dreamy-anime",
];

pub const SUPPORTED_MC_TARGETS: [&str; 2] = ["1.21.11", "26.2"];

pub const VALID_STARTUP_ROUTES: [&str; 7] = [
    "home",
    "instances",
    "modrinth",
    "performance",
    "profiles",
    "themes",
    "settings",
];

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_startup_route() -> String {
    "home".to_string()
}

pub fn migrate_legacy_theme(theme: &str) -> Option<&'static str> {
    match theme {
        "obsidian-cyan" => Some("azure-mountains"),
        "sakura-rose" => Some("sakura-valley"),
        "aurora-emerald" => Some("emerald-wilderness"),
        "frost-silver" => Some("frozen-peaks"),
        "solar-amber" => Some("sunset-horizon"),
        "crimson-ember" => Some("midnight-forest"),
        "violet-nebula" => Some("dreamy-anime"),
        _ => None,
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("failed to create launcher directory: {0}")]
    CreateDir(#[source] std::io::Error),
    #[error("failed to read settings file: {0}")]
    ReadFile(#[source] std::io::Error),
    #[error("failed to parse settings JSON: {0}")]
    ParseJson(#[source] serde_json::Error),
    #[error("failed to serialize settings JSON: {0}")]
    SerializeJson(#[source] serde_json::Error),
    #[error("failed to write settings file: {0}")]
    WriteFile(#[source] std::io::Error),
    #[error("invalid setting: {0}")]
    Validation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub theme: String,
    pub glass_opacity: f32,
    pub reduced_motion: bool,
    #[serde(default = "default_true")]
    pub background_animations: bool,
    #[serde(default = "default_true")]
    pub particle_effects: bool,
    #[serde(default = "default_true")]
    pub player_rotation: bool,
    #[serde(default = "default_startup_route")]
    pub startup_route: String,
    #[serde(default = "default_false")]
    pub launch_on_startup: bool,
    #[serde(default = "default_true")]
    pub pause_effects_in_game: bool,
    pub auto_install_client: bool,
    pub default_mc_version: String,
    pub allocated_ram_mb: u32,
    pub java_path: String,
    pub jvm_args: String,
    pub close_on_launch: bool,
    pub auto_updates: bool,
    pub release_channel: String,
    pub game_dir: String,
}

impl LauncherSettings {
    pub fn default_with_dir(game_dir: PathBuf) -> Self {
        Self {
            theme: "azure-mountains".to_string(),
            glass_opacity: 0.68,
            reduced_motion: false,
            background_animations: true,
            particle_effects: true,
            player_rotation: true,
            startup_route: "home".to_string(),
            launch_on_startup: false,
            pause_effects_in_game: true,
            auto_install_client: true,
            default_mc_version: "1.21.11".to_string(),
            allocated_ram_mb: 4096,
            java_path: String::new(),
            jvm_args: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions".to_string(),
            close_on_launch: false,
            auto_updates: true,
            release_channel: "stable".to_string(),
            game_dir: game_dir.to_string_lossy().to_string(),
        }
    }

    pub fn validate(&self) -> Result<(), ConfigError> {
        if !VALID_THEMES.contains(&self.theme.as_str()) {
            return Err(ConfigError::Validation(format!(
                "unsupported theme '{}'",
                self.theme
            )));
        }
        if !(0.35..=0.95).contains(&self.glass_opacity) {
            return Err(ConfigError::Validation(
                "glassOpacity must be between 0.35 and 0.95".to_string(),
            ));
        }
        if !VALID_STARTUP_ROUTES.contains(&self.startup_route.as_str()) {
            return Err(ConfigError::Validation(format!(
                "unsupported startupRoute '{}'",
                self.startup_route
            )));
        }
        if !(1024..=32768).contains(&self.allocated_ram_mb) {
            return Err(ConfigError::Validation(
                "allocatedRamMb must be between 1024 and 32768".to_string(),
            ));
        }
        if !SUPPORTED_MC_TARGETS.contains(&self.default_mc_version.as_str()) {
            return Err(ConfigError::Validation(format!(
                "unsupported default Minecraft version '{}'",
                self.default_mc_version
            )));
        }
        if self.release_channel != "stable" && self.release_channel != "beta" {
            return Err(ConfigError::Validation(
                "releaseChannel must be 'stable' or 'beta'".to_string(),
            ));
        }
        Ok(())
    }
}

pub fn load_or_init_settings(
    settings_path: &PathBuf,
    default_game_dir: PathBuf,
) -> Result<LauncherSettings, ConfigError> {
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(ConfigError::CreateDir)?;
    }
    if !settings_path.exists() {
        let defaults = LauncherSettings::default_with_dir(default_game_dir);
        save_settings_atomic(settings_path, &defaults)?;
        return Ok(defaults);
    }

    let raw = fs::read_to_string(settings_path).map_err(ConfigError::ReadFile)?;
    let mut parsed: LauncherSettings = serde_json::from_str(&raw).map_err(ConfigError::ParseJson)?;
    if let Some(migrated) = migrate_legacy_theme(&parsed.theme) {
        parsed.theme = migrated.to_string();
        let _ = save_settings_atomic(settings_path, &parsed);
    }
    parsed.validate()?;
    Ok(parsed)
}

pub fn save_settings_atomic(
    settings_path: &PathBuf,
    settings: &LauncherSettings,
) -> Result<(), ConfigError> {
    settings.validate()?;
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(ConfigError::CreateDir)?;
    }
    let serialized =
        serde_json::to_string_pretty(settings).map_err(ConfigError::SerializeJson)?;
    let tmp_path = settings_path.with_extension("json.tmp");
    fs::write(&tmp_path, serialized).map_err(ConfigError::WriteFile)?;
    fs::rename(&tmp_path, settings_path).map_err(ConfigError::WriteFile)?;
    Ok(())
}
