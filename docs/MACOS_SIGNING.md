# macOS signing and notarization

Daytrace release builds must be signed with a **Developer ID Application** certificate and notarized by Apple. The tagged release workflow deliberately fails instead of publishing a macOS artifact when these credentials are absent.

Configure these GitHub Actions repository secrets:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12` certificate
- `MAC_CSC_KEY_PASSWORD`: password used when exporting that certificate
- `APPLE_API_KEY`: base64-encoded App Store Connect `.p8` key
- `APPLE_API_KEY_ID`: App Store Connect key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID

Instead of the three App Store Connect API-key secrets, electron-builder also accepts the complete `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` set. The API-key method is preferred for CI.

The workflow passes the certificate to electron-builder as `CSC_LINK` and enables its built-in notarization with the App Store Connect API key. It then refuses to publish unless all of these checks pass against the actual packaged app:

```bash
codesign --verify --deep --strict --verbose=2 Daytrace.app
spctl --assess --verbose=2 --type exec Daytrace.app
xcrun stapler validate Daytrace.app
codesign --verify --strict --verbose=2 Daytrace.app/Contents/Resources/tracker/macos/daytrace-tracker
```

An Apple Developer Program membership is required. A self-signed or ad-hoc certificate cannot remove the Gatekeeper warning and must not be presented as a production fix.
