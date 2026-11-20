use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use uuid::Uuid;

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
    #[error("Microsoft login requires SEVENXAIR_MSA_CLIENT_ID environment variable to be configured")]
    MissingMsaClientId,
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

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
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

/// Starts the optional Microsoft OAuth 2.0 Device Code flow (Azure App Registration client ID via env).
pub async fn begin_microsoft_device_login() -> Result<MicrosoftDeviceCodeSession, AuthError> {
    let client_id = std::env::var("SEVENXAIR_MSA_CLIENT_ID")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or(AuthError::MissingMsaClientId)?;

    let http = reqwest::Client::builder()
        .user_agent("7xAir-Launcher/0.1.0")
        .build()?;
    let resp: MsaDeviceCodeResponse = http
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

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

/// Polls the Microsoft token endpoint and exchanges MSA -> Xbox Live -> XSTS -> Minecraft token.
pub async fn poll_microsoft_device_login(
    device_code: &str,
) -> Result<Option<PlayerProfile>, AuthError> {
    let client_id = std::env::var("SEVENXAIR_MSA_CLIENT_ID")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or(AuthError::MissingMsaClientId)?;

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
        return Err(AuthError::MicrosoftFlow(
            token_resp.error_description.unwrap_or(err),
        ));
    }

    let msa_token = token_resp
        .access_token
        .ok_or_else(|| AuthError::MicrosoftFlow("missing MSA access token".to_string()))?;

    // Exchange MSA token -> Xbox Live token
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

    // Exchange Xbox Live -> XSTS token
    let xsts_json: serde_json::Value = http
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
        .await?
        .error_for_status()?
        .json()
        .await?;

    let xsts_token = xsts_json["Token"]
        .as_str()
        .ok_or_else(|| AuthError::MicrosoftFlow("missing XSTS token".to_string()))?;

    // Exchange XSTS -> Minecraft Services access token
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

    // Fetch Minecraft profile (username + UUID)
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

    Ok(Some(PlayerProfile {
        id: Uuid::new_v4().to_string(),
        username: mc_name,
        uuid: mc_uuid,
        provider: AuthProvider::Microsoft,
        access_token: mc_token.to_string(),
        refresh_token: token_resp.refresh_token,
        expires_at_epoch: token_resp.expires_in.map(|s| now_epoch() + s),
        created_at_epoch: now_epoch(),
    }))
}
