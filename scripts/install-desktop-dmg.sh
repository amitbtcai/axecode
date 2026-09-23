#!/usr/bin/env bash
# install-desktop-dmg.sh — swap /Applications/Axe Code.app from a release DMG.
#
# This script is designed to be run DETACHED (nohup, launchd, or a plain
# terminal). It quits Axe Code before replacing the bundle — if it runs as a
# child of the app (e.g. an in-app agent session), that quit kills its own
# process tree mid-install. deploy-to-prod.sh dispatches it via nohup so the
# swap, verification, and relaunch always complete.
#
# Usage:
#   scripts/install-desktop-dmg.sh <dmg-path> <expected-version> [app-path]
#
# Exit 0 only after the installed bundle's CFBundleShortVersionString matches
# <expected-version> and the app has been relaunched.

set -euo pipefail

DMG="${1:?usage: install-desktop-dmg.sh <dmg-path> <expected-version> [app-path]}"
EXPECTED="${2:?expected version required}"
APP_PATH="${3:-/Applications/Axe Code.app}"

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[ -f "$DMG" ] || die "DMG not found: $DMG"
for tool in hdiutil defaults pgrep open; do
  command -v "$tool" >/dev/null 2>&1 || die "missing required tool: $tool"
done

MOUNT="$(hdiutil attach -nobrowse -readonly "$DMG" | grep '/Volumes/' | tail -1 | sed 's/.*\/Volumes/\/Volumes/')"
[ -n "$MOUNT" ] || die "hdiutil attach failed for $DMG"
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT

NEW_APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)"
[ -n "$NEW_APP" ] || die "no .app bundle in $MOUNT"
log "found bundle: $(basename "$NEW_APP")"

osascript -e 'tell application "Axe Code" to quit' 2>/dev/null || true
# rm -rf on a still-running bundle can fail or corrupt the swap; give the app
# up to 10s to exit before touching it.
for _ in $(seq 1 20); do
  pgrep -f "$APP_PATH/Contents/MacOS/" >/dev/null 2>&1 || break
  sleep 0.5
done

rm -rf "$APP_PATH"
cp -R "$NEW_APP" /Applications/
hdiutil detach "$MOUNT" -quiet
trap - EXIT

INSTALLED="$(defaults read "$APP_PATH/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"
[ "$INSTALLED" = "$EXPECTED" ] || die "version mismatch — installed '${INSTALLED:-unknown}', expected $EXPECTED"
log "verified: $APP_PATH is version $INSTALLED"

open "$APP_PATH"
log "relaunched $(basename "$APP_PATH")"

# Remove the mktemp staging dir deploy-to-prod.sh created (never touches a
# caller-supplied directory).
case "$(basename "$(dirname "$DMG")")" in
  axecode-install.*) rm -rf "$(dirname "$DMG")" ;;
esac
