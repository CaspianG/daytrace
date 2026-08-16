#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/native/macos-tracker/main.swift"
OUTPUT="$ROOT/native/macos-tracker/build"
mkdir -p "$OUTPUT"
swiftc -O -target arm64-apple-macos12 "$SOURCE" -o "$OUTPUT/daytrace-tracker-arm64" -framework AppKit -framework ApplicationServices
swiftc -O -target x86_64-apple-macos12 "$SOURCE" -o "$OUTPUT/daytrace-tracker-x64" -framework AppKit -framework ApplicationServices
lipo -create "$OUTPUT/daytrace-tracker-arm64" "$OUTPUT/daytrace-tracker-x64" -output "$OUTPUT/daytrace-tracker"
chmod +x "$OUTPUT/daytrace-tracker"
