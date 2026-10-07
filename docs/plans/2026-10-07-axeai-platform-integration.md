# Axe AI platform integration into Axe Code

> Follows the same ordering as `2026-10-07-axeai-auth-migration.md`:
> **1. upstream-merge safety** — additive seams only, `// axecode:` markers,
> new modules over edits. **2. One account** — the axeai.com sign-in is the
> single identity for sync, inference, credits, generation, and trade intents.
>
> Design principle: **the app absorbs axeai.com's capabilities, not its UI.**
> Nothing from the web frontend is ported; every feature lands as an engine
> capability, an MCP tool, or a small additive UI surface that already has a
> home (sidebar footer, accounts page, usage ring).

## 0. State of play (verified 2026-10-07)

Already exists, engine-side:

- `crates/engine/src/auth.rs` — axeai OAuth (PKCE + `resource=https://edge.axeai.com`)
  driving `SignIn` (loopback) and `SignInHeadless` (paste-code) RPCs.
- `crates/engine/src/agent_accounts.rs` — provider/account model with
  usage windows, sign-in providers, account switching. The slot for an
  axeai account type exists by design.
- `crates/mcp/src/tools.rs` — MCP server tools (`list_chats`, `create_chat`,
  `read_chat`, `send_message`, `send_messages`, `wait_for_turn`,
  `respond_to_input`). This is the extension point for generation tools.
- `crates/ui/src/account_usage.rs` + `settings/accounts.rs` — usage ring and
  accounts UI; an axeai account with credit balance fits the existing shapes.
- Sidebar/footer gating analysis (from the Sidebar UX thread): Local scope
  shows `render_sidebar_footer` with an "Enable sync" row; `start_sign_in`
  already opens the authorize URL; `SIGN_IN_HEADLESS` returns a portable URL
  and `COMPLETE_SIGN_IN` accepts the pasted code.

Already exists, platform-side (axeai repo):

- `POST /api/auth/native/exchange|refresh|revoke` — native tokens
  (`axe_refresh_*`, `axe_live_*`); `/v1/*` accepts them as Bearer.
- `/v1/models`, `/v1/account/models`, `/v1/account/usage`,
  `/v1/chat/completions`, `/v1/images/generations`,
  `/v1/videos/generations` + `/v1/videos/jobs/:id`.
- `/trade` — full trading surface: injected wallets (MetaMask/OKX/Phantom…),
  Privy embedded wallet, WalletConnect; swaps/bridges/limit orders;
  routes `/trade`, `/trade/<chain>/<address>`, `/trade/tempo`.
- `packages/cli` — hardened reference client for every endpoint above
  (auth, rotation, models, media, video polling). **Copy its request shapes
  and error mapping; they are tested.**

## 1. Single sign-in — one login unlocks everything

Today `start_sign_in` mints an edge JWT for sync. Extend the same flow so
completion also provisions an **agent token** for `/v1`:

- Engine: on `CompleteSignIn`/loopback completion, call
  `POST /api/auth/native/exchange` (or a dedicated `mint_agent_token` route)
  and store the `axe_refresh_*`/`axe_live_*` token in the session store
  alongside the sync credential — never in the Loro doc.
- New module: `crates/engine/src/auth_axeai_tokens.rs` (additive). Handles
  storage, expiry, and rotation via `/api/auth/native/refresh` (port the
  CLI's `http.mjs` rotation logic — rotate within 14d of `expiresAt`,
  `refresh_token` grant).
- RPC surface: reuse `AuthState`; add `AXEAI_ACCOUNT_STATUS` (or extend the
  existing accounts snapshot) reporting `{ connected, hasAgentToken,
  creditsCents, expiresAt }`.
