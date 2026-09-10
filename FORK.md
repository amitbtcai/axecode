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
- `branding/contact.json`: `support@axeai.com`
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

### Syncing with upstream

```bash
export PATH="$HOME/.cargo/bin:$PATH"
git fetch upstream && git merge upstream/master
pnpm install && pnpm run typecheck && pnpm run lint && pnpm test
```

If upstream touches `branding/assets/build-icons.mjs`, re-check that the
`MASTER_*` constants still point at the Axe masters.

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
