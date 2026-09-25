#!/usr/bin/env bash
#
# deploy-to-prod.sh — one-command prod release for Axe Code desktop.
#
# Pipeline:
#   1. Commit all local changes and push master
#   2. Verify a well-formed changelog entry exists for the target version
#      (release.yml refuses to tag without it — write notes first)
#   3. Dispatch the stable Release workflow and wait for it to go green
#   4. Confirm the GitHub release exists with macOS assets
#   5. Deploy the axeai.com site to the Hostinger VPS (~/Documents/axeai →
#      scripts/deploy-hostinger.sh) so /code and /api/downloads/latest are live,
#      then poll the downloads API until it reports the new version
#   6. Download the DMG via the site's downloads payload (GitHub asset URL)
#   7. Replace the installed app in /Applications and verify the version
#
# Usage:
#   scripts/deploy-to-prod.sh [options]
#
# Options:
#   -m, --message MSG    Commit message for pending changes in this repo
#                        (default: "chore: release prep")
#       --site-message MSG  Commit message for pending ~/Documents/axeai changes
#                        (default: "chore: deploy pending site work")
#       --version X.Y.Z  Pin the release version (default: auto-resolve next)
#       --skip-site      Skip the Hostinger site deploy (release already live)
#   -y, --yes            Skip the /Applications replacement confirmation
#       --dry-run        Print the plan and stop before pushing anything
#   -h, --help           Show this help
#
# Env overrides:
#   GH_REPO        GitHub repo for releases      (default: origin remote)
#   AXEAI_REPO     Path to the axeai.com site repo (default: ~/Documents/axeai)
#   SITE_BASE      Prod site base URL            (default: https://axeai.com)
#   RELEASE_TIMEOUT_MIN   Max wait for release workflow   (default: 120)
#   SITE_TIMEOUT_MIN      Max wait for downloads API      (default: 20)

set -euo pipefail

# ── config ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GH_REPO="${GH_REPO:-$(git remote get-url origin | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')}"
AXEAI_REPO="${AXEAI_REPO:-$HOME/Documents/axeai}"
SITE_BASE="${SITE_BASE:-https://axeai.com}"
RELEASE_TIMEOUT_MIN="${RELEASE_TIMEOUT_MIN:-120}"
SITE_TIMEOUT_MIN="${SITE_TIMEOUT_MIN:-20}"
WORKFLOW="release.yml"
CHANGELOG="website/public/changelog.json"
APP_PATH="/Applications/Axe Code.app"

COMMIT_MSG="chore: release prep"
SITE_COMMIT_MSG="chore: deploy pending site work"
PINNED_VERSION=""
SKIP_SITE=0
ASSUME_YES=0
DRY_RUN=0

# ── output helpers ──────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BLUE=$'\033[1;34m'; C_GREEN=$'\033[1;32m'; C_YELLOW=$'\033[1;33m'
  C_RED=$'\033[1;31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_DIM=""; C_OFF=""
fi
step() { printf "\n%s==>%s %s\n" "$C_BLUE" "$C_OFF" "$1"; }
info() { printf "    %s\n" "$1"; }
ok()   { printf "    %s✓%s %s\n" "$C_GREEN" "$C_OFF" "$1"; }
warn() { printf "    %s!%s %s\n" "$C_YELLOW" "$C_OFF" "$1"; }
die()  { printf "\n%sERROR:%s %s\n" "$C_RED" "$C_OFF" "$1" >&2; exit 1; }

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message) COMMIT_MSG="${2:?--message needs a value}"; shift 2 ;;
    --site-message) SITE_COMMIT_MSG="${2:?--site-message needs a value}"; shift 2 ;;
    --version)    PINNED_VERSION="${2:?--version needs a value}"; shift 2 ;;
    --skip-site)  SKIP_SITE=1; shift ;;
    -y|--yes)     ASSUME_YES=1; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -h|--help)    usage 0 ;;
    *)            die "Unknown option: $1 (try --help)" ;;
  esac
done

# ── preflight ───────────────────────────────────────────────────────
step "Preflight"
for tool in git gh node curl hdiutil; do
  command -v "$tool" >/dev/null 2>&1 || die "missing required tool: $tool"
done
gh auth status >/dev/null 2>&1 || die "gh is not authenticated (run: gh auth login)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "master" ] || die "must be on master (currently on '$BRANCH')"
git fetch origin master --quiet
ok "tools ok · on master · repo: $GH_REPO"

