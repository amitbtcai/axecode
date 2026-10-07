//! axecode-only: Axe AI (Better Auth `oauthProvider`) specifics, kept out of
//! the upstream-owned WorkOS flow so upstream merges stay mechanical.
//!
//! The device is an OAuth public client: `authorize_url` starts the
//! authorization-code + PKCE flow; the edge's `/auth/exchange` forwards the
//! verifier to `{issuer}/oauth2/token`. Requesting the RFC 8707 `resource`
//! (this deployment's edge URL) is what makes the provider mint JWT access
//! tokens (`aud` = resource) instead of opaque ones — the edge verifies them
//! against the JWKS locally.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};

use crate::auth::url_encode;

/// The synthetic org segment stamped everywhere WorkOS used `org_id`. Axe AI
/// sessions have no orgs; the constant keeps room paths (`reg1/{org}/{user}`)
/// and the `{data_dir}/orgs/{org}/{user}` storage layout identical to the
/// WorkOS path, so the diff stays this small.
pub const PERSONAL_ORG_ID: &str = "personal";

/// RFC 7636 PKCE pair: `(verifier, S256 challenge)`, both base64url strings.
pub fn pkce_pair() -> (String, String) {
    // 32 random bytes → a 43-char verifier (the RFC minimum).
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// The Better Auth authorize URL for the public `axecode` client.
/// `resource` is the registered OAuth resource (the edge's own URL) that puts
/// the edge audience into the minted access token.
pub fn authorize_url(
    issuer: &str,
    client_id: &str,
    redirect_uri: &str,
    resource: &str,
    state: &str,
    challenge: &str,
) -> String {
    format!(
        "{}/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=openid%20profile%20email%20offline_access&state={}&code_challenge={}&code_challenge_method=S256&resource={}",
        issuer.trim_end_matches('/'),
        url_encode(client_id),
        url_encode(redirect_uri),
        url_encode(state),
        url_encode(challenge),
        url_encode(resource),
    )
}
