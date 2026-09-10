# Axe Code — Fork of Porabuild/Poracode

Forked from https://github.com/Porabuild/Poracode (Apache-2.0) @ v1.8.0.
Rebranded as **Axe Code**. Upstream stays synced via the `upstream` remote.

## Environment (REQUIRED — re-run if shell resets)

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

- Node v24.13.0, pnpm 12.3.4 (via corepack)
- **rustup override set to 1.98.1 for this directory**
  - The Rust `computer-use` helper (`native/computer-use-helper`) requires rustc 1.98.
  - Homebrew rustc 1.88 shadows the rustup 1.98.1 toolchain on PATH.
  - Without `export PATH="$HOME/.cargo/bin:$PATH"`, `pnpm dist:mac` fails.

## Baseline verification (all green on unmodified fork)

- `pnpm install` — OK (~2 min)
- `pnpm run typecheck` — clean
- `pnpm run lint` — clean
- `pnpm run test` — 10944 passed / 117 skipped, 935 files (~2 min)
- `pnpm run build` — renderer + electron build OK
- `pnpm run dist:mac` — unsigned DMG OK (arm64 + x64, 144M/148M)
  - Outputs `release/latest-mac.yml` (auto-update feed)

Baseline tag: `upstream-baseline`

## Brand inventory (1166 files reference the brand)

| Term        | Files | Notes                                   |
| ----------- | ----- | --------------------------------------- |
| `Poracode`  | 555   |                                         |
| `poracode`  | 909   |                                         |
| `PORACODE`  | 234   | env vars                                |
| `Porabuild` | 18    | org / publish owner                     |
| `Lightcode` | 38    | **LIVE MIGRATION CODE — DO NOT RENAME** |

By directory: `src` 972, `resources` 40, `scripts` 27, `native` 20, `website` 19,
`.agents` 16, `.github` 12, `packages` 10, `branding` 9, `docs` 8,
`chrome-extension` 4, `tests` 3

### `lightcode` is live, not dead

- `src/renderer/state/dbStorage.ts:30` — `LEGACY_STORAGE_PREFIX = "lightcode"`, DB migration
- `src/renderer/utils/imageActions.ts:5` — matches `poracode|lightcode-local://` image URLs
- `src/renderer/theme/themePresets.ts:384` — legacy theme id fallback

Renaming these breaks user-data migration and local image loading. Preserve verbatim.

## Branding seam (why this fork can stay synced)

Upstream already abstracted branding for their own Lightcode -> Poracode rename:

- `src/shared/channel.ts` — runtime brand values
- `scripts/electron-builder.shared.cjs` — packaging mirror of the same
- `src/shared/channel.config-parity.test.ts` — **asserts the two don't drift**

Both files must be edited together or the parity test fails.

Key functions: `productNameFor`, `appIdFor`, `userDataDirNameFor`,
`artifactPrefixFor`, `macExecutableNameFor`.

Upstream's `appIdFor()` still returns `com.lightcode.app` — never updated after
their rename, so changing it is safe and expected.

`macExecutableNameFor()` is intentionally pinned to a name that does NOT change
between releases: Squirrel.Mac cannot relaunch if the bundle/executable name
changes across an update. Set once, never change.

## Target brand

- Product: **Axe Code**, domain `axeai.com/code`, org **AxeAI**
- GitHub: **amitbtcai/axecode** (`gh` authed as `amitbtcai`, ssh, scopes include repo+workflow)
- appId `com.axecode.app`, userData `.axecode`
- Unsigned for v1; auto-update via GitHub Releases
- Logo: Axe AI mark, viewBox `0 0 197 168`, `currentColor`
- Colors: ink `#212121`, bone `#FAF9F5`
- Channels: **stable only** for now; nightly left in place (disabled by never
  packaging it) so it can be enabled later with no code change

## Phase 1 — core identity (DONE, commit 23802b5c)

Edited only the branding seam, so upstream merges stay mechanical:

- `src/shared/channel.ts` + `scripts/electron-builder.shared.cjs`:
  productName `Axe Code`, appId `com.axecode.app`, userData `.axecode`,
  artifactPrefix `AxeCode`, macExecutableName `Axe Code`
