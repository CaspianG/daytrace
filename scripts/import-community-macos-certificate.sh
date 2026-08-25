#!/bin/bash
set -euo pipefail

IDENTITY="Daytrace Community Release"
REQUIRED="${DAYTRACE_REQUIRE_COMMUNITY_SIGNING:-0}"

if [[ -z "${DAYTRACE_COMMUNITY_MAC_CERT_P12:-}" || -z "${DAYTRACE_COMMUNITY_MAC_CERT_PASSWORD:-}" ]]; then
  if [[ "$REQUIRED" = "1" ]]; then
    echo "Stable Daytrace community signing secrets are required for a public macOS release." >&2
    exit 1
  fi
  echo "Community signing secrets are unavailable; this non-release build will use ad-hoc signing."
  exit 0
fi

RUNNER_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
KEYCHAIN="$RUNNER_ROOT/daytrace-community-signing.keychain-db"
P12="$RUNNER_ROOT/daytrace-community-signing.p12"
SIGNING_PROBE="$RUNNER_ROOT/daytrace-community-signing-probe"
KEYCHAIN_PASSWORD="daytrace-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() {
  rm -f "$P12" "$SIGNING_PROBE"
}
trap cleanup EXIT

printf '%s' "$DAYTRACE_COMMUNITY_MAC_CERT_P12" | /usr/bin/base64 -D > "$P12"
chmod 600 "$P12"
echo "Creating the isolated Daytrace signing keychain."
/usr/bin/security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
/usr/bin/security set-keychain-settings -lut 21600 "$KEYCHAIN"
/usr/bin/security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
echo "Importing the stable Daytrace community identity."
/usr/bin/security import "$P12" -k "$KEYCHAIN" -P "$DAYTRACE_COMMUNITY_MAC_CERT_PASSWORD" -T /usr/bin/codesign
/usr/bin/security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
/usr/bin/security list-keychains -d user -s "$KEYCHAIN"

# Trusting a private, self-signed certificate as a root can invoke SecurityAgent
# on a hosted runner and hang forever. It is also unnecessary here: this
# identity stabilises the collector's designated requirement for TCC; it does
# not and must not pretend to be Apple notarization. Select the imported leaf by
# fingerprint and prove that its private key is usable with a real signature.
IDENTITY_SHA1="$(/usr/bin/security find-certificate -c "$IDENTITY" -Z "$KEYCHAIN" | /usr/bin/awk '/SHA-1 hash:/{print $3; exit}')"
if [[ ! "$IDENTITY_SHA1" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "Imported Daytrace community certificate was not found in the isolated keychain." >&2
  exit 1
fi
printf '#!/bin/sh\nexit 0\n' > "$SIGNING_PROBE"
chmod 700 "$SIGNING_PROBE"
/usr/bin/codesign --force --sign "$IDENTITY_SHA1" "$SIGNING_PROBE"
/usr/bin/codesign --verify --strict --verbose=2 "$SIGNING_PROBE"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'DAYTRACE_COMMUNITY_SIGNING_IDENTITY=%s\n' "$IDENTITY_SHA1" >> "$GITHUB_ENV"
  printf 'DAYTRACE_COMMUNITY_SIGNING_AUTHORITY=%s\n' "$IDENTITY" >> "$GITHUB_ENV"
fi
export DAYTRACE_COMMUNITY_SIGNING_IDENTITY="$IDENTITY_SHA1"
export DAYTRACE_COMMUNITY_SIGNING_AUTHORITY="$IDENTITY"
echo "Imported and exercised the stable Daytrace community code-signing identity. Gatekeeper notarization remains intentionally separate."
