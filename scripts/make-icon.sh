#!/bin/bash
# Rebuilds electron/icon.icns from electron/icon.svg. Run by hand after changing the SVG.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/page.html" <<HTML
<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>
$(cat electron/icon.svg)
HTML

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --window-size=1024,1024 --screenshot="$WORK/icon-1024.png" "file://$WORK/page.html" >/dev/null 2>&1

SET="$WORK/icon.iconset"
mkdir "$SET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$WORK/icon-1024.png" --out "$SET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$WORK/icon-1024.png" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o electron/icon.icns
echo "wrote electron/icon.icns"
