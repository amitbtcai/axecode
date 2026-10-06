#!/usr/bin/env bash
# Render the DMG Finder background from the Axe AI portal artwork
# (dist/macos/dmg-source.jpg).
#
# Crops a 1.65:1 region centered on the portal for the 660x400pt
# drag-to-Applications window (app icon at x=165, Applications at
# x=495, both at y=195) and emits the 1x and 2x backgrounds.
# Both outputs are committed so packaging never needs ImageMagick;
# rerun this only when changing the artwork or the crop.
#
# Usage: bash scripts/dmg-background.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/macos/dmg-source.jpg"
OUT="$ROOT/dist/macos"

# 720x436 crop at +360+700 frames the portal, rays and dune line while
# excluding the AXE AI wordmark at the top of the source artwork.
magick "$SRC" -crop 720x436+360+700 +repage -resize '1320x800!' "$OUT/dmg-background@2x.png"
magick "$OUT/dmg-background@2x.png" -resize '660x400!' "$OUT/dmg-background.png"
