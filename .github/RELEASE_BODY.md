## Downloads

- **Windows:** use `Daytrace-Setup-…-x64.exe` for guided installation or the portable ZIP.
- **macOS 12+: read this first.** The current universal DMG/ZIP is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This warning is expected because the project does not currently have Apple signing credentials; it is not a VirusTotal or antivirus detection result.

For macOS, read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder's **Control-click → Open** flow, or **System Settings → Privacy & Security → Open Anyway** if macOS still blocks the first launch. Do not disable Gatekeeper globally.

Verify the downloaded installer against `SHA256SUMS.txt` in this release before opening it. Daytrace should be downloaded only from this official repository.

After Daytrace opens on macOS, it separately asks for Accessibility access so its local native tracker can observe active application/window metadata. That permission is unrelated to the Gatekeeper warning.

Starting with v0.5.4, future updates use a verified one-click replacement and relaunch flow, including automatic repair of a numbered copy such as `Daytrace 2.app`. The one-time transition from v0.5.3 or older still opens the DMG because the older installed binary does not contain this updater. Unsigned builds can still require Accessibility consent again; macOS does not allow an app to grant that permission to itself.

Starting with v0.5.5, the previous app is not removed until the new version has rendered and shown a real window. A Gatekeeper block, startup failure, or missing readiness signal restores and reopens the previous copy automatically. The local updater outcome log is `~/Library/Logs/Daytrace/updater.log` and contains no activity data.

This release also includes a full privacy and reliability hardening pass: exact renderer and IPC validation, blocked remote navigation and webviews, a strict Content Security Policy, private local file permissions on macOS, duplicate-collector race prevention, self-window exclusion on macOS, fail-closed deletion validation, faster range-limited questions, and corrected browser context boundaries. Repository CI now adds CodeQL and Dependabot coverage with pinned Actions and least-privilege publishing permissions.

Windows packages now run a post-packaging white-window/IPC smoke test, include only the supported English and Russian Electron locales, and use a cleaned self-contained tracker publish with fewer files and no separate .NET installation.
