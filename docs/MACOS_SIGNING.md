# macOS signing and notarization

Daytrace currently publishes an explicitly documented unsigned universal macOS build because the project does not yet have Apple Developer Program credentials. The tagged workflow uses `npm run dist:mac`, disables identity discovery and notarization, places `MACOS_INSTALL.txt` in the DMG, and publishes the same guide beside the artifacts. Users are directed to Finder's supported **Open** flow instead of being told to disable Gatekeeper.

The strict `npm run dist:mac:release` path is retained for the future. It must be used only after a real **Developer ID Application** certificate and complete Apple notarization credentials are configured.

Configure these GitHub Actions repository secrets:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12` certificate
- `MAC_CSC_KEY_PASSWORD`: password used when exporting that certificate
- `APPLE_API_KEY`: base64-encoded App Store Connect `.p8` key
- `APPLE_API_KEY_ID`: App Store Connect key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID

Instead of the three App Store Connect API-key secrets, electron-builder also accepts the complete `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` set. The API-key method is preferred for CI.

That strict path passes the certificate to electron-builder as `CSC_LINK`, enables its built-in notarization, and refuses to complete unless all of these checks pass against the actual packaged app:

```bash
codesign --verify --deep --strict --verbose=2 Daytrace.app
spctl --assess --verbose=2 --type exec Daytrace.app
xcrun stapler validate Daytrace.app
codesign --verify --deep --strict --verbose=2 "Daytrace.app/Contents/Helpers/Daytrace Collector.app"
codesign --verify --strict --verbose=2 "Daytrace.app/Contents/Helpers/Daytrace Collector.app/Contents/MacOS/Daytrace Collector"
```

An Apple Developer Program membership is required to remove the warning. A self-signed or ad-hoc certificate cannot remove it and must not be presented as a production fix. Until the real credentials exist, releases must remain explicit about their unsigned status in the release body, both README languages, the companion text asset, and the DMG itself.
