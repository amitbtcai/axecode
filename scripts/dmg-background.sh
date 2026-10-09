#!/usr/bin/env bash
# Render the DMG Finder background from the Axe AI portal artwork
# (dist/macos/dmg-source.jpg).
#
# Crops a 1.65:1 region centered on the portal for the 660x400pt
# drag-to-Applications window (app icon at x=165, Applications at
# x=495, both at y=195), darkens the top band, and composites the
# AXE AI wordmark + tagline lifted out of the source artwork —
# gray luminance becomes the alpha channel so only the white brand
# text lands on the image. Emits the 1x and 2x backgrounds.
# Both outputs are committed so packaging never needs ImageMagick;
# rerun this only when changing the artwork, crop, or wordmark.
#
# Usage: bash scripts/dmg-background.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/macos/dmg-source.jpg"
OUT="$ROOT/dist/macos"
SCRIM="$(mktemp /tmp/dmg-scrim.XXXXXX.png)"
WORDMARK="$(mktemp /tmp/dmg-wordmark.XXXXXX.png)"
trap 'rm -f "$SCRIM" "$WORDMARK"' EXIT

# 720x436 crop at +360+700 frames the portal, rays and dune line.
magick "$SRC" -crop 720x436+360+700 +repage -resize '1320x800!' "$OUT/dmg-background@2x.png"

# Soft scrim at the top so the white wordmark stays readable over the rays.
magick -size 1320x380 gradient:'rgba(0,0,0,0.60)-rgba(0,0,0,0)' "$SCRIM"
magick "$OUT/dmg-background@2x.png" "$SCRIM" -gravity north -composite "$OUT/dmg-background@2x.png"

# AXE AI wordmark + tagline, straight out of the source artwork
# (860x420 at +290+150). The gray level pass crushes the dark sky to
# transparent and the white brand type to opaque. 480px wide, 30px down.
magick "$SRC" -crop 860x420+290+150 +repage \
  \( +clone -colorspace gray -level 25%,85% \) \
  -alpha off -compose CopyOpacity -composite -resize 480x "$WORDMARK"
magick "$OUT/dmg-background@2x.png" "$WORDMARK" -gravity north -geometry +0+30 -composite "$OUT/dmg-background@2x.png"

magick "$OUT/dmg-background@2x.png" -resize '660x400!' "$OUT/dmg-background.png"
