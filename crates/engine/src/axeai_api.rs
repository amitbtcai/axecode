//! axecode: thin client for the Axe AI platform API (`https://axeai.com`).
//!
//! Sign-in (OAuth via the edge) proves identity; this module turns that proof
//! into the credential the platform API actually accepts — a native refresh
//! token (`axe_refresh_*`, minted by `POST /api/auth/native/from-oauth`). The
//! CLI (`axeai/packages/cli`) uses the same credential as its bearer for
//! `/v1`, so a stored native session doubles as the API key for models,
//! completions, media, and voice.
//!
//! Auth shape on the wire:
//!   POST {base}/api/auth/native/from-oauth   Authorization: Bearer <oauth jwt>
//!     → { refreshToken, refreshExpiresAt, user: { id } }
//!   POST {base}/api/auth/native/refresh      { refreshToken }
//!     → rotated { refreshToken, refreshExpiresAt } (old token dies — single-use)
//!   POST {base}/api/auth/native/revoke       { refreshToken }
//!   GET  {base}/v1/models                    Authorization: Bearer <refresh>
//!   GET  {base}/v1/account/models            idem
//!   POST {base}/api/voice/speech             { text, voice } → audio/mpeg

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// The persisted native credential. Lives inside `StoredSession` (session.json,
/// 0600) — never in Loro docs, never in logs/MCP output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSession {
    pub refresh_token: String,
    pub refresh_expires_at: String,
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSessionBody {
    refresh_token: String,
    refresh_expires_at: String,
    user: NativeSessionUser,
}

#[derive(Debug, Deserialize)]
struct NativeSessionUser {
    id: String,
}

#[derive(Debug)]
pub enum AxeAiError {
    Http(reqwest::Error),
    /// Endpoint reachable but rejected us (401 mint, expired token…).
    Status(u16, String),
    /// Endpoint missing entirely — e.g. `from-oauth` not yet deployed.
    Unavailable(String),
}

impl std::fmt::Display for AxeAiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AxeAiError::Http(e) => write!(f, "http: {e}"),
            AxeAiError::Status(code, body) => write!(f, "status {code}: {body}"),
            AxeAiError::Unavailable(msg) => write!(f, "unavailable: {msg}"),
        }
    }
}

impl std::error::Error for AxeAiError {}

#[derive(Clone)]
pub struct AxeAiApi {
    http: reqwest::Client,
    /// API origin, e.g. `https://axeai.com` (no trailing slash).
    base: String,
}

