#!/usr/bin/env bash
# Deploys the hosted mobile PWA (dist/mobile) to the Hostinger VPS, where the
# `code.axeai.com` block in the axeai site repo's deploy/axeai.Caddyfile serves
# it as a static site. The block must exist in /etc/caddy/Caddyfile before the
# first visit — Caddy obtains the certificate once the Cloudflare A record for
# code.axeai.com points at the VPS.
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE="${HOSTINGER_SSH_HOST:-hostinger}"
TARGET_DIR="${HOSTINGER_AXECODE_MOBILE_DIR:-/opt/apps/axecode-mobile}"

for command_name in rsync ssh pnpm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
done

echo "Building the mobile PWA (channel=${AXECODE_MOBILE_CHANNEL:-stable})"
AXECODE_MOBILE_CHANNEL="${AXECODE_MOBILE_CHANNEL:-stable}" \
AXECODE_MOBILE_BASE_PATH="/" \
AXECODE_MOBILE_APP_ID="${AXECODE_MOBILE_APP_ID:-com.axecode.mobile}" \
pnpm run build:mobile

test -f dist/mobile/index.html
test -f dist/mobile/.well-known/apple-app-site-association
test -f dist/mobile/.well-known/assetlinks.json

echo "Publishing dist/mobile to ${REMOTE}:${TARGET_DIR}"
ssh "${REMOTE}" "install -d -m 0755 '${TARGET_DIR}'"
rsync -az --delete "dist/mobile/" "${REMOTE}:${TARGET_DIR}/"
ssh "${REMOTE}" "find '${TARGET_DIR}' -type d -exec chmod 0755 {} + \
  && find '${TARGET_DIR}' -type f -exec chmod 0644 {} + \
  && setfacl -m u:caddy:rx /opt /opt/apps '${TARGET_DIR}' \
  && setfacl -R -m u:caddy:rx '${TARGET_DIR}'"

echo "Published the mobile PWA to ${TARGET_DIR}."
echo "Verify once DNS is live: curl -fsSI https://code.axeai.com/pair"
