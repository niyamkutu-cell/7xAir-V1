use crate::windows::LauncherPaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use thiserror::Error;
use uuid::Uuid;

const AUDIUS_API_BASE: &str = "https://discoveryprovider.audius.co/v1";
const DEEZER_API_BASE: &str = "https://api.deezer.com";
const SPOTIFY_API_BASE: &str = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const SPOTIFY_REDIRECT_PORT: u16 = 43821;
const SPOTIFY_REDIRECT_URI: &str = "http://127.0.0.1:43821/callback";

#[derive(Debug, Error)]
pub enum MusicError {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("music provider error: {0}")]
    Provider(String),
    #[error("Spotify OAuth configuration error: {0}")]
    SpotifyConfig(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrack {
    pub id: String,
    pub provider: String, // "audius" | "deezer" | "spotify"
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_url: Option<String>,
    pub duration_sec: u64,
    pub stream_url: Option<String>,
    pub external_url: Option<String>,
    pub playback_quality: String,
    pub is_preview: bool,
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicCollection {
    pub id: String,
    pub provider: String,
    pub kind: String, // "playlist" | "album"
    pub title: String,
    pub subtitle: String,
    pub artwork_url: Option<String>,
    pub track_count: usize,
    pub external_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDiscoveryResponse {
    pub provider: String,
    pub popular: Vec<MusicTrack>,
    pub recommended: Vec<MusicTrack>,
    pub playlists: Vec<MusicCollection>,
    pub albums: Vec<MusicCollection>,
    pub notice: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicSearchResponse {
    pub provider: String,
    pub query: String,
    pub search_mode: String, // "all" | "song" | "artist"
    pub tracks: Vec<MusicTrack>,
    pub albums: Vec<MusicCollection>,
    pub playlists: Vec<MusicCollection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPreferences {
    pub preferred_provider: String,
    pub volume: f64,
    pub shuffle: bool,
    pub repeat_mode: String, // "off" | "all" | "one"
    pub pause_on_minecraft_launch: bool,
    pub stop_on_launcher_close: bool,
}

impl Default for MusicPreferences {
    fn default() -> Self {
        Self {
            preferred_provider: "audius".to_string(),
            volume: 0.75,
            shuffle: false,
            repeat_mode: "off".to_string(),
            pause_on_minecraft_launch: false,
            stop_on_launcher_close: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyConnectionInfo {
    pub connected: bool,
    pub client_id_configured: bool,
    pub client_id_source: Option<String>,
    pub display_name: Option<String>,
    pub product: Option<String>, // "premium" | "free" | "open"
    pub premium_required_note: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpotifySession {
    pub client_id: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at_epoch: u64,
    pub display_name: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MusicStateFile {
    #[serde(default)]
    pub preferences: MusicPreferences,
    #[serde(default)]
    pub recently_played: Vec<MusicTrack>,
    #[serde(default)]
    pub spotify: StoredSpotifySession,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicStateSnapshot {
    pub preferences: MusicPreferences,
    pub recently_played: Vec<MusicTrack>,
    pub spotify: SpotifyConnectionInfo,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, MusicError> {
    Ok(reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0 (Official Music API Client)")
        .timeout(Duration::from_secs(14))
        .build()?)
}

pub fn music_state_path(paths: &LauncherPaths) -> PathBuf {
    PathBuf::from(&paths.root_dir).join("music-state.json")
}

pub fn load_music_state(paths: &LauncherPaths) -> MusicStateFile {
    let path = music_state_path(paths);
    if !path.exists() {
        return MusicStateFile::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<MusicStateFile>(&raw).ok())
        .unwrap_or_default()
}

pub fn save_music_state_atomic(
    paths: &LauncherPaths,
    state: &MusicStateFile,
) -> Result<(), MusicError> {
    let path = music_state_path(paths);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(state)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn base64url_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((input.len() * 4).div_ceil(3));
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i];
        let b1 = if i + 1 < input.len() { input[i + 1] } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] } else { 0 };
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < input.len() {
            out.push(TABLE[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        }
        if i + 2 < input.len() {
            out.push(TABLE[(b2 & 0x3F) as usize] as char);
        }
        i += 3;
    }
    out
}

fn resolve_spotify_client_id(paths: &LauncherPaths, stored: &StoredSpotifySession) -> (Option<String>, Option<String>) {
    if let Ok(val) = std::env::var("SEVENXAIR_SPOTIFY_CLIENT_ID") {
        let trimmed = val.trim().to_string();
        if !trimmed.is_empty() {
            return (Some(trimmed), Some("environment".to_string()));
        }
    }
    if let Some(compiled) = option_env!("SEVENXAIR_SPOTIFY_CLIENT_ID") {
        let trimmed = compiled.trim().to_string();
        if !trimmed.is_empty() {
            return (Some(trimmed), Some("build-config".to_string()));
        }
    }
    if let Some(saved) = stored.client_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return (Some(saved.to_string()), Some("music-state.json".to_string()));
    }
    // Check .env in root_dir
    let dotenv_path = PathBuf::from(&paths.root_dir).join(".env");
    if let Ok(raw) = fs::read_to_string(dotenv_path) {
        for line in raw.lines() {
            if let Some(rest) = line.trim().strip_prefix("SEVENXAIR_SPOTIFY_CLIENT_ID=") {
                let clean = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                if !clean.is_empty() {
                    return (Some(clean), Some(".env".to_string()));
                }
            }
        }
    }
    (None, None)
}

pub fn build_spotify_connection_info(
    paths: &LauncherPaths,
    stored: &StoredSpotifySession,
) -> SpotifyConnectionInfo {
    let (client_id, source) = resolve_spotify_client_id(paths, stored);
    let connected = stored
        .access_token
        .as_deref()
        .map(|t| !t.is_empty())
        .unwrap_or(false);
    SpotifyConnectionInfo {
        connected,
        client_id_configured: client_id.is_some(),
        client_id_source: source,
        display_name: stored.display_name.clone(),
        product: stored.product.clone(),
        premium_required_note: "Official Spotify Connect playback requires a Spotify Premium account and an active Spotify device. Free Spotify accounts can still browse playlists and use Audius/Deezer fallback playback inside 7xAir.".to_string(),
        redirect_uri: SPOTIFY_REDIRECT_URI.to_string(),
    }
}

pub fn get_music_state_snapshot(paths: &LauncherPaths) -> MusicStateSnapshot {
    let state = load_music_state(paths);
    let spotify = build_spotify_connection_info(paths, &state.spotify);
    MusicStateSnapshot {
        preferences: state.preferences,
        recently_played: state.recently_played,
        spotify,
    }
}

pub fn update_music_preferences(
    paths: &LauncherPaths,
    prefs: MusicPreferences,
) -> Result<MusicStateSnapshot, MusicError> {
    let mut state = load_music_state(paths);
    state.preferences = MusicPreferences {
        volume: prefs.volume.clamp(0.0, 1.0),
        ..prefs
    };
    save_music_state_atomic(paths, &state)?;
    Ok(get_music_state_snapshot(paths))
}

pub fn record_recently_played(
    paths: &LauncherPaths,
    track: MusicTrack,
) -> Result<MusicStateSnapshot, MusicError> {
    let mut state = load_music_state(paths);
    state
        .recently_played
        .retain(|t| !(t.id == track.id && t.provider == track.provider));
    state.recently_played.insert(0, track);
    if state.recently_played.len() > 40 {
        state.recently_played.truncate(40);
    }
    save_music_state_atomic(paths, &state)?;
    Ok(get_music_state_snapshot(paths))
}

pub fn set_spotify_client_id(
    paths: &LauncherPaths,
    client_id: String,
) -> Result<MusicStateSnapshot, MusicError> {
    let mut state = load_music_state(paths);
    let trimmed = client_id.trim().to_string();
    state.spotify.client_id = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };
    save_music_state_atomic(paths, &state)?;
    Ok(get_music_state_snapshot(paths))
}

pub fn disconnect_spotify(paths: &LauncherPaths) -> Result<MusicStateSnapshot, MusicError> {
    let mut state = load_music_state(paths);
    state.spotify.access_token = None;
    state.spotify.refresh_token = None;
    state.spotify.expires_at_epoch = 0;
    state.spotify.display_name = None;
    state.spotify.product = None;
    save_music_state_atomic(paths, &state)?;
    Ok(get_music_state_snapshot(paths))
}

// ---------- Audius Official Public API Parsing ----------

fn parse_audius_track(item: &serde_json::Value) -> Option<MusicTrack> {
    let id = item.get("id")?.as_str()?.to_string();
    let title = item.get("title")?.as_str()?.trim().to_string();
    let artist = item
        .get("user")
        .and_then(|u| u.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Artist")
        .trim()
        .to_string();
    let artwork = item
        .get("artwork")
        .and_then(|a| {
            a.get("480x480")
                .or_else(|| a.get("150x150"))
                .or_else(|| a.get("1000x1000"))
        })
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let duration_sec = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
    let permalink = item
        .get("permalink")
        .and_then(|v| v.as_str())
        .map(|p| format!("https://audius.co{p}"));

    Some(MusicTrack {
        id: id.clone(),
        provider: "audius".to_string(),
        title,
        artist,
        album: item
            .get("genre")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Audius Single")
            .to_string(),
        artwork_url: artwork,
        duration_sec,
        stream_url: Some(format!("{AUDIUS_API_BASE}/tracks/{id}/stream?app_name=7xAir")),
        external_url: permalink,
        playback_quality: "Audius Official Stream (Full Track)".to_string(),
        is_preview: false,
        uri: None,
    })
}

fn parse_audius_collection(item: &serde_json::Value) -> Option<MusicCollection> {
    let id = item.get("id")?.as_str()?.to_string();
    let title = item
        .get("playlist_name")
        .and_then(|v| v.as_str())
        .unwrap_or("Playlist")
        .trim()
        .to_string();
    let is_album = item.get("is_album").and_then(|v| v.as_bool()).unwrap_or(false);
    let creator = item
        .get("user")
        .and_then(|u| u.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Audius")
        .trim()
        .to_string();
    let artwork = item
        .get("artwork")
        .and_then(|a| a.get("480x480").or_else(|| a.get("150x150")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let track_count = item
        .get("track_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let permalink = item
        .get("permalink")
        .and_then(|v| v.as_str())
        .map(|p| format!("https://audius.co{p}"));

    Some(MusicCollection {
        id,
        provider: "audius".to_string(),
        kind: if is_album { "album" } else { "playlist" }.to_string(),
        title,
        subtitle: creator,
        artwork_url: artwork,
        track_count,
        external_url: permalink,
    })
}

// ---------- Deezer Official Public API Parsing ----------

fn parse_deezer_track(item: &serde_json::Value) -> Option<MusicTrack> {
    let id = item.get("id")?.as_u64()?.to_string();
    let title = item.get("title")?.as_str()?.trim().to_string();
    let artist = item
        .get("artist")
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Artist")
        .trim()
        .to_string();
    let album_obj = item.get("album");
    let album = album_obj
        .and_then(|a| a.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or("Single")
        .trim()
        .to_string();
    let artwork = album_obj
        .and_then(|a| {
            a.get("cover_big")
                .or_else(|| a.get("cover_medium"))
                .or_else(|| a.get("cover"))
        })
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let preview = item
        .get("preview")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let duration_sec = if preview.is_some() {
        30
    } else {
        item.get("duration").and_then(|v| v.as_u64()).unwrap_or(30)
    };

    Some(MusicTrack {
        id,
        provider: "deezer".to_string(),
        title,
        artist,
        album,
        artwork_url: artwork,
        duration_sec,
        stream_url: preview,
        external_url: item.get("link").and_then(|v| v.as_str()).map(|s| s.to_string()),
        playback_quality: "Deezer Official Preview (30s MP3)".to_string(),
        is_preview: true,
        uri: None,
    })
}

fn parse_deezer_collection(item: &serde_json::Value, kind: &str) -> Option<MusicCollection> {
    let id = item.get("id")?.as_u64()?.to_string();
    let title = item.get("title")?.as_str()?.trim().to_string();
    let subtitle = if kind == "album" {
        item.get("artist")
            .and_then(|a| a.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Artist")
            .to_string()
    } else {
        item.get("user")
            .and_then(|u| u.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Deezer")
            .to_string()
    };
    let artwork = item
        .get("picture_big")
        .or_else(|| item.get("cover_big"))
        .or_else(|| item.get("picture_medium"))
        .or_else(|| item.get("cover_medium"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let track_count = item
        .get("nb_tracks")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

    Some(MusicCollection {
        id,
        provider: "deezer".to_string(),
        kind: kind.to_string(),
        title,
        subtitle,
        artwork_url: artwork,
        track_count,
        external_url: item.get("link").and_then(|v| v.as_str()).map(|s| s.to_string()),
    })
}

// ---------- Discovery, Search & Collection Tracks ----------

pub async fn fetch_music_discovery(
    paths: &LauncherPaths,
    provider: &str,
) -> Result<MusicDiscoveryResponse, MusicError> {
    let client = http_client()?;
    match provider {
        "deezer" => {
            let val: serde_json::Value = client
                .get(format!("{DEEZER_API_BASE}/chart"))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let popular: Vec<MusicTrack> = val
                .get("tracks")
                .and_then(|t| t.get("data"))
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_deezer_track).collect())
                .unwrap_or_default();
            let albums: Vec<MusicCollection> = val
                .get("albums")
                .and_then(|a| a.get("data"))
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| parse_deezer_collection(v, "album"))
                        .collect()
                })
                .unwrap_or_default();
            let playlists: Vec<MusicCollection> = val
                .get("playlists")
                .and_then(|p| p.get("data"))
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| parse_deezer_collection(v, "playlist"))
                        .collect()
                })
                .unwrap_or_default();
            let recommended = popular.iter().skip(6).take(12).cloned().collect();
            Ok(MusicDiscoveryResponse {
                provider: "deezer".to_string(),
                popular,
                recommended,
                playlists,
                albums,
                notice: Some(
                    "Deezer Official Public API provides 30-second MP3 previews. Switch to Audius for full-length open-licensed streams."
                        .to_string(),
                ),
            })
        }
        "spotify" => {
            let state = load_music_state(paths);
            let Some(token) = state.spotify.access_token.as_deref().filter(|s| !s.is_empty()) else {
                return Err(MusicError::SpotifyConfig(
                    "Spotify is not connected yet. Connect your Spotify account in Music Services settings."
                        .to_string(),
                ));
            };
            let top_val: serde_json::Value = client
                .get(format!("{SPOTIFY_API_BASE}/me/top/tracks?limit=15"))
                .bearer_auth(token)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let playlists_val: serde_json::Value = client
                .get(format!("{SPOTIFY_API_BASE}/me/playlists?limit=12"))
                .bearer_auth(token)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let popular: Vec<MusicTrack> = top_val
                .get("items")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_spotify_track).collect())
                .unwrap_or_default();
            let playlists: Vec<MusicCollection> = playlists_val
                .get("items")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_spotify_playlist).collect())
                .unwrap_or_default();

            Ok(MusicDiscoveryResponse {
                provider: "spotify".to_string(),
                popular: popular.clone(),
                recommended: popular,
                playlists,
                albums: Vec::new(),
                notice: Some(
                    "Connected to Spotify Official Web API. Full playback requires Spotify Premium + an active Spotify Connect device."
                        .to_string(),
                ),
            })
        }
        _ => {
            // Default: Audius Official Open API (full-length artist-authorized streams)
            let trending_res: serde_json::Value = client
                .get(format!("{AUDIUS_API_BASE}/tracks/trending?app_name=7xAir&limit=20"))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let rec_res: serde_json::Value = client
                .get(format!(
                    "{AUDIUS_API_BASE}/tracks/trending?app_name=7xAir&time=month&limit=16"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let pl_res: serde_json::Value = client
                .get(format!(
                    "{AUDIUS_API_BASE}/playlists/trending?app_name=7xAir&limit=12"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let popular: Vec<MusicTrack> = trending_res
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_track).collect())
                .unwrap_or_default();
            let recommended: Vec<MusicTrack> = rec_res
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_track).collect())
                .unwrap_or_default();
            let all_collections: Vec<MusicCollection> = pl_res
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_collection).collect())
                .unwrap_or_default();
            let albums = all_collections
                .iter()
                .filter(|c| c.kind == "album")
                .cloned()
                .collect();
            let playlists = all_collections
                .into_iter()
                .filter(|c| c.kind == "playlist")
                .collect();

            Ok(MusicDiscoveryResponse {
                provider: "audius".to_string(),
                popular,
                recommended,
                playlists,
                albums,
                notice: Some(
                    "Streaming full-length, artist-authorized tracks via the official Audius Open API."
                        .to_string(),
                ),
            })
        }
    }
}

pub async fn search_music_catalog(
    paths: &LauncherPaths,
    provider: &str,
    query: &str,
    search_mode: &str,
) -> Result<MusicSearchResponse, MusicError> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(MusicSearchResponse {
            provider: provider.to_string(),
            query: String::new(),
            search_mode: search_mode.to_string(),
            tracks: Vec::new(),
            albums: Vec::new(),
            playlists: Vec::new(),
        });
    }
    let client = http_client()?;
    match provider {
        "deezer" => {
            let q = match search_mode {
                "artist" => format!("artist:\"{trimmed}\""),
                "song" => format!("track:\"{trimmed}\""),
                _ => trimmed.to_string(),
            };
            let encoded = url_encode(&q);
            let tracks_val: serde_json::Value = client
                .get(format!("{DEEZER_API_BASE}/search?q={encoded}&limit=24"))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let albums_val: serde_json::Value = client
                .get(format!("{DEEZER_API_BASE}/search/album?q={encoded}&limit=8"))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let playlists_val: serde_json::Value = client
                .get(format!(
                    "{DEEZER_API_BASE}/search/playlist?q={encoded}&limit=8"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let tracks = tracks_val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_deezer_track).collect())
                .unwrap_or_default();
            let albums = albums_val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| parse_deezer_collection(v, "album"))
                        .collect()
                })
                .unwrap_or_default();
            let playlists = playlists_val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| parse_deezer_collection(v, "playlist"))
                        .collect()
                })
                .unwrap_or_default();

            Ok(MusicSearchResponse {
                provider: "deezer".to_string(),
                query: trimmed.to_string(),
                search_mode: search_mode.to_string(),
                tracks,
                albums,
                playlists,
            })
        }
        "spotify" => {
            let state = load_music_state(paths);
            let Some(token) = state.spotify.access_token.as_deref().filter(|s| !s.is_empty()) else {
                return Err(MusicError::SpotifyConfig(
                    "Connect Spotify in Music Services settings before searching Spotify."
                        .to_string(),
                ));
            };
            let q = match search_mode {
                "artist" => format!("artist:{trimmed}"),
                "song" => format!("track:{trimmed}"),
                _ => trimmed.to_string(),
            };
            let encoded = url_encode(&q);
            let val: serde_json::Value = client
                .get(format!(
                    "{SPOTIFY_API_BASE}/search?q={encoded}&type=track,album,playlist&limit=18"
                ))
                .bearer_auth(token)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let tracks = val
                .get("tracks")
                .and_then(|t| t.get("items"))
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_spotify_track).collect())
                .unwrap_or_default();
            let playlists = val
                .get("playlists")
                .and_then(|p| p.get("items"))
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_spotify_playlist).collect())
                .unwrap_or_default();
            Ok(MusicSearchResponse {
                provider: "spotify".to_string(),
                query: trimmed.to_string(),
                search_mode: search_mode.to_string(),
                tracks,
                albums: Vec::new(),
                playlists,
            })
        }
        _ => {
            let encoded = url_encode(trimmed);
            let tracks_val: serde_json::Value = client
                .get(format!(
                    "{AUDIUS_API_BASE}/tracks/search?query={encoded}&app_name=7xAir&limit=24"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let pl_val: serde_json::Value = client
                .get(format!(
                    "{AUDIUS_API_BASE}/playlists/search?query={encoded}&app_name=7xAir&limit=10"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let mut tracks: Vec<MusicTrack> = tracks_val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_track).collect())
                .unwrap_or_default();
            if search_mode == "artist" {
                let lower = trimmed.to_ascii_lowercase();
                tracks.sort_by_key(|t| !t.artist.to_ascii_lowercase().contains(&lower));
            }
            let collections: Vec<MusicCollection> = pl_val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_collection).collect())
                .unwrap_or_default();
            let albums = collections
                .iter()
                .filter(|c| c.kind == "album")
                .cloned()
                .collect();
            let playlists = collections
                .into_iter()
                .filter(|c| c.kind == "playlist")
                .collect();

            Ok(MusicSearchResponse {
                provider: "audius".to_string(),
                query: trimmed.to_string(),
                search_mode: search_mode.to_string(),
                tracks,
                albums,
                playlists,
            })
        }
    }
}

