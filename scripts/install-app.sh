#!/bin/bash
# Copies the packaged app into /Applications, replacing any older copy.
# The database lives in ~/Library/Application Support, so it is never touched.
#   --check-only   only check that the app is not running (run before packaging,
#                  so a refusal never leaves a build copy in dist/)
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="NeetCode Tracker"
TARGET="/Applications/$NAME.app"

if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null; then
  echo "install: $NAME is running. Quit it (Cmd+Q) and try again." >&2
  exit 1
fi
if [ "${1:-}" = "--check-only" ]; then
  exit 0
fi

BUILT=$(find dist -maxdepth 2 -name "$NAME.app" -type d 2>/dev/null | head -1 || true)
if [ -z "$BUILT" ]; then
  echo "install: no packaged app in dist/. Run npm run app:package first." >&2
  exit 1
fi

rm -rf "$TARGET"
ditto "$BUILT" "$TARGET"
# Both copies share one app ID, so macOS could open the build copy (on the real database) from the Dock.
rm -rf dist
echo "install: $TARGET is up to date"
