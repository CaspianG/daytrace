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
CERT="$RUNNER_ROOT/daytrace-community-signing.pem"
KEYCHAIN_PASSWORD="daytrace-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

printf '%s' "$DAYTRACE_COMMUNITY_MAC_CERT_P12" | /usr/bin/base64 -D > "$P12"
chmod 600 "$P12"
/usr/bin/security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
/usr/bin/security set-keychain-settings -lut 21600 "$KEYCHAIN"
/usr/bin/security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
/usr/bin/security import "$P12" -k "$KEYCHAIN" -P "$DAYTRACE_COMMUNITY_MAC_CERT_PASSWORD" -T /usr/bin/codesign
/usr/bin/security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
/usr/bin/openssl pkcs12 -in "$P12" -clcerts -nokeys -passin env:DAYTRACE_COMMUNITY_MAC_CERT_PASSWORD -out "$CERT"
/usr/bin/security add-trusted-cert -r trustRoot -k "$KEYCHAIN" "$CERT"
/usr/bin/security list-keychains -d user -s "$KEYCHAIN"
/usr/bin/security find-identity -v -p codesigning "$KEYCHAIN" | grep -Fq "$IDENTITY"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'DAYTRACE_COMMUNITY_SIGNING_IDENTITY=%s\n' "$IDENTITY" >> "$GITHUB_ENV"
fi
export DAYTRACE_COMMUNITY_SIGNING_IDENTITY="$IDENTITY"
echo "Imported stable Daytrace community code-signing identity. Gatekeeper notarization remains intentionally separate."
