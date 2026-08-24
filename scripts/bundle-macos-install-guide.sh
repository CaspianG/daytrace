#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
guide="$project_root/MACOS_INSTALL.txt"
release_dir="$project_root/release"

if [[ ! -f "$guide" ]]; then
  echo "Missing macOS install guide: $guide" >&2
  exit 1
fi

shopt -s nullglob
archives=("$release_dir"/Daytrace-*-macOS-universal.zip)
if [[ ${#archives[@]} -ne 1 ]]; then
  echo "Expected exactly one universal macOS ZIP in $release_dir, found ${#archives[@]}" >&2
  exit 1
fi

archive="${archives[0]}"
stage="$(mktemp -d)"
rebuilt="$archive.rebuilt"

cleanup() {
  rm -rf "$stage"
  rm -f "$rebuilt"
}
trap cleanup EXIT

/usr/bin/ditto -x -k "$archive" "$stage"
/usr/bin/ditto "$guide" "$stage/IF MAC BLOCKS DAYTRACE - OPEN THIS.txt"
/usr/bin/ditto -c -k --sequesterRsrc --rsrc "$stage" "$rebuilt"
/usr/bin/unzip -tq "$rebuilt"
mv -f "$rebuilt" "$archive"

echo "Bundled bilingual install guide into $(basename "$archive")"
