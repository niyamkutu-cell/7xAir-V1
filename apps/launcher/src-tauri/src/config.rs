use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

pub const VALID_THEMES: [&str; 12] = [
    "obsidian-violet",
    "midnight-sky",
    "azure-mountains",
    "sakura-valley",
    "emerald-wilderness",
    "frozen-peaks",
    "sunset-horizon",
    "midnight-forest",
    "dreamy-anime",
    "midnight-anime",
    "serenity-nature",
    "anime-glass",
];

pub const SUPPORTED_MC_TARGETS: [&str; 2] = ["1.21.11", "26.2"];

pub const VALID_STARTUP_ROUTES: [&str; 9] = [
    "home",
    "instances",
    "modrinth",
    "music",
    "performance",
    "client",
    "profiles",
    "themes",
    "settings",
];

pub const VALID_FONT_SIZES: [&str; 4] = ["sm", "md", "lg", "xl"];
pub const VALID_FX_QUALITIES: [&str; 4] = ["low", "balanced", "high", "maximum"];

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_startup_route() -> String {
    "home".to_string()
}

fn default_wallpaper_id() -> String {
    "auto".to_string()
}

fn default_wallpaper_dim() -> f32 {
    0.56
}

fn default_font_size() -> String {
    "md".to_string()
}

fn default_wallpaper_fit() -> String {
    "cover".to_string()
}

fn default_wallpaper_position() -> String {
    "center".to_string()
}

fn default_one() -> f32 {
    1.0
}

fn default_zero() -> f32 {
    0.0
}

fn default_saturation() -> f32 {
    1.08
}

fn default_contrast() -> f32 {
    1.04
}

fn default_theme_switch_mode() -> String {
    "manual".to_string()
}

fn default_day_theme() -> String {
    "serenity-nature".to_string()
}

fn default_night_theme() -> String {
    "midnight-anime".to_string()
}

fn default_day_start_hour() -> u8 {
    7
}

fn default_night_start_hour() -> u8 {
    19
}

