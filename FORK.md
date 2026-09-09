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
- appId `com.axecode.app`, scheme `axecode://`, userData `.axecode`
- Unsigned for v1; auto-update via GitHub Releases
- Logo: Axe AI mark, viewBox `0 0 197 168`, `currentColor`
- Colors: ink `#212121`, bone `#FAF9F5`
