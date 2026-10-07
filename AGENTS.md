# Agent guide — Axe Code (Zeron fork)

This repo is a fork of `zeronsh/zeron` (remote `upstream`), rebranded as Axe Code.
It is actively worked on by multiple concurrent agent sessions — read the
git-safety section before touching the working tree.

## Build toolchain

- Rust is pinned to `beta` via `rust-toolchain.toml` because the tree uses
  std APIs that only stabilize in 1.100 (`File::try_lock`, `Ipv4Addr::from_octets`
  via rtc-mdns). Do NOT fight this: if `cargo` resolves to Homebrew's 1.88,
  use `rustup run beta cargo …` or put `~/.cargo/bin` first on PATH.
  Revert to `channel = "stable"` once stable ≥ 1.100 ships.
- Package manager: `pnpm` 12.3.4. Node ≥ 24.10.
- `run-macos-dev.sh` builds the full app bundle — only for launch/branding
  verification, never for routine checks.

## Verification ladder — spend as little as possible

- Prefer `cargo check -p <crate>` (scoped) over `cargo check` / `cargo build`
  on the workspace.
- Prefer `cargo test -p <crate> <test-name>` over the full suite.
- Edge changes: `pnpm --filter` or `tsc --noEmit` inside `edge/` only.
- Never `cargo clean`, never delete `target/` — the incremental cache is
  the difference between minutes and an hour.
- Do not run `scripts/package-macos.sh` or `run-macos-dev.sh` to verify
  code changes; they are packaging/launch steps.

## Merge discipline with upstream

- Keep `zeron-*` crate names, internal identifiers, and upstream comments —
  renaming creates permanent merge-conflict tax.
- Fork changes should be additive or small clearly-marked seams inside
  upstream files; prefer new files where possible.
- User-visible strings must say "Axe Code" / `axecode`; internal code stays
  `zeron_*`.
- New user-facing renderer strings need Lingui localization.
- UI work uses HeroUI v3 and the React Compiler (no manual memoization).

## Runtime facts

- Production IPC port `28654`; dev bundle uses `49777` with isolated data at
  `target/macos-dev/data`. Production data lives in `~/.axecode`.
- `origin` is github.com/amitbtcai/axecode (public, recreated); `upstream`
  is zeronsh/zeron. Push fork work to `origin` only.
- `.github/workflows/upstream-sync.yml` runs daily + on dispatch:
  `scripts/upstream-merge.sh` merges `upstream/main` into `sync/upstream`
  and opens/updates a PR. `clean`/`auto` outcomes are reviewable diffs;
  `conflicted` opens a tracking issue — an agent resolves in a worktree
  (`git worktree add /tmp/axecode-sync sync/upstream`, `git merge
  upstream/main`, resolve per the rules above — version files resolve as
  ours), pushes to `sync/upstream`, and opens the PR.

## Git safety — parallel sessions share this tree

- NEVER `git reset --hard`, `git checkout --`, or `git clean` on shared
  work — other sessions' uncommitted changes have been lost this way.
  To set aside work: `git stash -u`. To inspect: `git stash list`,
  `git reflog`.
- Commit only the files your task changed; review `git status` for other
  sessions' edits and leave them alone.
