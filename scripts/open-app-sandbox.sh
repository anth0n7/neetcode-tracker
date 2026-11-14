#!/bin/bash
# Opens the installed app on a trial copy of data/sandbox.db instead of the real database.
# The copy lives in Application Support because macOS stops a freshly built app from
# reading ~/Documents (where this project is) until you approve it, after every rebuild.
#   --fresh   replace the trial copy with a new copy of data/sandbox.db
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="NeetCode Tracker"
TARGET="/Applications/$NAME.app"
SOURCE="$PWD/data/sandbox.db"
TRIAL_DIR="$HOME/Library/Application Support/$NAME/trial"
TRIAL="$TRIAL_DIR/sandbox.db"

if [ ! -d "$TARGET" ]; then
  echo "app:sandbox: $NAME is not installed. Run npm run app:install first." >&2
  exit 1
fi
# A running copy would just be brought forward, still on whichever database it opened with.
if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null; then
  echo "app:sandbox: $NAME is already running. Quit it (Cmd+Q) and try again." >&2
  exit 1
fi

if [ "${1:-}" = "--fresh" ] || [ ! -f "$TRIAL" ]; then
  if [ ! -f "$SOURCE" ]; then
    echo "app:sandbox: $SOURCE does not exist. Run npm run sandbox:fill first." >&2
    exit 1
  fi
  mkdir -p "$TRIAL_DIR"
  rm -rf "$TRIAL" "$TRIAL_DIR/backups"
  cp "$SOURCE" "$TRIAL"
  echo "app:sandbox: made a fresh trial copy of data/sandbox.db"
fi

open -a "$TARGET" --env "DATABASE_PATH=$TRIAL"
echo "app:sandbox: opened $NAME on $TRIAL"
