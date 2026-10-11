#!/bin/sh
# AppIcon.svg から AppIcon.icns を作る (macOS。librsvg が必要: brew install librsvg)。
# ロゴや色を変えたときだけ実行し、できた AppIcon.icns をコミットする (利用者の Mac に librsvg は要らない)。
set -e
cd "$(dirname "$0")"
set_dir="$(mktemp -d)/AppIcon.iconset"
mkdir "$set_dir"
for s in 16 32 128 256 512; do
  rsvg-convert -w "$s" -h "$s" AppIcon.svg -o "$set_dir/icon_${s}x${s}.png"
  rsvg-convert -w "$((s * 2))" -h "$((s * 2))" AppIcon.svg -o "$set_dir/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$set_dir" -o AppIcon.icns