fn default_fx_quality() -> String {
    "balanced".to_string()
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
    #[serde(default = "default_wallpaper_id")]
    pub wallpaper_id: String,
    #[serde(default = "default_wallpaper_dim")]
    pub wallpaper_dim: f32,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_wallpaper_fit")]
    pub wallpaper_fit: String,
    #[serde(default = "default_wallpaper_position")]
    pub wallpaper_position: String,
    #[serde(default = "default_one")]
    pub wallpaper_brightness: f32,
    #[serde(default = "default_zero")]
    pub wallpaper_blur: f32,
    #[serde(default = "default_saturation")]
    pub wallpaper_saturation: f32,
    #[serde(default = "default_contrast")]
    pub wallpaper_contrast: f32,
    #[serde(default = "default_theme_switch_mode")]
    pub theme_switch_mode: String,
    #[serde(default = "default_day_theme")]
    pub day_theme: String,
    #[serde(default = "default_night_theme")]
    pub night_theme: String,
    #[serde(default = "default_day_start_hour")]
    pub day_start_hour: u8,
    #[serde(default = "default_night_start_hour")]
    pub night_start_hour: u8,
    #[serde(default = "default_fx_quality")]
    pub fx_quality: String,
    #[serde(default = "default_one")]
    pub fx_density: f32,
    #[serde(default = "default_one")]
    pub fx_speed: f32,
    #[serde(default = "default_true")]
    pub fx_rain_particles: bool,
    #[serde(default = "default_true")]
    pub fx_flying_objects: bool,
    #[serde(default = "default_true")]
    pub fx_music_visualizer: bool,
    #[serde(default = "default_true")]
    pub fx_ambient_lights: bool,
    #[serde(default = "default_true")]
    pub fx_reaction_icons: bool,
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
            theme: "obsidian-violet".to_string(),
            glass_opacity: 0.68,
            reduced_motion: false,
            background_animations: true,
            particle_effects: true,
            player_rotation: true,
            startup_route: "home".to_string(),
            launch_on_startup: false,
            pause_effects_in_game: true,
            wallpaper_id: default_wallpaper_id(),
            wallpaper_dim: default_wallpaper_dim(),
            font_size: default_font_size(),
            wallpaper_fit: default_wallpaper_fit(),
            wallpaper_position: default_wallpaper_position(),
            wallpaper_brightness: default_one(),
            wallpaper_blur: default_zero(),
            wallpaper_saturation: default_saturation(),
            wallpaper_contrast: default_contrast(),
            theme_switch_mode: default_theme_switch_mode(),
            day_theme: default_day_theme(),
            night_theme: default_night_theme(),
            day_start_hour: default_day_start_hour(),
            night_start_hour: default_night_start_hour(),
            fx_quality: default_fx_quality(),
            fx_density: default_one(),
            fx_speed: default_one(),
            fx_rain_particles: true,
            fx_flying_objects: true,
            fx_music_visualizer: true,
            fx_ambient_lights: true,
            fx_reaction_icons: true,
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
        if !(0.20..=0.88).contains(&self.wallpaper_dim) {
            return Err(ConfigError::Validation(
                "wallpaperDim must be between 0.20 and 0.88".to_string(),
            ));
        }
        if !VALID_FONT_SIZES.contains(&self.font_size.as_str()) {
            return Err(ConfigError::Validation(format!(
                "unsupported fontSize '{}'",
                self.font_size
            )));
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomWallpaperItem {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub mime_type: String,
    pub data_url: String,
}

fn wallpapers_dir_from_root(root_dir: &str) -> PathBuf {
    PathBuf::from(root_dir).join("wallpapers")
}

fn mime_for_ext(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn encode_base64_std(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() * 4).div_ceil(3) + 4);
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i];
        let b1 = if i + 1 < input.len() { input[i + 1] } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] } else { 0 };
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < input.len() {
            out.push(TABLE[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < input.len() {
            out.push(TABLE[(b2 & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn decode_base64_std(input: &str) -> Result<Vec<u8>, ConfigError> {
    let clean: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    let mut out = Vec::with_capacity((clean.len() * 3) / 4);
    let mut val = 0u32;
    let mut bits = 0u32;
    for b in clean {
        if b == b'=' {
            break;
        }
        let digit = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(ConfigError::Validation("invalid base64 image payload".into())),
        };
        val = (val << 6) | digit;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((val >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

pub fn list_persisted_wallpapers(root_dir: &str) -> Vec<CustomWallpaperItem> {
    let dir = wallpapers_dir_from_root(root_dir);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let Some(fname) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(ext) = p.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let Some(mime) = mime_for_ext(ext) else {
            continue;
        };
        if let Ok(bytes) = fs::read(&p) {
            if bytes.is_empty() || bytes.len() > 12 * 1024 * 1024 {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(fname);
            let data_url = format!("data:{mime};base64,{}", encode_base64_std(&bytes));
            items.push(CustomWallpaperItem {
                id: format!("custom:{fname}"),
                name: stem.replace(['_', '-'], " "),
                filename: fname.to_string(),
                mime_type: mime.to_string(),
                data_url,
            });
        }
    }
    items.sort_by(|a, b| a.filename.cmp(&b.filename));
    items
}

pub fn save_persisted_wallpaper(
    root_dir: &str,
    original_filename: &str,
    data_base64: &str,
) -> Result<CustomWallpaperItem, ConfigError> {
    let ext = PathBuf::from(original_filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let Some(mime) = mime_for_ext(&ext) else {
        return Err(ConfigError::Validation(
            "Only JPG, JPEG, PNG, and WebP wallpaper images are supported.".to_string(),
        ));
    };
    let raw_b64 = data_base64
        .split_once("base64,")
        .map(|(_, rest)| rest)
        .unwrap_or(data_base64);
    let bytes = decode_base64_std(raw_b64)?;
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err(ConfigError::Validation(
            "Wallpaper image must be between 1 byte and 10 MB.".to_string(),
        ));
    }

    let safe_stem: String = PathBuf::from(original_filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("wallpaper")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(36)
        .collect();
    let clean_stem = if safe_stem.is_empty() {
        "wallpaper".to_string()
    } else {
        safe_stem
    };
    let unique = uuid::Uuid::new_v4().simple().to_string();
    let fname = format!("{clean_stem}-{}.{ext}", &unique[..8]);
    let dir = wallpapers_dir_from_root(root_dir);
    fs::create_dir_all(&dir).map_err(ConfigError::WriteFile)?;
    let target = dir.join(&fname);
    let tmp = dir.join(format!("{fname}.tmp"));
    fs::write(&tmp, &bytes).map_err(ConfigError::WriteFile)?;
    fs::rename(&tmp, &target).map_err(ConfigError::WriteFile)?;

    Ok(CustomWallpaperItem {
        id: format!("custom:{fname}"),
        name: clean_stem.replace(['_', '-'], " "),
        filename: fname,
        mime_type: mime.to_string(),
        data_url: format!("data:{mime};base64,{}", encode_base64_std(&bytes)),
    })
}

pub fn remove_persisted_wallpaper(root_dir: &str, id_or_filename: &str) -> Result<bool, ConfigError> {
    let fname = id_or_filename.strip_prefix("custom:").unwrap_or(id_or_filename);
    if fname.contains('/') || fname.contains('\\') || fname.contains("..") {
        return Err(ConfigError::Validation("Invalid wallpaper filename.".into()));
    }
    let target = wallpapers_dir_from_root(root_dir).join(fname);
    if target.exists() && target.is_file() {
        fs::remove_file(&target).map_err(ConfigError::WriteFile)?;
        return Ok(true);
    }
    Ok(false)
}

pub fn customization_path_from_root(root_dir: &str) -> PathBuf {
    PathBuf::from(root_dir).join("customization.json")
}

pub fn load_customization_json(root_dir: &str) -> serde_json::Value {
    let path = customization_path_from_root(root_dir);
    if !path.exists() {
        return serde_json::json!({ "schemaVersion": 1 });
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({ "schemaVersion": 1 }))
}

pub fn save_customization_json(
    root_dir: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, ConfigError> {
    let path = customization_path_from_root(root_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(ConfigError::WriteFile)?;
    }
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(payload).map_err(ConfigError::SerializeJson)?;
    fs::write(&tmp, raw).map_err(ConfigError::WriteFile)?;
    fs::rename(&tmp, &path).map_err(ConfigError::WriteFile)?;
    Ok(payload.clone())
}