pub async fn fetch_collection_tracks(
    paths: &LauncherPaths,
    provider: &str,
    kind: &str,
    collection_id: &str,
) -> Result<Vec<MusicTrack>, MusicError> {
    let client = http_client()?;
    match provider {
        "deezer" => {
            let endpoint = if kind == "album" {
                format!("{DEEZER_API_BASE}/album/{collection_id}")
            } else {
                format!("{DEEZER_API_BASE}/playlist/{collection_id}")
            };
            let val: serde_json::Value = client
                .get(endpoint)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(val
                .get("tracks")
                .and_then(|t| t.get("data"))
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_deezer_track).collect())
                .unwrap_or_default())
        }
        "spotify" => {
            let state = load_music_state(paths);
            let Some(token) = state.spotify.access_token.as_deref().filter(|s| !s.is_empty()) else {
                return Err(MusicError::SpotifyConfig("Spotify not connected.".to_string()));
            };
            let val: serde_json::Value = client
                .get(format!(
                    "{SPOTIFY_API_BASE}/playlists/{collection_id}/tracks?limit=30"
                ))
                .bearer_auth(token)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(val
                .get("items")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.get("track").and_then(parse_spotify_track))
                        .collect()
                })
                .unwrap_or_default())
        }
        _ => {
            let val: serde_json::Value = client
                .get(format!(
                    "{AUDIUS_API_BASE}/playlists/{collection_id}/tracks?app_name=7xAir"
                ))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(val
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().filter_map(parse_audius_track).collect())
                .unwrap_or_default())
        }
    }
}

