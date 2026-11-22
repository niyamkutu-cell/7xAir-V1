use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use thiserror::Error;
use uuid::Uuid;

const PLACEHOLDER_CLIENT_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid username: {0}")]
    InvalidUsername(String),
    #[error("profile not found: {0}")]
    ProfileNotFound(String),
    #[error("Microsoft login is not configured: {0}")]
    MissingMsaClientId(String),
    #[error("Microsoft authentication error: {0}")]
    MicrosoftFlow(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthProvider {
    Offline,
    Microsoft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub provider: AuthProvider,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at_epoch: Option<u64>,
    #[serde(default)]
    pub skin_url: Option<String>,
    pub created_at_epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStore {
    pub active_profile_id: Option<String>,
    pub profiles: Vec<PlayerProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsaAuthConfigStatus {
    pub configured: bool,
    /// "env" | "build" | "dotenv" | "config_file" | "invalid" | "missing"
    pub source: String,
    pub diagnostic: String,
    pub setup_doc: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftDeviceCodeSession {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct MsaDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: Option<u64>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MsaTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MsaLocalConfigFile {
    client_id: Option<String>,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn is_valid_client_id(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == PLACEHOLDER_CLIENT_ID {
        return false;
    }
    Uuid::parse_str(trimmed).is_ok()
}

fn read_dotenv_client_id(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(val) = trimmed.strip_prefix("SEVENXAIR_MSA_CLIENT_ID=") {
            let unquoted = val.trim().trim_matches('"').trim_matches('\'').trim();
            if !unquoted.is_empty() {
                return Some(unquoted.to_string());
            }
        }
    }
    None
}

fn read_local_msa_config_file() -> Option<String> {
    let base = dirs::config_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let cfg_path = base.join("7xAir").join("msa-config.json");
    let raw = fs::read_to_string(cfg_path).ok()?;
    let parsed = serde_json::from_str::<MsaLocalConfigFile>(&raw).ok()?;
    parsed.client_id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Resolves SEVENXAIR_MSA_CLIENT_ID from:
/// 1. Runtime environment variable (dev / shell override)
/// 2. Build-time embedded environment variable (GitHub Actions / production release builds)
/// 3. Local `.env` file (current directory, parent workspace root, or executable directory)
/// 4. Local user config file (`%APPDATA%\7xAir\msa-config.json`)
/// Never hardcodes a third-party Client ID and never uses a client secret.
pub fn resolve_msa_client_id() -> Result<(String, &'static str), AuthError> {
    let candidates: Vec<(Option<String>, &'static str)> = vec![
        (std::env::var("SEVENXAIR_MSA_CLIENT_ID").ok(), "env"),
        (
            option_env!("SEVENXAIR_MSA_CLIENT_ID").map(str::to_string),
            "build",
        ),
        (read_dotenv_client_id(Path::new(".env")), "dotenv"),
        (read_dotenv_client_id(Path::new("../.env")), "dotenv"),
        (read_dotenv_client_id(Path::new("../../.env")), "dotenv"),
        (
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|p| read_dotenv_client_id(&p.join(".env"))))
                .flatten(),
            "dotenv",
        ),
        (read_local_msa_config_file(), "config_file"),
    ];

    let mut saw_invalid = false;
    for (maybe_val, source) in candidates {
        if let Some(val) = maybe_val {
            let trimmed = val.trim();
            if trimmed.is_empty() {
                continue;
            }
            if is_valid_client_id(trimmed) {
                return Ok((trimmed.to_string(), source));
            }
            saw_invalid = true;
        }
    }

    if saw_invalid {
        Err(AuthError::MissingMsaClientId(
            "SEVENXAIR_MSA_CLIENT_ID is set to a placeholder or invalid UUID. Replace it with your Microsoft Entra ID Application (client) ID (see docs/MICROSOFT_AUTH_SETUP.md)."
                .to_string(),
        ))
    } else {
        Err(AuthError::MissingMsaClientId(
            "SEVENXAIR_MSA_CLIENT_ID is not configured. Add your Microsoft App Registration Application (client) ID to GitHub Secrets (for release builds), .env (for local dev), or %APPDATA%\\7xAir\\msa-config.json. See docs/MICROSOFT_AUTH_SETUP.md."
                .to_string(),
        ))
    }
}

pub fn inspect_msa_auth_config() -> MsaAuthConfigStatus {
    match resolve_msa_client_id() {
        Ok((_, source)) => MsaAuthConfigStatus {
            configured: true,
            source: source.to_string(),
            diagnostic: format!(
                "Microsoft OAuth ready (loaded Application Client ID from {source})."
            ),
            setup_doc: "docs/MICROSOFT_AUTH_SETUP.md".to_string(),
        },
        Err(AuthError::MissingMsaClientId(msg)) => MsaAuthConfigStatus {
            configured: false,
            source: if msg.contains("placeholder") || msg.contains("invalid") {
                "invalid".to_string()
            } else {
                "missing".to_string()
            },
            diagnostic: msg,
            setup_doc: "docs/MICROSOFT_AUTH_SETUP.md".to_string(),
        },
        Err(other) => MsaAuthConfigStatus {
            configured: false,
            source: "missing".to_string(),
            diagnostic: other.to_string(),
            setup_doc: "docs/MICROSOFT_AUTH_SETUP.md".to_string(),
        },
    }
}

/// Computes Minecraft's canonical offline UUID v3: MD5("OfflinePlayer:" + username)
/// with RFC 4122 version 3 and variant bits set.
pub fn offline_uuid_v3(username: &str) -> String {
    let digest = md5::compute(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes = digest.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30; // version 3
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

pub fn validate_mc_username(username: &str) -> Result<String, AuthError> {
    let trimmed = username.trim();
    if trimmed.len() < 3 || trimmed.len() > 16 {
        return Err(AuthError::InvalidUsername(
            "username must be 3–16 characters".to_string(),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AuthError::InvalidUsername(
            "username may only contain A-Z, 0-9, and underscore".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

pub fn load_or_init_profiles(path: &PathBuf) -> Result<ProfileStore, AuthError> {
    if !path.exists() {
        let default_profile = PlayerProfile {
            id: Uuid::new_v4().to_string(),
            username: "AirPlayer".to_string(),
            uuid: offline_uuid_v3("AirPlayer"),
            provider: AuthProvider::Offline,
            access_token: "offline-local-token".to_string(),
            refresh_token: None,
            expires_at_epoch: None,
            skin_url: None,
            created_at_epoch: now_epoch(),
        };
        let store = ProfileStore {
            active_profile_id: Some(default_profile.id.clone()),
            profiles: vec![default_profile],
        };
        save_profiles_atomic(path, &store)?;
        return Ok(store);
    }

    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn save_profiles_atomic(path: &PathBuf, store: &ProfileStore) -> Result<(), AuthError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(store)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn add_offline_profile(
    store: &mut ProfileStore,
    username: &str,
) -> Result<PlayerProfile, AuthError> {
    let clean = validate_mc_username(username)?;
    let profile = PlayerProfile {
        id: Uuid::new_v4().to_string(),
        uuid: offline_uuid_v3(&clean),
        username: clean,
        provider: AuthProvider::Offline,
        access_token: "offline-local-token".to_string(),
        refresh_token: None,
        expires_at_epoch: None,
        skin_url: None,
        created_at_epoch: now_epoch(),
    };
    store.active_profile_id = Some(profile.id.clone());
    store.profiles.push(profile.clone());
    Ok(profile)
}

pub fn select_active_profile(store: &mut ProfileStore, profile_id: &str) -> Result<(), AuthError> {
    if !store.profiles.iter().any(|p| p.id == profile_id) {
        return Err(AuthError::ProfileNotFound(profile_id.to_string()));
    }
    store.active_profile_id = Some(profile_id.to_string());
    Ok(())
}

pub fn remove_profile(store: &mut ProfileStore, profile_id: &str) -> Result<(), AuthError> {
    let before = store.profiles.len();
    store.profiles.retain(|p| p.id != profile_id);
    if store.profiles.len() == before {
        return Err(AuthError::ProfileNotFound(profile_id.to_string()));
    }
    if store.active_profile_id.as_deref() == Some(profile_id) {
        store.active_profile_id = store.profiles.first().map(|p| p.id.clone());
    }
    Ok(())
}

fn open_verification_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Use rundll32 FileProtocolHandler so query parameters containing '&' are never truncated by cmd.exe.
        let spawned = std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x08000000)
            .spawn();
        if spawned.is_err() {
            let escaped = url.replace('&', "^&");
            let _ = std::process::Command::new("cmd.exe")
                .args(["/C", "start", "", &escaped])
                .creation_flags(0x08000000)
                .spawn();
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

/// Starts the official Microsoft OAuth 2.0 Device Code flow for personal Microsoft accounts.
/// Validates Client ID before contacting Microsoft so a broken OAuth flow is never started.
pub async fn begin_microsoft_device_login() -> Result<MicrosoftDeviceCodeSession, AuthError> {
    let (client_id, _) = resolve_msa_client_id()?;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let http_resp = http
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await?;

    if !http_resp.status().is_success() {
        let status = http_resp.status().as_u16();
        let body = http_resp.text().await.unwrap_or_default();
        return Err(AuthError::MicrosoftFlow(format!(
            "Microsoft rejected the device-code request (HTTP {status}). Ensure your Azure App Registration allows personal Microsoft accounts and has 'Allow public client flows' enabled. Details: {body}"
        )));
    }

    let resp: MsaDeviceCodeResponse = http_resp.json().await?;
    open_verification_browser(&resp.verification_uri);

    Ok(MicrosoftDeviceCodeSession {
        device_code: resp.device_code,
        user_code: resp.user_code,
        verification_uri: resp.verification_uri,
        expires_in: resp.expires_in,
        interval: resp.interval.unwrap_or(5),
        message: resp.message.unwrap_or_else(|| {
            "Enter the code on Microsoft's verification page to link your Minecraft account."
                .to_string()
        }),
    })
}

fn describe_xsts_error(xerr: u64) -> String {
    match xerr {
        2148916233 => "This Microsoft account does not have an Xbox profile yet. Sign in at xbox.com once to create one.".to_string(),
        2148916235 => "Xbox Live is not available in this account's country or region.".to_string(),
        2148916236 | 2148916237 => "Adult verification is required on this Microsoft account.".to_string(),
        2148916238 => "This is a child Microsoft account and must be added to a Microsoft Family group by an adult before signing in.".to_string(),
        other => format!("Xbox XSTS authorization failed (XErr {other})."),
    }
}

/// Polls the Microsoft token endpoint and completes the full official chain:
/// MSA OAuth -> Xbox Live -> XSTS -> Minecraft Services -> Entitlements -> Java Profile (username, UUID, skin).
pub async fn poll_microsoft_device_login(
    device_code: &str,
) -> Result<Option<PlayerProfile>, AuthError> {
    let (client_id, _) = resolve_msa_client_id()?;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let token_resp: MsaTokenResponse = http
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("client_id", client_id.as_str()),
            ("device_code", device_code),
        ])
        .send()
        .await?
        .json()
        .await?;

    if let Some(err) = token_resp.error {
        if err == "authorization_pending" || err == "slow_down" {
            return Ok(None);
        }
        if err == "authorization_declined" {
            return Err(AuthError::MicrosoftFlow(
                "Microsoft sign-in was cancelled by the user.".to_string(),
            ));
        }
        if err == "expired_token" {
            return Err(AuthError::MicrosoftFlow(
                "Microsoft sign-in timed out. Click Sign In to request a fresh code.".to_string(),
            ));
        }
        return Err(AuthError::MicrosoftFlow(
            token_resp.error_description.unwrap_or(err),
        ));
    }

    let msa_token = token_resp
        .access_token
        .ok_or_else(|| AuthError::MicrosoftFlow("missing MSA access token".to_string()))?;

    let profile = complete_xbox_and_minecraft_chain(
        &http,
        &msa_token,
        token_resp.refresh_token,
        token_resp.expires_in,
    )
    .await?;
    Ok(Some(profile))
}

fn base64url_no_pad(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((bytes.len() * 4).div_ceil(3));
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | (bytes[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = bytes.len() - i;
    if rem == 1 {
        let n = (bytes[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
    } else if rem == 2 {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
    }
    out
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn send_callback_html(stream: &mut std::net::TcpStream, status_line: &str, title: &str, body_msg: &str) {
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>7xAir Sign-In</title>         <style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b14;color:#f1f5f9;         font-family:Segoe UI,system-ui,sans-serif}}.card{{max-width:420px;padding:28px 32px;border-radius:16px;         background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);text-align:center;         box-shadow:0 24px 60px rgba(0,0,0,0.5)}}h1{{margin:0 0 10px;font-size:20px;color:#38bdf8}}         p{{margin:0;font-size:14px;line-height:1.5;color:#cbd5e1}}</style></head>         <body><div class=\"card\"><h1>{title}</h1><p>{body_msg}</p></div></body></html>"
    );
    let resp = format!(
        "HTTP/1.1 {status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn wait_for_oauth_callback(listener: TcpListener, expected_state: String) -> Result<String, AuthError> {
    listener.set_nonblocking(true)?;
    let start = Instant::now();
    let timeout = Duration::from_secs(180);

    while start.elapsed() < timeout {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                if n == 0 {
                    continue;
                }
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let target = first_line.split_whitespace().nth(1).unwrap_or("/");

                if !target.starts_with("/callback") {
                    let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                    continue;
                }

                let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut err: Option<String> = None;
                let mut err_desc: Option<String> = None;

                for pair in query.split('&') {
                    if let Some((k, v)) = pair.split_once('=') {
                        let dk = url_decode(k);
                        let dv = url_decode(v);
                        match dk.as_str() {
                            "code" => code = Some(dv),
                            "state" => state = Some(dv),
                            "error" => err = Some(dv),
                            "error_description" => err_desc = Some(dv),
                            _ => {}
                        }
                    }
                }

                if let Some(e) = err {
                    let msg = err_desc.unwrap_or_else(|| e.clone());
                    send_callback_html(
                        &mut stream,
                        "400 Bad Request",
                        "Sign-In Cancelled",
                        "Microsoft sign-in did not complete. You can close this tab and try again in 7xAir.",
                    );
                    return Err(AuthError::MicrosoftFlow(msg));
                }

                if state.as_deref() != Some(expected_state.as_str()) {
                    send_callback_html(
                        &mut stream,
                        "400 Bad Request",
                        "Invalid Session",
                        "Security state mismatch. Please close this tab and restart sign-in from 7xAir.",
                    );
                    return Err(AuthError::MicrosoftFlow(
                        "OAuth state mismatch during Microsoft browser sign-in.".to_string(),
                    ));
                }

                if let Some(auth_code) = code {
                    send_callback_html(
                        &mut stream,
                        "200 OK",
                        "Signed In to 7xAir",
                        "Authentication succeeded! You can close this browser tab and return to the 7xAir Launcher.",
                    );
                    return Ok(auth_code);
                }

                send_callback_html(
                    &mut stream,
                    "400 Bad Request",
                    "Missing Authorization Code",
                    "Microsoft did not return an authorization code. Please close this tab and retry in 7xAir.",
                );
                return Err(AuthError::MicrosoftFlow(
                    "Microsoft callback did not include an authorization code.".to_string(),
                ));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(60));
            }
            Err(e) => return Err(AuthError::Io(e)),
        }
    }

    Err(AuthError::MicrosoftFlow(
        "Microsoft browser sign-in timed out after 3 minutes. Please click Sign In again.".to_string(),
    ))
}

/// Interactive 1-click Microsoft OAuth 2.0 Authorization Code + PKCE flow with local loopback redirect.
/// Opens the official Microsoft account chooser directly in the user's browser — no code to copy or paste.
pub async fn sign_in_microsoft_browser() -> Result<PlayerProfile, AuthError> {
    let (client_id, _) = resolve_msa_client_id()?;

    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://localhost:{port}/callback");

    // RFC 7636 PKCE verifier (64 hex chars) + S256 challenge
    let code_verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let challenge_hash = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = base64url_no_pad(&challenge_hash);
    let state = Uuid::new_v4().simple().to_string();

    let auth_url = format!(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&response_mode=query&scope={}&prompt=select_account&state={}&code_challenge={}&code_challenge_method=S256",
        url_encode(&client_id),
        url_encode(&redirect_uri),
        url_encode("XboxLive.signin offline_access"),
        url_encode(&state),
        url_encode(&code_challenge),
    );

    open_verification_browser(&auth_url);

    let auth_code = tauri::async_runtime::spawn_blocking(move || {
        wait_for_oauth_callback(listener, state)
    })
    .await
    .map_err(|e| AuthError::MicrosoftFlow(format!("Callback listener failed: {e}")))??;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;

    let token_resp: MsaTokenResponse = http
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", auth_code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", code_verifier.as_str()),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await?
        .json()
        .await?;

    if let Some(err) = token_resp.error {
        return Err(AuthError::MicrosoftFlow(
            token_resp.error_description.unwrap_or(err),
        ));
    }

    let msa_token = token_resp
        .access_token
        .ok_or_else(|| AuthError::MicrosoftFlow("missing MSA access token".to_string()))?;

    complete_xbox_and_minecraft_chain(
        &http,
        &msa_token,
        token_resp.refresh_token,
        token_resp.expires_in,
    )
    .await
}

async fn complete_xbox_and_minecraft_chain(
    http: &reqwest::Client,
    msa_token: &str,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
) -> Result<PlayerProfile, AuthError> {
    // 2. Exchange MSA token -> Xbox Live token
    let xbl_json: serde_json::Value = http
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={msa_token}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let xbl_token = xbl_json["Token"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing Xbox Live token".to_string()))?;
    let user_hash = xbl_json["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing Xbox user hash".to_string()))?;

    // 3. Exchange Xbox Live -> XSTS token (with official Xbox XErr diagnostics)
    let xsts_resp = http
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await?;

    let xsts_status = xsts_resp.status();
    let xsts_json: serde_json::Value = xsts_resp.json().await?;
    if !xsts_status.is_success() {
        if let Some(xerr) = xsts_json["XErr"].as_u64() {
            return Err(AuthError::MicrosoftFlow(describe_xsts_error(xerr)));
        }
        return Err(AuthError::MicrosoftFlow(format!(
            "XSTS authentication failed (HTTP {}).",
            xsts_status.as_u16()
        )));
    }

    let xsts_token = xsts_json["Token"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing XSTS token".to_string()))?;

    // 4. Exchange XSTS -> Minecraft Services access token
    let mc_auth_json: serde_json::Value = http
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={user_hash};{xsts_token}")
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mc_token = mc_auth_json["access_token"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing Minecraft access token".to_string()))?;

    // 5. Verify Minecraft Java Edition ownership via official Minecraft Services entitlements endpoint
    let entitlements: serde_json::Value = http
        .get("https://api.minecraftservices.com/entitlements/mcstore")
        .bearer_auth(mc_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let owns_minecraft = entitlements["items"]
        .as_array()
        .map(|items| !items.is_empty())
        .unwrap_or(false);
    if !owns_minecraft {
        return Err(AuthError::MicrosoftFlow(
            "This Microsoft account does not own Minecraft: Java Edition.".to_string(),
        ));
    }

    // 6. Fetch Minecraft Java profile (username, UUID, and active skin URL)
    let mc_profile: serde_json::Value = http
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mc_uuid = mc_profile["id"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("account does not own Minecraft Java".to_string()))?
        .to_string();
    let mc_name = mc_profile["name"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing Minecraft username".to_string()))?
        .to_string();
    let skin_url = mc_profile["skins"]
        .as_array()
        .and_then(|skins| {
            skins
                .iter()
                .find(|s| s["state"].as_str() == Some("ACTIVE"))
                .or_else(|| skins.first())
                .and_then(|s| s["url"].as_str())
                .map(str::to_string)
        });

    Ok(PlayerProfile {
        id: Uuid::new_v4().to_string(),
        username: mc_name,
        uuid: mc_uuid,
        provider: AuthProvider::Microsoft,
        access_token: mc_token.to_string(),
        refresh_token,
        expires_at_epoch: expires_in.map(|s| now_epoch() + s),
        skin_url,
        created_at_epoch: now_epoch(),
    })
}
