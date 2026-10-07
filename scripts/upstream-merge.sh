#!/usr/bin/env bash
# Merge zeronsh/zeron upstream/main into a sync branch for review.
#
# Prints on stdout:
#   OUTCOME=clean|auto|conflicted
#   MERGED=<n>        upstream commits being merged
#   CONFLICTS=<files> newline-separated real conflicts (conflicted outcome)
#
# Env:
#   SYNC_BRANCH   branch name to create/update (default sync/upstream)
#   UPSTREAM_URL  upstream remote URL (default https://github.com/zeron/zeron)
#
# Never merges into main — a human or agent reviews the PR. Merge
# discipline lives in AGENTS.md: additive seams, keep zeron-* crate names,
# our Cargo.toml/lock versions always win (we bump independently of Wing).

set -euo pipefail

SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/zeronsh/zeron}"

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch upstream main --quiet
git fetch origin main --quiet

git checkout -B "$SYNC_BRANCH" origin/main --quiet

MERGED=$(git log --oneline "origin/main..upstream/main" | wc -l | tr -d ' ')

if [[ "$MERGED" -eq 0 ]]; then
  echo "MERGED=0"
  echo "OUTCOME=uptodate"
  exit 0
fi

if git merge --no-edit upstream/main; then
  echo "MERGED=$MERGED"
  echo "OUTCOME=clean"
  exit 0
fi

# Auto-resolve conflicts that are pure version-bump noise: our Cargo
# workspace version and lockfile always win over upstream's bump.
conflicts_file="$(mktemp)"
git diff --name-only --diff-filter=U >"$conflicts_file"

version_only=1
while IFS= read -r f; do
  case "$f" in
    Cargo.toml|Cargo.lock|*/Cargo.toml) ;;
    *) version_only=0 ;;
  esac
done <"$conflicts_file"

if [[ "$version_only" -eq 1 ]]; then
  while IFS= read -r f; do
    git checkout --ours "$f"
    git add "$f"
  done <"$conflicts_file"
  git commit --no-edit
  echo "MERGED=$MERGED"
  echo "OUTCOME=auto"
  exit 0
fi

# Real conflicts: abort and report. The branch (at origin/main) still gets
# pushed as a draft PR so an agent can run the merge there and push the
# resolution — never into main unreviewed.
echo "CONFLICTS<<EOF"
cat "$conflicts_file"
echo "EOF"
git merge --abort
rm -f "$conflicts_file"
echo "MERGED=$MERGED"
echo "OUTCOME=conflicted"