impl AxeAiApi {
    pub fn new(base: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
        }
    }

    /// OAuth access token (resource `https://edge.axeai.com`) → desktop native
    /// refresh token. Called once per sign-in; the result is persisted.
    pub async fn mint_native_session(
        &self,
        oauth_access_token: &str,
    ) -> Result<NativeSession, AxeAiError> {
        let response = self
            .http
            .post(format!("{}/api/auth/native/from-oauth", self.base))
            .bearer_auth(oauth_access_token)
            .send()
            .await
            .map_err(AxeAiError::Http)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(AxeAiError::Unavailable(
                "from-oauth endpoint not deployed".into(),
            ));
        }
        self.session_body(response).await
    }

    /// Rotate a native refresh token. The returned token REPLACES the input —
    /// the old one is dead on a successful call.
    pub async fn refresh_native_session(
        &self,
        refresh_token: &str,
    ) -> Result<Option<NativeSession>, AxeAiError> {
        let response = self
            .http
            .post(format!("{}/api/auth/native/refresh", self.base))
            .json(&serde_json::json!({ "refreshToken": refresh_token }))
            .send()
            .await
            .map_err(AxeAiError::Http)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Ok(None);
        }
        self.session_body(response).await.map(Some)
    }

    /// Best-effort revocation on sign-out. Never fails the caller.
    pub async fn revoke_native_session(&self, refresh_token: &str) {
        let _ = self
            .http
            .post(format!("{}/api/auth/native/revoke", self.base))
            .json(&serde_json::json!({ "refreshToken": refresh_token }))
            .send()
            .await;
    }

    /// `GET /v1/models` — also the cheapest connectivity/auth probe.
    pub async fn models(&self, bearer: &str) -> Result<serde_json::Value, AxeAiError> {
        self.get_json("/v1/models", bearer).await
    }

    /// `GET /v1/account/usage` — credits/usage for the account surfaces.
    pub async fn account_usage(&self, bearer: &str) -> Result<serde_json::Value, AxeAiError> {
        self.get_json("/v1/account/usage", bearer).await
    }

    /// `POST /api/voice/speech` `{text, voice}` → mp3 bytes (Kokoro TTS).
    pub async fn speech(
        &self,
        bearer: &str,
        text: &str,
        voice: &str,
    ) -> Result<Vec<u8>, AxeAiError> {
        let response = self
            .http
            .post(format!("{}/api/voice/speech", self.base))
            .bearer_auth(bearer)
            .json(&serde_json::json!({ "text": text, "voice": voice }))
            .send()
            .await
            .map_err(AxeAiError::Http)?;
        if !response.status().is_success() {
            return Err(AxeAiError::Status(
                response.status().as_u16(),
                response.text().await.unwrap_or_default(),
            ));
        }
        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(AxeAiError::Http)
    }

    /// Authenticated pass-through for the RPC surface. `path` must match the
    /// allowlist — the engine credential never proxies arbitrary upstreams.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        bearer: &str,
        body: Option<serde_json::Value>,
    ) -> Result<(u16, serde_json::Value), AxeAiError> {
        // Trading and wallet are web-only products — the agent surface is
        // inference, media, voice, and the session routes.
        const ALLOWED_PREFIXES: &[&str] = &["/v1/", "/api/voice/", "/api/auth/native/"];
        if !ALLOWED_PREFIXES.iter().any(|p| path.starts_with(p)) {
            return Err(AxeAiError::Status(
                400,
                format!("path {path} is not an allowlisted Axe AI API route"),
            ));
        }
        let builder = match method.to_ascii_uppercase().as_str() {
            "GET" => self.http.get(format!("{}{}", self.base, path)),
            "POST" => self.http.post(format!("{}{}", self.base, path)),
            "DELETE" => self.http.delete(format!("{}{}", self.base, path)),
            other => {
                return Err(AxeAiError::Status(400, format!("unsupported method {other}")))
            }
        };
        let builder = builder.bearer_auth(bearer);
        let builder = if let Some(body) = body {
            builder.json(&body)
        } else {
            builder
        };
        let response = builder.send().await.map_err(AxeAiError::Http)?;
        let status = response.status().as_u16();
        let body = response.json().await.unwrap_or(serde_json::Value::Null);
        Ok((status, body))
    }

    async fn get_json(&self, path: &str, bearer: &str) -> Result<serde_json::Value, AxeAiError> {
        let response = self
            .http
            .get(format!("{}{}", self.base, path))
            .bearer_auth(bearer)
            .send()
            .await
            .map_err(AxeAiError::Http)?;
        if !response.status().is_success() {
            return Err(AxeAiError::Status(
                response.status().as_u16(),
                response.text().await.unwrap_or_default(),
            ));
        }
        response.json().await.map_err(AxeAiError::Http)
    }

    async fn session_body(
        &self,
        response: reqwest::Response,
    ) -> Result<NativeSession, AxeAiError> {
        if !response.status().is_success() {
            return Err(AxeAiError::Status(
                response.status().as_u16(),
                response.text().await.unwrap_or_default(),
            ));
        }
        let body: NativeSessionBody = response.json().await.map_err(AxeAiError::Http)?;
        Ok(NativeSession {
            refresh_token: body.refresh_token,
            refresh_expires_at: body.refresh_expires_at,
            user_id: body.user.id,
        })
    }
}
