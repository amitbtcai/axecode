# Axe AI auth migration plan (WorkOS → axeai.com Better Auth)

> Design goal ordering: **1. upstream-merge safety first** — axecode tracks
> `zeronsh/zeron` closely (~5 commits ahead) and merges constantly, so every
> change must be an additive seam that upstream churn cannot collide with.
> **2. One account** — Axe Code sign-in IS the axeai.com account (Better Auth),
> unlocking sync + credits + future web remote under a single identity.

## Merge-safety rules

- **Add files, don't rewrite them.** axeai-specific code lives in new modules
  (`edge/src/axeai-oauth.ts`, `crates/engine/src/auth_axeai.rs`). Upstream-owned
  files get at most a small branch at a marked seam (`// axecode:` comment).
- **Provider selection is configuration, not deletion.** A new auth mode
  `AXECODE_AUTH_PROVIDER=axeai` sits beside `workos`/`dev`; upstream's WorkOS
  code path stays intact and compiles.
- **Keep wire shapes.** `AuthState` variants (`SignedOut`/`NeedsOrganization`/
  `SignedIn`), the `ListOrgs`/`CreateOrg`/`SelectOrg` RPCs, and the OrgGate UI
  phase all remain in the tree — upstream may still emit them. In axeai mode
  they are satisfied mechanically (auto-selected personal workspace) so the
  OrgGate never renders. Zero `crates/ui` changes.
- **Exploit existing seams.** `edge/src/auth.ts` already verifies any issuer +
  JWKS URL via `WORKOS_ISSUER`/`WORKOS_JWKS_URL` overrides — pointing it at
  axeai is env config, not code.
- Env vars are additive: `AXECODE_*` names added alongside, `WORKOS_*`
  untouched.

## Identity model

Better Auth 1.7.5 on axeai.com already runs `jwt()` + `oauthProvider()`
(`src/lib/auth.ts`); the `auth_oauth_*` tables are migrated
(`drizzle/0060_auth_oauth_provider.sql`). Verified against the installed
packages (not docs):

- **Access tokens are opaque by default — request a `resource` to get JWTs.**
  In the provider, `isJwtAccessToken = audienceClaim && !disableJwtPlugin`:
  an authorize/token request carrying an RFC 8707 `resource` indicator mints a
  signed JWT (`aud` = the resource); without one, the token is opaque and only
  usable via `/oauth2/introspect` (rate-limited ~100/60s — wrong for per-request
  verification). **The edge must be registered as a resource** (an
  `auth_oauth_resource` row, e.g. `https://edge.axeai.com`) and axecode's
  authorize request must include `resource=https://edge.axeai.com` so room
  dials carry self-verifying JWTs.
- JWT signing: `EdDSA` default, keys served at `/jwks` (default auth base path
  → `https://axeai.com/api/auth/jwks`), 30-day grace on rotated keys — the
  edge's stale-if-error JWKS cache gets rotation overlap for free.
