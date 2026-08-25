#!/bin/bash
set -euo pipefail

APP_PATH="$(find release -maxdepth 3 -type d -name 'Daytrace.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Daytrace.app was not found in release output" >&2
  exit 1
fi

ZIP_PATH="$(find release -maxdepth 1 -type f -name 'Daytrace-*-macOS-universal.zip' -print -quit)"
DMG_PATH="$(find release -maxdepth 1 -type f -name 'Daytrace-*-macOS-universal.dmg' -print -quit)"
if [[ -z "$ZIP_PATH" || -z "$DMG_PATH" ]]; then
  echo "Final universal macOS ZIP or DMG was not found" >&2
  exit 1
fi

VERIFY_ROOT="$(mktemp -d)"
DMG_MOUNT="$VERIFY_ROOT/dmg"
DMG_ATTACHED=0
SMOKE_ROOT="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
SMOKE_DATA="$(mktemp -d "$SMOKE_ROOT/daytrace-desktop-smoke-packaged-XXXXXX")"
COLLECTOR_REQUIREMENT=""
cleanup() {
  if [[ "$DMG_ATTACHED" = "1" ]]; then
    hdiutil detach "$DMG_MOUNT" -quiet || true
  fi
  if [[ "$(dirname "$SMOKE_DATA")" = "$SMOKE_ROOT" && "$(basename "$SMOKE_DATA")" = daytrace-desktop-smoke-packaged-* ]]; then
    rm -rf "$SMOKE_DATA"
  fi
  rm -rf "$VERIFY_ROOT"
}
trap cleanup EXIT

verify_collector() {
  local candidate_app="$1"
  local collector_app="$candidate_app/Contents/Helpers/Daytrace Activity Collector.app"
  local collector_executable="$collector_app/Contents/MacOS/Daytrace Activity Collector"
  local info_plist="$collector_app/Contents/Info.plist"

  test -x "$collector_executable"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")" = "io.github.caspiang.daytrace.collector"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist")" = "Daytrace Activity Collector"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")" = "1.0.0"
  ! /usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity' "$info_plist" >/dev/null 2>&1
  local archs
  archs="$(lipo -archs "$collector_executable")"
  grep -qw arm64 <<<"$archs"
  grep -qw x86_64 <<<"$archs"
  codesign --verify --deep --strict --verbose=2 "$collector_app"
  codesign --verify --deep --strict --verbose=2 "$candidate_app"
  local requirement
  requirement="$(codesign -d -r- "$collector_app" 2>&1 | sed -n 's/^designated => //p')"
  test -n "$requirement"
  if [[ -z "$COLLECTOR_REQUIREMENT" ]]; then
    COLLECTOR_REQUIREMENT="$requirement"
  else
    test "$requirement" = "$COLLECTOR_REQUIREMENT"
  fi
  if [[ -n "${DAYTRACE_COMMUNITY_SIGNING_AUTHORITY:-}" ]]; then
    local signature_details
    signature_details="$(codesign -dvvv "$collector_app" 2>&1)"
    grep -Fq "Authority=$DAYTRACE_COMMUNITY_SIGNING_AUTHORITY" <<<"$signature_details"
  fi
}

verify_collector "$APP_PATH"
COLLECTOR_APP="$APP_PATH/Contents/Helpers/Daytrace Activity Collector.app"
COLLECTOR_EXECUTABLE="$COLLECTOR_APP/Contents/MacOS/Daytrace Activity Collector"

set +e
"$COLLECTOR_EXECUTABLE" --check-accessibility >/dev/null 2>&1
PROBE_STATUS=$?
set -e
if [[ "$PROBE_STATUS" != "0" && "$PROBE_STATUS" != "77" ]]; then
  echo "Collector Accessibility probe crashed with status $PROBE_STATUS" >&2
  exit 1
fi

# Exercise the same LaunchServices path used by the in-app Register button.
# `open` reports launch success; the direct probe above remains the authority
# for the helper's own TCC status.
/usr/bin/open -n -W "$COLLECTOR_APP" --args --check-accessibility

"$APP_PATH/Contents/MacOS/Daytrace" --daytrace-smoke-test --daytrace-smoke-user-data="$SMOKE_DATA"
grep -q "desktop-smoke-passed" "$SMOKE_DATA/startup.log"

ZIP_STAGE="$VERIFY_ROOT/zip"
mkdir -p "$ZIP_STAGE"
/usr/bin/ditto -x -k "$ZIP_PATH" "$ZIP_STAGE"
ZIP_APP="$(find "$ZIP_STAGE" -maxdepth 2 -type d -name 'Daytrace.app' -print -quit)"
test -n "$ZIP_APP"
test -f "$ZIP_STAGE/IF MAC BLOCKS DAYTRACE - OPEN THIS.txt"
verify_collector "$ZIP_APP"

mkdir -p "$DMG_MOUNT"
hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$DMG_MOUNT" -quiet
DMG_ATTACHED=1
test -d "$DMG_MOUNT/Daytrace.app"
test -f "$DMG_MOUNT/IF MAC BLOCKS DAYTRACE - OPEN THIS.txt"
verify_collector "$DMG_MOUNT/Daytrace.app"
hdiutil detach "$DMG_MOUNT" -quiet
DMG_ATTACHED=0

echo "Verified packaged universal macOS app, final ZIP and DMG, named collector identity, probe, install guide, and desktop startup."
