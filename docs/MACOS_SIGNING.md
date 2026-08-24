# macOS signing and notarization

Daytrace currently publishes an explicitly documented, non-notarized universal macOS build because the project does not yet have Apple Developer Program credentials. Starting with v0.5.12, the tagged workflow imports a repository-protected self-signed **Daytrace Community Release** identity and uses it to keep the app and Accessibility helper code identities stable across community updates. This identity is not trusted by Apple and does not remove Gatekeeper warnings. The workflow still disables Apple notarization, places `MACOS_INSTALL.txt` in the DMG, and directs users to Finder's supported **Open** flow instead of telling them to disable Gatekeeper.

The community key is stored only in GitHub Actions secrets `DAYTRACE_COMMUNITY_MAC_CERT_P12` and `DAYTRACE_COMMUNITY_MAC_CERT_PASSWORD`. Public releases fail closed when either secret is absent. Pull requests can still build an ad-hoc package for structural testing, but only tagged artifacts receive the stable community identity. The final-artifact hook removes an erroneous parent `ElectronAsarIntegrity` value from the nested collector plist, fixes the collector ABI bundle version at `1.0.0`, signs the helper, re-seals the parent app, and verifies both with `codesign --deep --strict` before ZIP or DMG publication.

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
codesign --verify --deep --strict --verbose=2 "Daytrace.app/Contents/Helpers/Daytrace Activity Collector.app"
codesign --verify --strict --verbose=2 "Daytrace.app/Contents/Helpers/Daytrace Activity Collector.app/Contents/MacOS/Daytrace Activity Collector"
```

An Apple Developer Program membership is required to remove the warning. A self-signed or ad-hoc certificate cannot create Apple distribution trust and must not be presented as notarization. The community certificate is used only for stable local code identity; users should not install it as a trusted root. Until real Apple credentials exist, releases must state this distinction in the release body, both README languages, the companion text asset, and the DMG itself.