- UI: `render_sidebar_footer` — signed-out shows a real **Connect to AxeAI**
  button (promotes the existing "Enable sync" row); signed-in shows the
  account pill plus credits. Include the copy-link affordance: button calls
  `SIGN_IN_HEADLESS`, URL lands on clipboard with a paste field wired to
  `COMPLETE_SIGN_IN` (works cross-device, unlike the loopback URL).
  Full UX mapping already written in the "AxeAI Connection Sidebar UX"
  thread — reuse it.

## 2. First-party `axe` harness — bundled inference, zero install

Goal: download → sign in → agent works. No Node, no external CLI.

- `crates/harness/src/axe_ai.rs` — a harness adapter speaking
  OpenAI-compatible chat completions to `https://axeai.com/v1` with the
  stored agent token. Streams deltas, maps tool calls, reports usage.
- Model catalog: `GET /v1/models` (modality=text) cached in the engine;
  picker reuses the existing model-picker surface.
- v1 fallback if a native adapter is too large for the milestone: bundle
  the pinned `opencode` binary and inject config exactly like
  `packages/cli/src/agent.mjs` does (isolated XDG dirs,
  `OPENCODE_CONFIG_CONTENT`, `AXEAI_AGENT_TOKEN` env indirection,
  `OPENCODE_DISABLE_AUTOUPDATE`). Still zero-install because we ship the
  binary in the app bundle — but the native adapter is the destination.
- Credits surface: `GET /v1/account/usage` feeds the composer usage ring
  (`account_usage.rs` `used_fraction` shape — express credits as a window).

## 3. Generation tools — agents that can make things

Extend `crates/mcp/src/tools.rs` with a new `axeai_*` tool group. These are
callable by any harness mid-task, billed to the user's credits:

| Tool | Endpoint | Returns |
|---|---|---|
| `axeai_generate_image` | `POST /v1/images/generations` | saved file path + dims; attach to thread |
| `axeai_generate_video` | `POST /v1/videos/generations` | job id |
| `axeai_video_status` | `GET /v1/videos/jobs/:id` | status; `ready` → download URL |
| `axeai_list_models` | `GET /v1/models` | catalog by modality |
| `axeai_credits` | `GET /v1/account/usage` | balance snapshot |

Implementation notes:

- Tools resolve the stored agent token; absent → structured error
  `{"error":"not_connected","hint":"Connect AxeAI in the sidebar"}` so the
  agent can ask the user instead of dying.
- `generate_image`/`video` write to the project dir (or a configured
  `media/` dir), never into the repo unprompted; return paths so the agent
  can reference them in code.
- Video is async — return the job id immediately; the agent polls with
  `axeai_video_status` (mirrors `axe video --wait`).
- Generation results could attach to AxeAI Studio projects server-side
  later (v2) — keep the response shape open (`project_id` field reserved).

## 4. Trade intents — IDE proposes, wallet disposes

**Hard boundary: no keys, no signing, no custody in the IDE.** The wallet
lives in the browser session on `axeai.com/trade` (injected/Privy/
WalletConnect). Axe Code sends *trade instructions*; the web renders them
for explicit user confirmation. The agent proposes, the human signs.

### Flow

1. Agent calls MCP tool `axeai_propose_trade` with a structured intent:
   `{ kind: "swap"|"bridge"|"limit", chain, fromToken, fromAmount,
   toToken, toChain?, slippageBps?, limitPrice?, reason? }`.
2. Engine → `POST /api/trade-intents` (agent-token auth) → axeai stores a
   **pending intent** row: `{ id, userId, params(jsonb), status: pending,
   createdAt, expiresAt (15m), source: "axecode", agentChatId? }`.
   Returns `{ intentId, url: "https://axeai.com/trade?intent=<id>" }`.
3. IDE renders an inline "Trade proposal" card in the thread (symbol pair,
   amounts, chain badge, reason) with **Review on axeai.com** →
   `cx.open_url(url)` and a **Copy link** affordance.
4. Web: `/trade` sees `?intent=<id>`, fetches `GET /api/trade-intents/<id>`
   (session-auth), renders a confirmation sheet — prefilled swap/bridge/
   limit form. **The URL carries only the opaque id; params are
   server-side, so links are unforgeable and unfuzzable.**
