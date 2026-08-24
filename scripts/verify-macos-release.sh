#!/bin/bash
set -euo pipefail

APP_PATH="$(find release -maxdepth 3 -type d -name 'Daytrace.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Daytrace.app was not found in release output" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --verbose=2 --type exec "$APP_PATH"
xcrun stapler validate "$APP_PATH"
codesign --verify --strict --verbose=2 "$APP_PATH/Contents/MacOS/daytrace-tracker"

echo "Verified signed and notarized macOS app: $APP_PATH"