# ── 1. commit + push ────────────────────────────────────────────────
step "Commit & push"
git add -A
if ! git diff --cached --quiet; then
  if [ "$DRY_RUN" = "1" ]; then
    info "would commit $(git diff --cached --name-only | wc -l | tr -d ' ') file(s): $COMMIT_MSG"
  else
    git commit -m "$COMMIT_MSG" --quiet
    ok "committed: $COMMIT_MSG"
  fi
else
  info "nothing to commit"
fi

# ── 2. resolve version + changelog gate (before pushing) ────────────
step "Resolve release version"
if [ -n "$PINNED_VERSION" ]; then
  VERSION="$PINNED_VERSION"
else
  VERSION="$(node scripts/resolve-release-version.mjs)"
fi
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || die "bad version: $VERSION"
git rev-parse "v$VERSION" >/dev/null 2>&1 && die "tag v$VERSION already exists"
ok "target version: $VERSION"

node -e '
  const doc = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const e = (doc.releases || []).find((r) => r && r.version === process.argv[2]);
  const good = e && e.title && e.summary && Array.isArray(e.changes) && e.changes.length &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(e.date || "");
  process.exit(good ? 0 : 1);
' "$CHANGELOG" "$VERSION" || die \
  "no well-formed changelog entry for $VERSION in $CHANGELOG.
   Write release notes first (the release-notes skill), commit, then re-run."
ok "changelog entry for $VERSION present"

if [ "$DRY_RUN" = "1" ]; then
  step "Dry run — stopping before push"
  info "would push master and dispatch: gh workflow run $WORKFLOW -R $GH_REPO"
  exit 0
fi

git push origin master --quiet
ok "master pushed ($(git rev-parse --short HEAD))"

# ── 3. dispatch release workflow ────────────────────────────────────
step "Dispatch $WORKFLOW (v$VERSION)"
WF_ARGS=(-R "$GH_REPO")
[ -n "$PINNED_VERSION" ] && WF_ARGS+=(-f "version=$PINNED_VERSION")
gh workflow run "$WORKFLOW" "${WF_ARGS[@]}"

# the run may take a few seconds to register
RUN_ID=""
for _ in $(seq 1 12); do
  sleep 5
  RUN_ID="$(gh run list -R "$GH_REPO" --workflow="$WORKFLOW" --limit 1 \
    --json databaseId --jq '.[0].databaseId')"
  RUN_SHA="$(gh run view "$RUN_ID" -R "$GH_REPO" --json headSha --jq .headSha 2>/dev/null || true)"
  [ "$RUN_SHA" = "$(git rev-parse HEAD)" ] && break
  RUN_ID=""
done
[ -n "$RUN_ID" ] || die "could not find the dispatched workflow run"
info "watching run $RUN_ID — https://github.com/$GH_REPO/actions/runs/$RUN_ID"

deadline=$(( $(date +%s) + RELEASE_TIMEOUT_MIN * 60 ))
while :; do
  STATUS="$(gh run view "$RUN_ID" -R "$GH_REPO" --json status,conclusion \
    --jq '"\(.status):\(.conclusion // "")"')"
  case "$STATUS" in
    completed:success) ok "release workflow succeeded"; break ;;
    completed:*) die "release workflow ended: $STATUS — see run $RUN_ID logs" ;;
    *) [ "$(date +%s)" -lt "$deadline" ] || die "release workflow timed out after ${RELEASE_TIMEOUT_MIN}m"
       printf "    %s… %s%s\r" "$C_DIM" "$STATUS" "$C_OFF"; sleep 30 ;;
  esac
done

# ── 4. verify GitHub release ────────────────────────────────────────
step "Verify GitHub release v$VERSION"
ASSETS="$(gh release view "v$VERSION" -R "$GH_REPO" --json assets --jq '.assets[].name')" \
  || die "release v$VERSION not found on $GH_REPO"
echo "$ASSETS" | grep -qE "AxeCode-$VERSION-(arm64|x64)\.dmg" \
  || die "release v$VERSION has no macOS DMG asset"
ok "release published with assets"

# ── 5. deploy axeai.com (Hostinger VPS) + wait for downloads API ────
step "Deploy axeai.com to Hostinger"
if [ "$SKIP_SITE" = "1" ]; then
  info "--skip-site set — skipping site deploy"
