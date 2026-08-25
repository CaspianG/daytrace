#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/native/macos-tracker/main.swift"
OUTPUT="$ROOT/native/macos-tracker/build"
COLLECTOR_NAME="Daytrace Activity Collector"
COLLECTOR_ID="io.github.caspiang.daytrace.collector"
COLLECTOR_VERSION="1.0.0"
COLLECTOR_APP="$OUTPUT/$COLLECTOR_NAME.app"
COLLECTOR_EXECUTABLE="$COLLECTOR_APP/Contents/MacOS/$COLLECTOR_NAME"
ICONSET="$OUTPUT/DaytraceCollector.iconset"
mkdir -p "$OUTPUT"
swiftc -O -target arm64-apple-macos12 "$SOURCE" -o "$OUTPUT/daytrace-tracker-arm64" -framework AppKit -framework ApplicationServices
swiftc -O -target x86_64-apple-macos12 "$SOURCE" -o "$OUTPUT/daytrace-tracker-x64" -framework AppKit -framework ApplicationServices
lipo -create "$OUTPUT/daytrace-tracker-arm64" "$OUTPUT/daytrace-tracker-x64" -output "$OUTPUT/daytrace-tracker"
chmod +x "$OUTPUT/daytrace-tracker"

# Accessibility consent belongs to the process that calls AX APIs. Package the
# collector as a real, named helper app so macOS registers the same visible TCC
# identity that Daytrace checks and launches.
rm -rf "$COLLECTOR_APP" "$ICONSET"
mkdir -p "$COLLECTOR_APP/Contents/MacOS" "$COLLECTOR_APP/Contents/Resources" "$ICONSET"
cp "$OUTPUT/daytrace-tracker" "$COLLECTOR_EXECUTABLE"
chmod +x "$COLLECTOR_EXECUTABLE"

cat > "$COLLECTOR_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>$COLLECTOR_NAME</string>
  <key>CFBundleExecutable</key><string>$COLLECTOR_NAME</string>
  <key>CFBundleIconFile</key><string>DaytraceCollector</string>
  <key>CFBundleIdentifier</key><string>$COLLECTOR_ID</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$COLLECTOR_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$COLLECTOR_VERSION</string>
  <key>CFBundleVersion</key><string>$COLLECTOR_VERSION</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAccessibilityUsageDescription</key><string>Daytrace uses Accessibility only to read active-application and active-window metadata locally.</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

for spec in "16:icon_16x16.png" "32:icon_16x16@2x.png" "32:icon_32x32.png" "64:icon_32x32@2x.png" "128:icon_128x128.png" "256:icon_128x128@2x.png" "256:icon_256x256.png" "512:icon_256x256@2x.png" "512:icon_512x512.png" "1024:icon_512x512@2x.png"; do
  size="${spec%%:*}"
  name="${spec#*:}"
  sips -z "$size" "$size" "$ROOT/build/icon.png" --out "$ICONSET/$name" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$COLLECTOR_APP/Contents/Resources/DaytraceCollector.icns"
rm -rf "$ICONSET"

plutil -lint "$COLLECTOR_APP/Contents/Info.plist"
# This ad-hoc signature gives the helper a valid explicit identifier in unsigned
# community builds. A real Developer ID signature still replaces it in the
# strict release path and is the only way to guarantee consent survives updates.
codesign --force --sign - --options runtime --identifier "$COLLECTOR_ID" "$COLLECTOR_APP"
codesign --verify --strict --verbose=2 "$COLLECTOR_APP"
