## Downloads

### What is new in v0.5.12

- The **How the time was used** rows are now clickable. Select Work, Learning, Personal, Entertainment, Mixed, or Ambiguous purpose to open the exact newest-first local intervals behind the total.
- The breakdown shows per-application totals plus each observed app, safe active-window context, time range, duration, and inference confidence. It reads only the selected day already loaded in memory: no model starts and no retained archive is rescanned.
- The dialog is fully localized in English and Russian, supports Light and Dark themes, keyboard focus, Escape/backdrop close, compact desktop windows, reduced motion, and bounded 12-row continuation for long categories.
- macOS now grants Accessibility to a nested helper named **Daytrace Activity Collector** with the stable bundle identifier `io.github.caspiang.daytrace.collector`. Registration launches that exact app through LaunchServices, and the helper itself reports whether its own TCC permission works.
- Users updating from v0.5.11 or earlier must enable the newly named **Daytrace Activity Collector** once. Old Daytrace, Daytrace 2, and Daytrace Collector switches are not the permission used by the new collector. Future community builds preserve this helper identity to avoid another app-version-driven permission reset.
- Final community macOS packaging signs nested bundles from the inside out and verifies the helper identity and signature inside both the universal ZIP and mounted DMG. This is a stable project signature for TCC continuity, not Apple Developer ID notarization.
- Local verification passed 149 unit/integration tests plus desktop, dense-navigation, semantic, recovery, Sites, and bilingual drill-down smokes. The Windows 12-second background gate measured 0.000% main-process CPU, 0.013% average sampled Electron CPU, 84.5 MiB peak private memory, and 0.1 MiB short-run growth. These are bounded verification measurements, not a hardware-independent promise.

### Install

- **Windows:** use `Daytrace-Setup-0.5.12-x64.exe` for guided installation or `Daytrace-Portable-0.5.12-x64.zip` for a portable copy.
- **macOS 12+:** use the universal DMG or ZIP. Move `Daytrace.app` to `/Applications` before opening it, and keep only one installed copy.

### Important macOS first-launch note

The current universal macOS build is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This expected warning reflects missing Apple signing credentials; it is not a VirusTotal or antivirus detection result.

Read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder **Control-click → Open**, or **System Settings → Privacy & Security → Open Anyway**. Do not disable Gatekeeper globally.

After Daytrace opens, click **Register collector**. In **System Settings → Privacy & Security → Accessibility**, enable **Daytrace Activity Collector**, then return to Daytrace and click **Check again**. The app remains usable without tracking while this permission is being configured.

### Verify the download

Compare the installer with `SHA256SUMS.txt` in this release. Daytrace should be downloaded only from this official repository.

The exact v0.5.6 Windows Setup (`SHA-256 56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a`) has a public [VirusTotal report](https://www.virustotal.com/gui/file/56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a?nocache=1): 0 of 65 engines flagged that exact file when the scan completed on August 24, 2026. This is point-in-time evidence for one hash, not a guarantee for a different release; v0.5.12 has its own checksums in `SHA256SUMS.txt`.

Windows updates also keep the previous installation until the replacement has rendered a non-empty window and completed its local readiness handshake; macOS uses the same readiness-confirmed rollback principle. Failed startup or missing readiness restores and reopens the previous copy. Local history and settings remain outside the application bundle and are not uploaded during installation or update.
