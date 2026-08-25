## Downloads

### What is new in v0.5.13

- Fixed the recurring macOS state where **Daytrace Activity Collector** was enabled in Accessibility but Daytrace still said that permission was missing.
- Permission checks and real collection now launch the exact same nested `Daytrace Activity Collector.app` through macOS LaunchServices. Daytrace no longer checks a different executable path or falls back to the Electron interface process.
- The collector itself reports authenticated readiness, liveness, permission revocation, and safe activity events over a loopback-only local channel. A successful button press or `open` command is never treated as proof that tracking works.
- Added **Repair Daytrace permission** / **Восстановить разрешение Daytrace**. It resets only the TCC record for `io.github.caspiang.daytrace.collector`, then immediately registers that exact helper again; permissions for other applications remain untouched.
- Registration now shows real checking, registering, denied, reset, unavailable, and failure states in English and Russian instead of appearing to accept a click without doing anything.
- Verification passed all 155 cross-platform test cases, desktop/navigation/recovery/low-load gates, the native Windows build, the universal arm64+x64 Swift collector build, stable nested code-signing checks, and inspection of the final macOS ZIP and mounted DMG. The local Windows 12-second background sample measured 0.125% main-process CPU, 0.010% average sampled Electron CPU, 83.8 MiB peak private memory, and no short-run private-memory growth; these are bounded verification numbers, not a promise for every computer.

### Install

- **Windows:** use `Daytrace-Setup-0.5.13-x64.exe` for guided installation or `Daytrace-Portable-0.5.13-x64.zip` for a portable copy.
- **macOS 12+:** use the universal DMG or ZIP. Move `Daytrace.app` to `/Applications` before opening it, and keep only one installed copy.

### Important macOS first-launch note

The current universal macOS build is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This expected warning reflects missing Apple signing credentials; it is not a VirusTotal or antivirus detection result.

Read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder **Control-click → Open**, or **System Settings → Privacy & Security → Open Anyway**. Do not disable Gatekeeper globally.

After Daytrace opens, click **Register collector**. In **System Settings → Privacy & Security → Accessibility**, enable **Daytrace Activity Collector**. Daytrace now detects that exact helper automatically. If the switch is already enabled but collection still does not start, click **Repair Daytrace permission** once and enable the newly registered **Daytrace Activity Collector** entry. The repair affects only Daytrace's collector. The app remains usable without tracking while this permission is being configured.

### Verify the download

Compare the installer with `SHA256SUMS.txt` in this release. Daytrace should be downloaded only from this official repository.

The exact v0.5.6 Windows Setup (`SHA-256 56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a`) has a public [VirusTotal report](https://www.virustotal.com/gui/file/56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a?nocache=1): 0 of 65 engines flagged that exact file when the scan completed on August 24, 2026. This is point-in-time evidence for one hash, not a guarantee for a different release; v0.5.13 has its own checksums in `SHA256SUMS.txt`.

Windows updates also keep the previous installation until the replacement has rendered a non-empty window and completed its local readiness handshake; macOS uses the same readiness-confirmed rollback principle. Failed startup or missing readiness restores and reopens the previous copy. Local history and settings remain outside the application bundle and are not uploaded during installation or update.