- `scripts/build-desktop-artifact.mjs`: publish owner `amitbtcai` / repo `axecode`,
  linux maintainer `AxeAI`
- `package.json`: name `axecode`, homepage `axeai.com/code`, author `AxeAI`
- `branding/contact.json`: support contact (now `https://x.com/AxeAI_com`)
- Tests updated to the new literals: `RemoteAccessServer` (PWA manifest name),
  `probeCwd`, `poracodePaths`, `poracodeData.migrate`

Verified: typecheck, lint, 10945 tests, unsigned mac DMG arm64+x64,
bundle `com.axecode.app`, `app-update.yml` -> `amitbtcai/axecode`,
`updaterCacheDirName: axecode-updater`.

### Gotcha: updaterCacheDirName

electron-builder derives it from the **staged package.json `name`**, which
`build-desktop-artifact.mjs:177` copies from root `package.json`. Renaming only
`productNameFor()` left it as `poracode-updater`; root `name: axecode` fixed it.

### Gotcha: macExecutableNameFor

Squirrel.Mac cannot relaunch across an executable rename, so the updater ZIP
and DMG executable names must be identical and must never change once shipped.
Set to `Axe Code` now — changing it later strands every install on manual
reinstall.

## Phase 2 — icons & marks (DONE, commit fc5eed25)

`branding/assets/build-icons.mjs` generates every icon from three 1024x1024
masters, so only the masters had to change:

| Master                     | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `axecode-icon.svg`         | axe mark on `#212121` squircle tile (62% fill) |
| `axecode-glyph.svg`        | tile-less `currentColor` glyph for tray icons  |
| `axecode-icon-nightly.svg` | gradient tile (kept for parity)                |

The generator now references them through `MASTER_ICON` / `MASTER_ICON_NIGHTLY`
/ `MASTER_GLYPH` constants instead of six scattered literals, so a future
rebrand or upstream merge touches one place.

Regenerated `build`, `tray`, `website`, `pwa` sections and synced `build/`,
`public/`, `website/public/`.

Also: `BrandWordmark` renders the axe mark + "Axe Code"; PWA manifest and
`app-icon*.svg` renamed; `desktopTitle()` strips the new "Axe Code on " prefix
so paired desktops still show short host titles.

Verified: 10950 tests, bundled `icon.icns` byte-identical to `build/icon.icns`,
glyph coverage 9.2% (upstream 10.0%) and legible down to 16px.

### Regenerating icons

```bash
export PATH="$HOME/.cargo/bin:$PATH"
node branding/assets/build-icons.mjs      # or: build | tray | website | pwa
# then sync build/ + public/ + website/public/ from branding/assets/out/
```

## GitHub

- **https://github.com/amitbtcai/axecode** (public, `master`)
- `origin` -> fork, `upstream` -> Porabuild/Poracode
- Baseline tag `upstream-baseline` pushed for diffing against upstream

## Syncing with upstream

Two unrelated "update" flows — don't confuse them:

| Flow            | Who       | Mechanism                                                                                                 |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| **App update**  | End users | electron-updater polls GitHub Releases, reads `latest-mac.yml`, verifies sha512. Never touches this repo. |
| **Source sync** | You       | `git merge upstream/master`, then re-release to publish the update.                                       |

Upstream moves at roughly **2 commits/day**. Monthly syncing ≈ 240 commits.

There is no sync automation in the repo (checked all workflows) — this is manual.

### Before you start

```bash
export PATH="$HOME/.cargo/bin:$PATH"    # rustc 1.98 for the computer-use helper
git status                              # must be clean
```

### The loop

```bash
git fetch upstream
git merge upstream/master               # or: git merge --no-ff upstream/master
pnpm install
pnpm run typecheck && pnpm run lint && pnpm test
```

Then, if anything brand-related moved, re-verify (see below) and re-release.

### Expected conflicts — measured

Simulated a **30-day sync (241 commits)** with all 13 i18n catalogs and 66
renderer files rebranded:

**16 conflicts, all small.** Roughly 15 minutes to resolve.

