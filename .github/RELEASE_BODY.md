## Downloads

### What is new in v0.5.7

- Settings now offer three honest local analysis modes: a zero-download built-in classifier, the expanded ~6 KB RU/EN Signal pack 1.1, and an optional ~48 MB RU+EN semantic model. The semantic bundle is explicitly downloaded, checksum-verified, limited to one CPU thread, run only as short-lived per-language workers, and blocked from network inference. Its MIT and Apache-2.0 license files are published beside the weights.
- The release includes a bilingual semantic regression gate and an actual Electron/WASM RU+EN inference smoke test. The UI reports how many ambiguous contexts were reviewed, refined, and changed instead of presenting a model toggle with no visible effect.
- macOS Accessibility is now checked by the real native collector rather than the Electron UI process. The helper is embedded under `Daytrace.app/Contents/MacOS`, permission is rechecked on return, stale grants have exact recovery steps, and the setup screen can no longer lock users out of the interface.
- Extending retention now shows the timestamp of the first event actually stored instead of presenting the newly selected policy window as historical data that already exists.

- Observed facts and inferred purpose are now separate, with visible evidence, confidence, an ambiguity review queue, correction preview, and Undo. Ambiguous activity is no longer silently labeled Personal.
- Day briefs include observed themes, likely completed work, open loops, interruptions, and returns. Local questions support exact dates and period comparisons in English and Russian without an LLM.
- Optional local intelligence can be added through a separately downloaded classifier pinned to this release and checked against an app-embedded SHA-256, plus a foreground-only Chromium companion. Both remain local; Incognito, page contents, credentials, query strings, fragments, and background tabs are rejected.
- JSON/CSV exports, encrypted `.daytrace` backup/restore, and built-in self-diagnostics are available in Settings.
- Windows updates now use a staged readiness handshake and automatic rollback, matching the crash-safe macOS outcome check.

- **Windows:** use `Daytrace-Setup-…-x64.exe` for guided installation or the portable ZIP.
- **macOS 12+: read this first.** The current universal DMG/ZIP is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This warning is expected because the project does not currently have Apple signing credentials; it is not a VirusTotal or antivirus detection result.

For macOS, read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder's **Control-click → Open** flow, or **System Settings → Privacy & Security → Open Anyway** if macOS still blocks the first launch. Do not disable Gatekeeper globally.

Verify the downloaded installer against `SHA256SUMS.txt` in this release before opening it. Daytrace should be downloaded only from this official repository.

The exact v0.5.6 Windows Setup (`SHA-256 56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a`) has a public [VirusTotal report](https://www.virustotal.com/gui/file/56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a?nocache=1): 0 of 65 engines flagged it when the scan completed on August 24, 2026. This is point-in-time multi-engine evidence for that exact hash, not an absolute guarantee or a replacement for the published checksum and source review.

After Daytrace opens on macOS, it separately asks for Accessibility access so its local native tracker can observe active application/window metadata. That permission is unrelated to the Gatekeeper warning. The current build checks the grant through the real native collector. If macOS shows an enabled switch but Daytrace still asks, remove all old Daytrace/Daytrace 2 entries in Accessibility, add exactly `/Applications/Daytrace.app`, enable it, return, and click **Check again**. **Open Daytrace without tracking** always allows access to the interface while this is repaired.

Starting with v0.5.4, future updates use a verified one-click replacement and relaunch flow, including automatic repair of a numbered copy such as `Daytrace 2.app`. The one-time transition from v0.5.3 or older still opens the DMG because the older installed binary does not contain this updater. Unsigned builds can still require Accessibility consent again; macOS does not allow an app to grant that permission to itself.

Starting with v0.5.5, the previous app is not removed until the new version has rendered and shown a real window. A Gatekeeper block, startup failure, or missing readiness signal restores and reopens the previous copy automatically. The local updater outcome log is `~/Library/Logs/Daytrace/updater.log` and contains no activity data.

Starting with v0.5.6, Windows updates also keep the previous installation until the replacement has shown a non-empty window, reached the local preload/IPC bridge, and returned a one-time readiness token. Before Daytrace closes, the SHA-256-verified Setup payload is extracted to an isolated staging directory and checked for safe paths, exact product version, required files, size, reparse points, and available disk space. A failed preflight leaves the existing installation untouched; a startup failure or missing readiness signal restores and reopens it automatically. If Windows cannot use this transactional path safely, the verified interactive Setup opens as a fallback.

Windows packages run a post-packaging white-window/IPC smoke test. The release check also extracts `Daytrace.exe`, `resources/app.asar`, the Incognito-disabled browser companion manifest, and its lean native host from the actual NSIS artifact and requires their SHA-256 values to match the packaged application exactly. A framed end-to-end host/pipe round trip must store a synthetic foreground context. Optional model weights are not bundled or loaded by default; they are separate release assets with app-pinned SHA-256 values.
