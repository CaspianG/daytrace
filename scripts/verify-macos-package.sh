#!/bin/bash
set -euo pipefail

APP_PATH="$(find release -maxdepth 3 -type d -name 'Daytrace.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Daytrace.app was not found in release output" >&2
  exit 1
fi

COLLECTOR_APP="$APP_PATH/Contents/Helpers/Daytrace Collector.app"
COLLECTOR_EXECUTABLE="$COLLECTOR_APP/Contents/MacOS/Daytrace Collector"
INFO_PLIST="$COLLECTOR_APP/Contents/Info.plist"

test -x "$COLLECTOR_EXECUTABLE"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")" = "local.daytrace.desktop.collector"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO_PLIST")" = "Daytrace Collector"
ARCHS="$(lipo -archs "$COLLECTOR_EXECUTABLE")"
grep -qw arm64 <<<"$ARCHS"
grep -qw x86_64 <<<"$ARCHS"
codesign --verify --deep --strict --verbose=2 "$COLLECTOR_APP"

set +e
"$COLLECTOR_EXECUTABLE" --check-accessibility >/dev/null 2>&1
PROBE_STATUS=$?
set -e
if [[ "$PROBE_STATUS" != "0" && "$PROBE_STATUS" != "77" ]]; then
  echo "Collector Accessibility probe crashed with status $PROBE_STATUS" >&2
  exit 1
fi

SMOKE_DATA="${TMPDIR%/}/daytrace-desktop-smoke-packaged-$$"
mkdir -p "$SMOKE_DATA"
trap 'rm -rf "$SMOKE_DATA"' EXIT
"$APP_PATH/Contents/MacOS/Daytrace" --daytrace-smoke-test --daytrace-smoke-user-data="$SMOKE_DATA"
grep -q "desktop-smoke-passed" "$SMOKE_DATA/startup.log"

echo "Verified packaged universal macOS app, named collector identity, probe, and desktop startup."