| What                                 | Count | Resolution                                                  |
| ------------------------------------ | ----- | ----------------------------------------------------------- |
| `src/renderer/locales/*/messages.po` | 13    | `git checkout --theirs` (generated — see rule below)        |
| Renderer source files                | 3     | 1 hunk each, keep upstream's logic, re-apply the brand name |
| Icons / binaries                     | 0     | never conflict                                              |

Catalog conflicts are ~8 lines: upstream superseded the string, so theirs wins.
Source conflicts look like upstream rewriting a `<Trans>` block — take their
structure, swap "Poracode" back to "Axe Code".

### THE CATALOG RULE (most important thing here)

**Never hand-edit `src/renderer/locales/*/messages.po`.** They are generated:
192k lines across 13 files, and upstream touches them ~200 times per 90 days.
Hand-editing them turns every sync into a slog.

Correct cycle:

1. Change the string in the **source** (`.tsx`), wrapped in `<Trans>` / `t` / `msg`
2. `pnpm i18n:extract`
3. Fill the new `msgstr` in all 12 non-English catalogs (never ship empty —
   see the i18n section in `AGENTS.md`)
4. On merge conflict: `git checkout --theirs src/renderer/locales/*/messages.po`,
   then re-run `pnpm i18n:extract` to re-apply your strings

Because catalogs are generated, "take upstream" is almost always right.

### Post-merge checks

Run these every time — they are what actually catch drift:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
```

Specific things upstream changes that can bite:

- **`branding/assets/build-icons.mjs`** — re-check `MASTER_ICON` /
  `MASTER_ICON_NIGHTLY` / `MASTER_GLYPH` still point at the Axe masters
- **`channel.config-parity.test.ts`** — fails if `src/shared/channel.ts` and
  `scripts/electron-builder.shared.cjs` drift apart
- **New user-facing strings** — upstream adds them constantly; they say
  "Poracode" and need the same treatment
- **`.lightcode` / `lightcode-local://`** — if a merge removes or renames these,
  that is upstream dropping legacy migration; confirm before accepting

### Keeping our footprint small

Everything we change is either a **new file** or a **tiny seam**. Current
footprint is 7 commits / ~22 source files; the rest are generated icons and
binaries. To keep merges cheap:

- Prefer editing the seam (`channel.ts`, `electron-builder.shared.cjs`) over
  touching upstream files
- Never rename identifiers for cosmetics (`poracode-local://`, `.poracode`
  paths, MCP client names) — zero user benefit, real breakage risk
- If you must touch an upstream file, keep the diff to the specific lines

### If upstream rebrands again

They did it 72 days before this fork (commit `015875dc`, 166 files, all 13
catalogs). If they rebrand again, the seam absorbs it: update `channel.ts` +
the `.cjs` mirror, re-run `build-icons.mjs`, re-extract catalogs.

## Releasing

**Versioning:** the clone inherited every upstream tag, so `v1.8.0` was already
taken. Always bump past upstream (`1.8.1`, `1.8.2`, …). Do NOT use a
`-prerelease` suffix — semver sorts `1.8.0-axecode.1` _below_ `1.8.0`, so
electron-updater would ignore it.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
rm -rf release && pnpm run dist:mac      # arm64 + x64 DMG/ZIP + latest-mac.yml
```

Publish `release/` to GitHub Releases: `AxeCode-<v>-{arm64,x64}.{dmg,zip}` plus
`latest-mac.yml`. The `latest-mac.yml` sha512 must match the uploaded ZIPs —
electron-updater verifies it before installing.

`gh release create` fails here with a spurious "workflow scope may be
required" error even though the scope is granted. Workaround: create the
release with `gh api --method POST repos/amitbtcai/axecode/releases`, then
upload each asset with curl to `uploads.github.com`:

```bash
TOKEN=$(gh auth token)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@release/<file>" \
  "https://uploads.github.com/repos/amitbtcai/axecode/releases/<id>/assets?name=<file>"
```

### Signed builds (not yet)

Current releases are unsigned: macOS Gatekeeper blocks first open
(right-click → Open) and auto-update can download but not self-install.
Add an Apple Developer ID and set `CSC_LINK` / `APPLE_ID` /
`APPLE_APP_SPECIFIC_PASSWORD` to enable signing + notarization.

Support contact is `https://x.com/AxeAI_com` (no support mailbox exists) —
see `branding/contact.json`.
