## Downloads

- **Windows:** use `Daytrace-Setup-…-x64.exe` for guided installation or the portable ZIP.
- **macOS 12+: read this first.** The current universal DMG/ZIP is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This warning is expected because the project does not currently have Apple signing credentials; it is not a VirusTotal or antivirus detection result.

For macOS, read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder's **Control-click → Open** flow, or **System Settings → Privacy & Security → Open Anyway** if macOS still blocks the first launch. Do not disable Gatekeeper globally.

Verify the downloaded installer against `SHA256SUMS.txt` in this release before opening it. Daytrace should be downloaded only from this official repository.

After Daytrace opens on macOS, it separately asks for Accessibility access so its local native tracker can observe active application/window metadata. That permission is unrelated to the Gatekeeper warning.