5. User confirms → the existing wallet flow signs + broadcasts. Status is
   written back: `pending → confirming → submitted(txHash) →
   confirmed|failed(reason)`. Expired intents die `expired`.
6. The IDE polls `GET /api/trade-intents/<id>` (or receives it via edge
   sync later) and posts the outcome into the agent thread — the agent can
   react ("fill confirmed, tx 0x…").

### Backend (axeai repo, new)

- `drizzle/…_trade_intents.sql` — table above; indexed `(userId, status)`.
- `src/api/routes/trade-intents.ts` —
  `POST /api/trade-intents` (agent token, creates),
  `GET /api/trade-intents/:id` (owner only),
  `POST /api/trade-intents/:id/status` (web session, transitions),
  `GET /api/trade-intents?status=pending` (web page lists pending).
- Validation server-side: chain allowlist, token resolution to canonical
  addresses (never trust agent-supplied contract addrs without resolving),
  amount caps per intent, 15-min expiry, single-use. Rate-limit creation.
- UI: intent banner on `/trade` + confirm sheet reusing existing swap
  form components. Per AGENTS.md: no user-facing copy invented here —
  strings get reviewed before shipping.

### Safety model (non-negotiable)

- Agent cannot execute: no signing endpoints exist, intents are
  human-confirm only. Prompt injection in a workspace file can at worst
  create a *pending proposal* the user must read and sign.
- v2 consideration (explicitly deferred): delegated-session auto-execute
  for sub-$X intents via Privy delegated signers. Real feature, real risk —
  decide separately, never default-on.

### Engine side (axecode repo)

- `crates/mcp/src/tools.rs` — `axeai_propose_trade`, `axeai_trade_status`.
- `crates/engine/src/axeai_api.rs` (new module) — thin `/v1` +
  `/api/trade-intents` client over the agent token; shared by sections
  3–4 so tools don't each hand-roll HTTP.
- UI card: additive component in the transcript renderer for
  `tool_name == axeai_propose_trade` results — shows params + open/copy.
  Reuse the existing tool-result card pattern.

## 5. What stays on web (intentionally)

Studio project management, full trade dashboard, billing/checkout,
settings. The app links out for those — `cx.open_url` is the feature, not
embedded webviews. Exception worth revisiting: `/trade` intent confirmation
stays web-only *forever* — the wallet must never move.

## 6. Landing order

| # | Piece | Repo | Depends on |
|---|---|---|---|
| 1 | Connect button + headless paste UI | axecode | auth migration (done) |
| 2 | Agent token minted on sign-in | both | 1 |
| 3 | `axeai_api.rs` client + MCP generation tools | axecode | 2 |
| 4 | AxeAI account/credits in usage ring | axecode | 2 |
| 5 | `axe` first-party harness (or bundled opencode v1) | axecode | 2 |
| 6 | `trade_intents` table + API + `/trade` confirm sheet | axeai | — |
| 7 | `axeai_propose_trade` tool + thread card | axecode | 2, 6 |
| 8 | Studio project attach for generated media | both | 3 |

Items 1–4 make "sign in → agent works" true. 6–7 are the differentiator:
a coding agent that proposes trades against your real wallet, with you
signing on the platform. Nothing else ships that.

## 7. Guardrails

- Same merge rules as the auth plan: additive modules, `// axecode:` seams,
  upstream-owned files touched minimally.
- Agent token must never enter the Loro doc, MCP tool output, or logs —
  engine-held only, same discipline as the CLI's env-var indirection.
- `/api/trade-intents` accepts the **native token only**, and only
  creates *proposals*. No execution surface ships in v1.
- When either repo's routes/deploy surface changes, update
  `docs/axeai-codebase-map.html` + `docs/PLATFORM.md` (axeai AGENTS.md rule).
