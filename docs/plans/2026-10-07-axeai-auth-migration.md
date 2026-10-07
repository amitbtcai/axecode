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
(`drizzle/0060_auth_oauth_provider.sql`). Verified endpoints under the auth
base path (`/api/auth/oauth2/*`):

- `POST /oauth2/authorize` — code flow; login page `/login`, consent
  `/oauth/consent` (already configured).
- `POST /oauth2/token` — `authorization_code`, `refresh_token`,
  `client_credentials`; PKCE `S256` is first-class.
- `GET /oauth2/userinfo` — replaces the user fields in WorkOS's exchange
  response.
- `POST /oauth2/revoke`, `/oauth2/introspect`, `/oauth2/register` (RFC 7591
  dynamic registration) — available; revocation is a clean logout hook.
- Device-code grant (`urn:ietf:params:oauth:grant-type:device_code`) exists in
  the plugin — optional nicer headless login than paste-code; defer.

`axecode` is a public client (PKCE, no secret). Redirect URIs: loopback
`http://127.0.0.1:*/callback` (headed) and `https://edge.axeai.com/auth/cli/callback`
(headless paste-code — the existing page is provider-agnostic and stays).

**Workspace mapping.** WorkOS `org_id` gates room authZ and scopes room names
(`reg1/{orgId}/{userId}`, `/registry/{orgId}/ws`). Under axeai mode the org
segment is a constant (`"personal"`) and every room remains per-user by the
`{userId}` segment; authZ reduces to `userId == sub`. Teams/orgs later =
Better Auth `organization` plugin — additive claim, not an architecture change.

## Changes by layer

### axeai repo (provider side)

1. Register the `axecode` OAuth client (`auth_oauth_client` row or
   `/oauth2/register`): public client, `grant_types =
   [authorization_code, refresh_token]`, PKCE required, the two redirect URIs,
   access-token TTL ~24h for device clients (outage tolerance), rotating
   refresh tokens ~30d.
2. Pin down token claims: `iss` = `BETTER_AUTH_URL`, `sub` = user id; check
   whether `jwt` plugin `definePayload` is needed for a workspace claim (v1:
   not needed — constant org segment).
3. Brand the consent screen for "Axe Code".
4. Add `/api/auth/jwks` + a token-endpoint probe to `scripts/synthetic-checks.mts`.

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

## Open questions

- Better Auth 1.7.5 token TTL knobs and `aud` claim contents — verify against
  the installed plugin before registration.
- Loopback redirect-URI wildcard port support in the registered client record.
- Whether `/oauth2/register` is usable for self-hosted edges later (nice-to-
  have, not v1).