- Session JWTs (the `jwt()` plugin's own `/token`): `iss`/`aud` default to the
  baseURL origin (`https://axeai.com`), `exp` default `15m` — relevant only if
  a non-OAuth path ever wants session JWTs; the OAuth JWTs take their own
  audience.
- Refresh tokens stay opaque (`offline_access` scope) — fine, refresh only
  ever calls `/oauth2/token` server-side. Rotation verified live.
- `/oauth2/revoke` exists — clean logout hook.
- `/oauth2/register` (RFC 7591 dynamic registration) is DISABLED on prod
  (`access_denied: Client registration is disabled`); the admin path is
  `auth.api.adminCreateOAuthClient` (SERVER_ONLY). Prod rows were inserted
  directly into `auth_oauth_client` / `auth_oauth_resource` /
  `auth_oauth_client_resource` — see "Registered client" below.
- A device-code grant (`urn:ietf:params:oauth:grant-type:device_code`) is in
  the plugin — optional nicer headless login than paste-code; defer.
- Access-token TTL: `oauthProvider({ accessTokenExpiresIn })` is GLOBAL
  (default 3600); a resource row's `access_token_ttl` can only shorten it
  (`min(scopeExp, resourceExp)`). For 24h device tokens set
  `accessTokenExpiresIn: 86400` in the plugin options — resource TTL alone
  cannot lengthen it.
- `enforcePerClientResources` defaults to `true`: the client MUST be linked
  via `auth_oauth_client_resource` (join on client_id + resource identifier
  business keys) or authorize fails `invalid_target`.
- Loopback wildcard ports work (RFC 8252): `stripLoopbackRedirectPort` lets
  registered `http://127.0.0.1/callback` match `http://127.0.0.1:<any>/callback`.
  Native clients may use http loopback URIs; `application_type: "native"`.
- Consent: no `/oauth/consent` route exists in the axeai app — it falls back
  to the home page. The `axecode` client has `skip_consent = true`, which is
  the right UX for a first-party app regardless.

### Live-verified on prod (2026-10-07)

Full flow executed against https://axeai.com: authorize (PKCE + resource) →
code → `/oauth2/token` → **JWT access token** (`typ: at+jwt`, `alg: EdDSA`,
`kid` = live JWKS key) + opaque rotating refresh token + `id_token`.

Verified access-token claims:
`iss: "https://axeai.com/api/auth"` (note: includes the `/api/auth` path —
the edge must pin this exact value, not the bare origin),
`aud: ["https://edge.axeai.com", "https://axeai.com/api/auth/oauth2/userinfo"]`,
`sub` = user id, `client_id`/`azp: "axecode"`, `scope`, `sid`, `jti`,
`iat`/`exp` (3600s, pending the `accessTokenExpiresIn` bump).

Signature verification with `jose.createRemoteJWKSet(jwks) + jwtVerify({
issuer, audience })` — the exact `edge/src/auth.ts` check — passes against the
live JWKS. Refresh grant returns a fresh rotated `refresh_token`.

State param round-trips; authorize response carries `iss` (RFC 9207).

- `POST /oauth2/authorize` — code flow; login page `/login`, consent
  `/oauth/consent` (configured; see skip_consent note).
- `POST /oauth2/token` — `authorization_code`, `refresh_token`,
  `client_credentials`; PKCE `S256` is first-class.
- `GET /oauth2/userinfo` — replaces the user fields in WorkOS's exchange
  response.
- `/oauth2/introspect` exists as a fallback verification path but is
  rate-limited (~100/60s default) — do not use it per-request; the resource
  JWT path above is the design.

`axecode` is a public client (PKCE, no secret). Redirect URIs: loopback
`http://127.0.0.1:*/callback` (headed) and `https://edge.axeai.com/auth/cli/callback`
(headless paste-code — the existing page is provider-agnostic and stays).
The authorize request carries `scope=openid offline_access` **and**
`resource=https://edge.axeai.com` (the registered resource — this is what makes
access tokens JWTs).

**Workspace mapping.** WorkOS `org_id` gates room authZ and scopes room names
(`reg1/{orgId}/{userId}`, `/registry/{orgId}/ws`). Under axeai mode the org
segment is a constant (`"personal"`) and every room remains per-user by the
`{userId}` segment; authZ reduces to `userId == sub`. Teams/orgs later =
Better Auth `organization` plugin — additive claim, not an architecture change.

## Changes by layer

### axeai repo (provider side)

Registered on prod (2026-10-07, direct DB insert — dynamic registration is
disabled; rows live in `auth_oauth_client`, `auth_oauth_resource`,
`auth_oauth_client_resource`):

- client `axecode`: `public`, `require_pkce`, `application_type: "native"`,
  `skip_consent`, `token_endpoint_auth_method: "none"`, grants
  `[authorization_code, refresh_token]`, scopes
  `[openid, profile, email, offline_access]`, redirect URIs
  `https://edge.axeai.com/auth/cli/callback`, `http://127.0.0.1/callback`
  (wildcard port), `http://localhost/callback` (wildcard port).
- resource `https://edge.axeai.com` ("Axe Code Edge"), linked to the client.

Remaining code/config changes:

1. `src/lib/auth.ts` — `oauthProvider({ ...existing,
   accessTokenExpiresIn: 86400 })` for 24h device tokens (global knob; see
   TTL note above). Optionally also declare `resources` +
   `trustedClients`/`cachedTrustedClients: new Set(["axecode"])` so the
   rows are code-declared rather than DB-only.
2. Brand the consent screen for "Axe Code" — optional while
   `skip_consent` is on; needed only if a third-party client ever appears.
3. Add `/api/auth/jwks` + a token-endpoint probe to
   `scripts/synthetic-checks.mts`.
4. Keep `docs/PLATFORM.md` / `docs/axeai-codebase-map.html` in sync per
   AGENTS.md once the plugin options land.

### edge (`edge/src/`)

1. `env.ts` — additive: `AXEAI_ISSUER`, `AXEAI_JWKS_URL`, `AXEAI_TOKEN_URL`,
   `AXEAI_USERINFO_URL`, `AXEAI_CLIENT_ID`. `AUTH_MODE` gains `"axeai"`;
   `"dev"`/`"workos"` untouched.
2. `auth.ts` — in `verifyToken`, axeai mode resolves issuer/JWKS from the new
   env (or reuse the existing `WORKOS_*` override slots zero-diff). `Verified`
   keeps `{userId, sessionId?}`; `orgId` returns the constant.
3. New `axeai-oauth.ts` (~80 lines): `exchange` and `refresh` as form POSTs to
   `/oauth2/token` (adds `code_verifier` + `redirect_uri` passthrough), plus
   `userinfo` for the user shape — same exported signatures as `workos.ts` so
   `auth-routes.ts` swaps one import under a mode check.
4. `auth-routes.ts` — `/auth/exchange` and `/auth/refresh` dispatch to the
   module matching `AUTH_MODE` (small branch at the top of each handler).
   `/auth/orgs` returns a single synthetic workspace in axeai mode (keeps the
   UI's parser satisfied). `/auth/cli/callback` unchanged.
5. Room authZ (`registry-room.ts`, `registry-core.ts`, `device-room.ts`):
   org segment accepts the constant; the per-user segment is the boundary.
   Minimal hunks at claim-comparison sites only.

### engine (`crates/engine/`)

1. New `auth_axeai.rs`: authorize-URL builder
   (`{issuer}/api/auth/oauth2/authorize?response_type=code&client_id=axecode&
   redirect_uri=…&scope=openid offline_access&state=…&code_challenge=…&
   code_challenge_method=S256`), PKCE verifier generation, and the
   auto-select-personal-workspace step. Shares the existing loopback server,
   paste-code flow, dual-clock token cache, refresh retry loop — those
   internals do not change.
2. `auth.rs` — seam only: provider switch at flow entry (axeai vs workos vs
   dev), `code_verifier` threaded into the `/auth/exchange` body, and in axeai
   mode `NeedsOrganization` is produced and resolved internally without
   surfacing the gate.
3. `session.json` format unchanged (refresh token, 0600).

### binary / client / mobile / iOS

- `apps/zeron/src/main.rs`: add `DEFAULT_AXEAI_CLIENT_ID` and provider env
  resolution next to the existing constants; the WorkOS constant stays.
- `crates/client`, `crates/mobile`, `apps/ios`: no changes required — they
  consume engine auth RPCs and the hosted authorize URL.

## What is deliberately NOT removed

OrgGate (`crates/ui/src/shell.rs`), `OrgRow`/membership helpers in
`state.rs`, the org RPC constants, `workos.ts`, and every `NeedsOrganization`
code path. Deleting upstream-owned code is what creates merge conflicts;
satisfying it mechanically in axeai mode is what keeps `git merge upstream/main`
boring.

## Rollout (greenfield — nothing deployed, no synced users)

1. axeai: client registration + claim verification → deploy.
2. edge: axeai mode → `wrangler deploy` to `edge.axeai.com`.
3. axecode: provider envs + default client id → release.
4. `scripts/e2e-smoke.sh` against the real stack: two engines, one edge, one
   axeai session — B queues into A's chat, transcript + status sync back.
5. iOS live-stack test with an axeai bearer.

## Outage posture (IdP dependency)

Self-verifying JWTs (edge verifies via cached JWKS — axeai not on the request
path), 24h access tokens + 30d rotating refresh (engine already retries
refresh at a 5s cap forever), JWKS stale-if-error at the edge, honest "sync
paused" state in the sidebar, synthetic monitoring on the auth endpoints.
Local-only mode is the designed degraded state: agents keep running, docs keep
writing, commands queue.

## Implementation status (2026-10-07)

All four layers landed, additive-only:

- **axeai** `src/lib/auth.ts`: `oauthProvider` gained
  `accessTokenExpiresIn: 86400` + `resources: [{ identifier:
  "https://edge.axeai.com" }]` (two options, nothing else touched).
  `cachedTrustedClients` left empty — it throws on re-registration and
  `skip_consent` on the client row already covers first-party UX.
- **edge**: new `axeai-oauth.ts` (exchange/refresh/orgs); `env.ts` gained
  `AXEAI_ISSUER`/`AXEAI_AUDIENCE`/`AXEAI_CLIENT_ID`; `auth.ts` gained a small
  issuer/audience seam; `auth-routes.ts` dispatches on `AUTH_MODE`; `index.ts`
  health reports the mode; `wrangler.jsonc` sets `AUTH_MODE: "axeai"` + the
  three envs (WorkOS envs untouched).
- **engine**: new `auth_axeai.rs` (PKCE S256, authorize URL incl.
  `resource=https://edge.axeai.com`, `AXEAI_PERSONAL_ORG = "personal"`);
  `auth.rs` gained provider/pending-verifier seams only; `lib.rs` registers the
  module and reads `AXECODE_AUTH_PROVIDER` (default `axeai`) /
  `AXECODE_AXEAI_ISSUER`.
- **binary**: `apps/zeron/src/main.rs` gained `DEFAULT_AXEAI_CLIENT_ID =
  "axecode"` + provider-aware client-id selection; WorkOS stays reachable via
  `AXECODE_AUTH_PROVIDER=workos`.

Verified: edge `tsc --noEmit` clean; axeai `tsc --noEmit` clean;
`cargo check -p zeron-engine` and `-p zeron` pass; live prod OAuth flow
(PKCE → code → JWT → JWKS verify → rotated refresh) end-to-end.

**Toolchain caveat (pre-existing, not this change):** the workspace does not
compile on local stable 1.99.0 or beta 1.100 — `rtc-mdns 0.20.5` uses unstable
`Ipv4Addr::from_octets` (`ip_from`) and upstream `crates/harness` +
`crates/engine/agent_accounts` use unstable `File::try_lock` (`file_lock`).
`rust-toolchain.toml` says `stable`; upstream CI runs `rustup update stable`,
so it presumably needs a rustc where both have stabilized — likely red today.
Verification used temporary local shims (patched `rtc-mdns` via
`[patch.crates-io]`, stubbed the two `try_lock` sites) — reverted after check;
no workaround is committed.

Remaining: deploy edge (`wrangler deploy`), deploy axeai auth.ts change,
then `scripts/e2e-smoke.sh` + a real sign-in smoke test.

## Open questions

All resolved by live verification (see "Live-verified on prod"):

- Loopback wildcard ports: **supported** (`stripLoopbackRedirectPort`).
- TTL knobs: `accessTokenExpiresIn` is global (default 3600);
  `refreshTokenExpiresIn` likewise — resource rows can only shorten.
  `aud` = `[resource, userinfo]` array; `iss` = `https://axeai.com/api/auth`
  (includes `/api/auth` path — pin exactly).
- Dynamic registration: disabled on prod; admin path is SERVER_ONLY —
  direct DB insert used.
- Consent page: `/oauth/consent` route doesn't exist in the app; client has
  `skip_consent = true` (correct for first-party).
