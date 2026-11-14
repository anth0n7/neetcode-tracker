#!/bin/bash
# Copies the packaged app into /Applications, replacing any older copy.
# The database lives in ~/Library/Application Support, so it is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="NeetCode Tracker"
TARGET="/Applications/$NAME.app"
BUILT=$(find dist -maxdepth 2 -name "$NAME.app" -type d | head -1)

if [ -z "$BUILT" ]; then
  echo "install: no packaged app in dist/. Run npm run app:package first." >&2
  exit 1
fi
if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null; then
  echo "install: $NAME is running. Quit it (Cmd+Q) and try again." >&2
  exit 1
fi

rm -rf "$TARGET"
ditto "$BUILT" "$TARGET"
# Both copies share one app ID, so macOS could open the build copy (on the real database) from the Dock.
rm -rf dist
echo "install: $TARGET is up to date"