// ---------- Official Spotify PKCE OAuth & Connect Control ----------

fn parse_spotify_track(item: &serde_json::Value) -> Option<MusicTrack> {
    let id = item.get("id")?.as_str()?.to_string();
    let title = item.get("name")?.as_str()?.trim().to_string();
    let artist = item
        .get("artists")
        .and_then(|a| a.as_array())
        .and_then(|arr| arr.first())
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Artist")
        .to_string();
    let album_obj = item.get("album");
    let album = album_obj
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Single")
        .to_string();
    let artwork = album_obj
        .and_then(|a| a.get("images"))
        .and_then(|i| i.as_array())
        .and_then(|arr| arr.first())
        .and_then(|img| img.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());
    let duration_sec = item
        .get("duration_ms")
        .and_then(|v| v.as_u64())
        .map(|ms| ms / 1000)
        .unwrap_or(0);
    let preview = item
        .get("preview_url")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let uri = item.get("uri").and_then(|v| v.as_str()).map(|s| s.to_string());

    Some(MusicTrack {
        id,
        provider: "spotify".to_string(),
        title,
        artist,
        album,
        artwork_url: artwork,
        duration_sec,
        stream_url: preview.clone(),
        external_url: item
            .get("external_urls")
            .and_then(|u| u.get("spotify"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        playback_quality: if preview.is_some() {
            "Spotify Official Preview / Connect".to_string()
        } else {
            "Spotify Connect (Premium Required)".to_string()
        },
        is_preview: preview.is_some(),
        uri,
    })
}

fn parse_spotify_playlist(item: &serde_json::Value) -> Option<MusicCollection> {
    let id = item.get("id")?.as_str()?.to_string();
    let title = item.get("name")?.as_str()?.trim().to_string();
    let owner = item
        .get("owner")
        .and_then(|o| o.get("display_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify")
        .to_string();
    let artwork = item
        .get("images")
        .and_then(|i| i.as_array())
        .and_then(|arr| arr.first())
        .and_then(|img| img.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());
    let track_count = item
        .get("tracks")
        .and_then(|t| t.get("total"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    Some(MusicCollection {
        id,
        provider: "spotify".to_string(),
        kind: "playlist".to_string(),
        title,
        subtitle: owner,
        artwork_url: artwork,
        track_count,
        external_url: item
            .get("external_urls")
            .and_then(|u| u.get("spotify"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

/// Runs an official Spotify OAuth 2.0 PKCE authorization flow via local loopback callback (`127.0.0.1:43821`).
/// Never collects passwords and never uses a client secret.
pub async fn connect_spotify_pkce(paths: &LauncherPaths) -> Result<MusicStateSnapshot, MusicError> {
    let mut state = load_music_state(paths);
    let (client_id_opt, _) = resolve_spotify_client_id(paths, &state.spotify);
    let client_id = client_id_opt.ok_or_else(|| {
        MusicError::SpotifyConfig(format!(
            "Spotify Client ID is not configured. Create a free Spotify Developer App, add '{}' as Redirect URI, and enter its Client ID in Music Services settings (or set SEVENXAIR_SPOTIFY_CLIENT_ID).",
            SPOTIFY_REDIRECT_URI
        ))
    })?;

    let verifier = format!(
        "{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = base64url_encode(&hasher.finalize());
    let csrf_state = Uuid::new_v4().simple().to_string();

    let scope = "user-read-private user-read-playback-state user-modify-playback-state user-top-read user-read-recently-played playlist-read-private";
    let auth_url = format!(
        "{SPOTIFY_AUTH_URL}?client_id={}&response_type=code&redirect_uri={}&code_challenge_method=S256&code_challenge={}&state={}&scope={}",
        url_encode(&client_id),
        url_encode(SPOTIFY_REDIRECT_URI),
        url_encode(&challenge),
        url_encode(&csrf_state),
        url_encode(scope)
    );

    let listener = TcpListener::bind(("127.0.0.1", SPOTIFY_REDIRECT_PORT)).map_err(|e| {
        MusicError::SpotifyConfig(format!(
            "Unable to start local OAuth callback listener on port {SPOTIFY_REDIRECT_PORT}: {e}"
        ))
    })?;
    let _ = listener.set_nonblocking(false);

    // Open official Spotify login page in the user's default browser
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &auth_url])
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&auth_url).spawn();
    }

    // Wait for OAuth callback on blocking thread with timeout
    let expected_state = csrf_state.clone();
    let code = tokio_or_thread_accept(listener, expected_state)?;

    let client = http_client()?;
    let token_resp: serde_json::Value = client
        .post(SPOTIFY_TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", SPOTIFY_REDIRECT_URI),
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let access_token = token_resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| MusicError::Provider("Spotify token response missing access_token".into()))?
        .to_string();
    let refresh_token = token_resp
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let expires_in = token_resp
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);

    let me: serde_json::Value = client
        .get(format!("{SPOTIFY_API_BASE}/me"))
        .bearer_auth(&access_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    state.spotify.access_token = Some(access_token);
    state.spotify.refresh_token = refresh_token;
    state.spotify.expires_at_epoch = now_epoch() + expires_in;
    state.spotify.display_name = me
        .get("display_name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    state.spotify.product = me
        .get("product")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    save_music_state_atomic(paths, &state)?;
    Ok(get_music_state_snapshot(paths))
}

fn tokio_or_thread_accept(listener: TcpListener, expected_state: String) -> Result<String, MusicError> {
    let (mut stream, _) = listener.accept().map_err(|e| {
        MusicError::SpotifyConfig(format!("Spotify OAuth callback failed or timed out: {e}"))
    })?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);
    let path_line = req.lines().next().unwrap_or("");
    let query = path_line
        .split_whitespace()
        .nth(1)
        .and_then(|p| p.split_once('?'))
        .map(|(_, q)| q)
        .unwrap_or("");

    let mut code = None;
    let mut state_val = None;
    let mut error_val = None;
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "code" => code = Some(v.to_string()),
                "state" => state_val = Some(v.to_string()),
                "error" => error_val = Some(v.to_string()),
                _ => {}
            }
        }
    }

    let html = if code.is_some() && state_val.as_deref() == Some(expected_state.as_str()) {
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body style='background:#0a0a0c;color:#fff;font-family:sans-serif;padding:40px;text-align:center'><h2>7xAir connected to Spotify</h2><p>You can close this tab and return to the 7xAir Launcher.</p></body></html>"
    } else {
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body style='background:#0a0a0c;color:#fca5a5;font-family:sans-serif;padding:40px;text-align:center'><h2>Spotify authorization was cancelled or failed</h2><p>Return to 7xAir to retry.</p></body></html>"
    };
    let _ = stream.write_all(html.as_bytes());
    let _ = stream.flush();

    if let Some(err) = error_val {
        return Err(MusicError::SpotifyConfig(format!(
            "Spotify authorization cancelled or denied: {err}"
        )));
    }
    if state_val.as_deref() != Some(expected_state.as_str()) {
        return Err(MusicError::SpotifyConfig(
            "OAuth state mismatch; authorization rejected for security.".to_string(),
        ));
    }
    code.ok_or_else(|| MusicError::SpotifyConfig("Missing authorization code from Spotify.".into()))
}

pub async fn control_spotify_connect(
    paths: &LauncherPaths,
    action: &str,
    track_uri: Option<String>,
) -> Result<String, MusicError> {
    let state = load_music_state(paths);
    let Some(token) = state.spotify.access_token.as_deref().filter(|s| !s.is_empty()) else {
        return Err(MusicError::SpotifyConfig("Spotify is not connected.".into()));
    };
    if state.spotify.product.as_deref() != Some("premium") {
        return Err(MusicError::SpotifyConfig(
            "Direct Spotify Connect playback requires a Spotify Premium subscription. Use Audius or Deezer fallback playback inside 7xAir."
                .into(),
        ));
    }
    let client = http_client()?;
    let resp = match action {
        "play" => {
            let mut req = client
                .put(format!("{SPOTIFY_API_BASE}/me/player/play"))
                .bearer_auth(token);
            if let Some(uri) = track_uri {
                req = req.json(&serde_json::json!({ "uris": [uri] }));
            }
            req.send().await?
        }
        "pause" => {
            client
                .put(format!("{SPOTIFY_API_BASE}/me/player/pause"))
                .bearer_auth(token)
                .send()
                .await?
        }
        "next" => {
            client
                .post(format!("{SPOTIFY_API_BASE}/me/player/next"))
                .bearer_auth(token)
                .send()
                .await?
        }
        "previous" => {
            client
                .post(format!("{SPOTIFY_API_BASE}/me/player/previous"))
                .bearer_auth(token)
                .send()
                .await?
        }
        _ => return Err(MusicError::Provider(format!("unsupported Spotify action '{action}'"))),
    };

    if !resp.status().is_success() {
        return Err(MusicError::Provider(format!(
            "Spotify Connect returned HTTP {} — make sure Spotify is open on an active playback device.",
            resp.status().as_u16()
        )));
    }
    Ok(format!("Spotify Connect: {action} succeeded."))
}
