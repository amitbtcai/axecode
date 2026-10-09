#!/usr/bin/env bash
# Rebuild-and-relaunch loop for the dev bundle — the native-app equivalent of
# hot reload. `cargo watch` rebuilds only what changed (incremental), then the
# binary is swapped into the existing "Axe Code Dev.app" bundle, re-signed, and
# relaunched. The running app is restarted, so window state is not preserved.
#
#   scripts/dev-watch.sh          # watch crates/ + apps/ forever
#   scripts/dev-watch.sh --once   # single build + relaunch (used by cargo watch)
#
# Requires the dev bundle to exist already: run scripts/run-macos-dev.sh once
# to create it (icons, Info.plist, initial signature).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
APP="$ROOT/target/macos-dev/Axe Code Dev.app"
BIN="$APP/Contents/MacOS/axecode"
DATA_DIR="${AXECODE_DEV_DATA_DIR:-$ROOT/target/macos-dev/data}"
IPC_PORT="${AXECODE_DEV_IPC_PORT:-49777}"

relaunch() {
  command -v cargo >/dev/null 2>&1 || PATH="$HOME/.cargo/bin:$PATH"
  if ! cargo build -p zeron; then
    echo "dev-watch: build failed, keeping the previous app instance" >&2
    return 1
  fi
  install -m 755 "$ROOT/target/debug/axecode" "$BIN"

  # Keep the same signing identity run-macos-dev.sh used so TCC permissions
  # survive across relaunches.
  IDENTITY="${AXECODE_DEV_CODESIGN_IDENTITY:-}"
  if [[ -z "$IDENTITY" ]]; then
    IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -1)"
  fi
  codesign --entitlements "$ROOT/dist/macos/Dictation.entitlements" --force \
    --sign "${IDENTITY:--}" --identifier "${AXECODE_DEV_BUNDLE_ID:-com.axeai.axecode.dev}" "$APP"

  pkill -f "$BIN" 2>/dev/null || true
  # LaunchServices returns -600 (procNotFound) if `open` races the dying
  # instance — wait for it to fully exit first.
  for _ in $(seq 1 50); do
    pgrep -f "$BIN" >/dev/null 2>&1 || break
    sleep 0.2
  done
  if ! open --env "AXECODE_DATA_DIR=$DATA_DIR" --env "AXECODE_IPC_PORT=$IPC_PORT" "$APP" --args "$@" 2>/dev/null; then
    sleep 1
    open --env "AXECODE_DATA_DIR=$DATA_DIR" --env "AXECODE_IPC_PORT=$IPC_PORT" "$APP" --args "$@"
  fi
  echo "dev-watch: rebuilt and relaunched" >&2
}

if [[ "${1:-}" == "--once" ]]; then
  shift
  relaunch "$@"
  exit 0
fi

if [[ ! -d "$APP" ]]; then
  echo "dev-watch: $APP is missing — run scripts/run-macos-dev.sh once first" >&2
  exit 1
fi

# Build once up front, then rebuild + relaunch on every change under crates/
# or apps/. target/ is gitignored so cargo-watch already skips it.
relaunch || true
exec cargo watch -w crates -w apps -s 'bash scripts/dev-watch.sh --once'