else
  [ -d "$AXEAI_REPO" ] || die "axeai site repo not found at $AXEAI_REPO"
  [ -x "$AXEAI_REPO/scripts/deploy-hostinger.sh" ] \
    || die "missing $AXEAI_REPO/scripts/deploy-hostinger.sh"
  (
    cd "$AXEAI_REPO"
    if [ -n "$(git status --porcelain)" ]; then
      git add -A
      git commit -m "$SITE_COMMIT_MSG" --quiet
      info "committed pending site work: $SITE_COMMIT_MSG"
    fi
    git push origin main --quiet
    ./scripts/deploy-hostinger.sh
  )
  ok "axeai.com deployed"
fi

step "Poll $SITE_BASE downloads API for v$VERSION"
# /api/downloads/latest proxies GitHub releases/latest with a 5-min cache.
API_OK=0
deadline=$(( $(date +%s) + SITE_TIMEOUT_MIN * 60 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  PAYLOAD="$(curl -fsS --max-time 15 "$SITE_BASE/api/downloads/latest" || true)"
  if echo "$PAYLOAD" | grep -q "\"version\":\"$VERSION\""; then
    API_OK=1; ok "downloads API serving $VERSION"; break
  fi
  printf "    %s… waiting for %s/api/downloads/latest%s\r" "$C_DIM" "$SITE_BASE" "$C_OFF"
  sleep 30
done
[ "$API_OK" = "1" ] || warn "downloads API did not report $VERSION within ${SITE_TIMEOUT_MIN}m — downloading straight from GitHub instead"

# ── 6. download the DMG ─────────────────────────────────────────────
step "Download macOS build"
ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] || ARCH="x64"
DL_DIR="$(mktemp -d)"; trap 'rm -rf "$DL_DIR"' EXIT

DMG_URL=""
if [ "$API_OK" = "1" ]; then
  KEY="macArm64"; [ "$ARCH" = "x64" ] && KEY="macX64"
  DMG_URL="$(curl -fsS --max-time 15 "$SITE_BASE/api/downloads/latest" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).downloads[process.argv[1]]||"")}catch{}})' "$KEY")"
fi
if [ -z "$DMG_URL" ]; then
  DMG_URL="$(gh api "repos/$GH_REPO/releases/tags/v$VERSION" \
    --jq ".assets[] | select(.name | test(\"AxeCode-$VERSION-$ARCH\\\\.dmg\")) | .browser_download_url")"
fi
[ -n "$DMG_URL" ] || die "could not resolve a DMG URL for $VERSION ($ARCH)"

DMG="$DL_DIR/AxeCode-$VERSION-$ARCH.dmg"
info "downloading: $DMG_URL"
curl -fL --progress-bar -o "$DMG" "$DMG_URL" || die "download failed"
[ -s "$DMG" ] || die "download is empty"
ok "downloaded $(du -h "$DMG" | cut -f1)"

# ── 7. install + verify (detached) ──────────────────────────────────
# The installer quits Axe Code before swapping the bundle. If this script is
# running inside an in-app agent session, that quit kills this process tree —
# so the swap runs via nohup in scripts/install-desktop-dmg.sh and always
# completes. The prompt happens here, before anything is dispatched.
step "Install to /Applications"
if [ -e "$APP_PATH" ]; then
  info "will replace: $APP_PATH"
  if [ "$ASSUME_YES" != "1" ]; then
    printf "    Replace it? [y/N] "
    read -r ans; [ "$ans" = "y" ] || die "aborted by user"
  fi
fi

# DL_DIR is removed by the exit trap — stage the DMG somewhere stable for the
# detached installer, which may outlive this script.
INSTALL_STAGING="$(mktemp -d -t axecode-install)"
mv "$DMG" "$INSTALL_STAGING/"
DMG="$INSTALL_STAGING/$(basename "$DMG")"

INSTALL_LOG="$INSTALL_STAGING/install.log"
nohup "$REPO_ROOT/scripts/install-desktop-dmg.sh" "$DMG" "$VERSION" "$APP_PATH" \
  >"$INSTALL_LOG" 2>&1 &
disown
ok "install dispatched (detached) — log: $INSTALL_LOG"
info "the app will quit, swap, verify, and relaunch itself"
info "watch: tail -f $INSTALL_LOG"

step "Done"
ok "Axe Code $VERSION released, published, and installing"
