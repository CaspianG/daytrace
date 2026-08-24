## Downloads

### What is new in v0.5.11

- Fixed the apparent freeze when returning from Settings to Overview on a large local history. Daytrace now sends a compact shell state to the renderer and requests only the selected day.
- Fixed the split-second context, chart, and summary substitution. A revision-aware day cache keeps the last correct view visible, background refreshes never clear it, and stale IPC replies cannot win a race.
- Large sessions now mount activity in 12-row batches and continue near the viewport. The new release gate seeds 900 contexts and rejects flicker, eager oversized DOM output, renderer payload regressions, slow navigation, and long tasks.
- In a validated isolated release smoke, Overview reopened in 18 ms, the longest renderer task was 116 ms, only 24 activity rows were mounted, and the shell state was 16.9 KB. The retained verification profile dropped from about 2.3 MB to 57 KB. These are bounded regression measurements, not a hardware-independent promise.
- The final Windows package gate passed at 0.023% average sampled Electron CPU, 84.9 MiB peak private memory, and 0.1 MiB short-run growth. The packaged renderer, preload, IPC, local-state, browser-host, and transactional-update payload checks all passed.

- The unsigned universal macOS build now re-seals `Daytrace Collector.app` after Electron combines x64 and arm64. Release checks open the final ZIP and mount the final DMG to verify the helper signature and bilingual install guide before publication.

- Fixed the recurring startup-training loop. First-run setup now belongs to the local profile, not the app version: completed users are migrated silently and updates never reopen it.
- New profiles receive one five-step animated guide over the real Daytrace interface after setup. It is marked shown as soon as it opens so a crash cannot make it persistent, and it remains replayable from the sidebar and Settings without resetting language, model choice, history, or permissions.
- Startup and timeline work were reduced substantially: cached hourly files and selected days, one-pass session preparation, context-classification caches, and calmer state broadcasts avoid full dashboard rebuilds for anonymous input counters. The aggregate history-quality scan also waits until the app has settled and the computer is idle on external power.
- Optional semantic analysis now revisits only new hashed contexts, never keeps raw titles in its review ledger, waits for five minutes of idle time and external power, runs at most every 30 minutes, uses one CPU thread, and exits after the bounded batch.
- A reproducible audit rejected two roughly 129 MiB multilingual q8 models because both were materially less precise on the held-out RU/EN check than the current roughly 48 MiB specialized pair. This release does not ship a heavier option without measured benefit.
- The Windows background gate measured 0.032% average sampled Electron CPU, 0.392% main-process CPU, 125.6 MiB peak private memory, and 0.1 MiB short-run growth. On the retained local verification history, cold 48-hour state took about 499 ms and a cached selected day about 0.01 ms.
- Settings and first run now show the same honest Built-in / Signal pack / Semantic comparison plus an aggregate-only device-local coverage check. Personal agreement is shown only against explicit corrections and remains visibly preliminary below 15 corrected contexts.
- Localized visual checks cover the quick guide in English and Russian, light and dark themes, the analysis step, and compact desktop windows.

- Observed facts and inferred purpose are now separate, with visible evidence, confidence, an ambiguity review queue, correction preview, and Undo. Ambiguous activity is no longer silently labeled Personal.
- Day briefs include observed themes, likely completed work, open loops, interruptions, and returns. Local questions support exact dates and period comparisons in English and Russian without an LLM.
- Optional local intelligence can be added through a separately downloaded classifier pinned to this release and checked against an app-embedded SHA-256, plus a foreground-only Chromium companion. Both remain local; Incognito, page contents, credentials, query strings, fragments, and background tabs are rejected.
- JSON/CSV exports, encrypted `.daytrace` backup/restore, and built-in self-diagnostics are available in Settings.
- Windows updates now use a staged readiness handshake and automatic rollback, matching the crash-safe macOS outcome check.
- Background stability now has an automated release gate on both platforms: the collector restarts with bounded backoff, a crashed renderer is recreated without a restart loop, lock/suspend stops collection until resume, macOS permission probes back off instead of spawning continuously, and the browser companion self-recovers after a local endpoint failure. The Windows verification run measured 0.065% average Electron CPU with 87.1 MiB peak private memory; Windows collector load is measured separately and physical-Mac numbers are not inferred from it.

- **Windows:** use `Daytrace-Setup-…-x64.exe` for guided installation or the portable ZIP.
- **macOS 12+: read this first.** The current universal DMG/ZIP is not signed with an Apple Developer ID and is not notarized. Gatekeeper may say Apple cannot verify that Daytrace is free of malware. This warning is expected because the project does not currently have Apple signing credentials; it is not a VirusTotal or antivirus detection result.

For macOS, read the bundled `MACOS_INSTALL.txt` asset or follow the [English guide](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL.md) / [русская инструкция](https://github.com/CaspianG/daytrace/blob/main/docs/MACOS_INSTALL_RU.md). Use Finder's **Control-click → Open** flow, or **System Settings → Privacy & Security → Open Anyway** if macOS still blocks the first launch. Do not disable Gatekeeper globally.

Verify the downloaded installer against `SHA256SUMS.txt` in this release before opening it. Daytrace should be downloaded only from this official repository.

The exact v0.5.6 Windows Setup (`SHA-256 56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a`) has a public [VirusTotal report](https://www.virustotal.com/gui/file/56d1da401a82580e7e3f120fdc0e862b1fb289d8b1ce756b251fb87438b6793a?nocache=1): 0 of 65 engines flagged it when the scan completed on August 24, 2026. This is point-in-time multi-engine evidence for that exact hash, not an absolute guarantee or a replacement for the published checksum and source review.

After Daytrace opens on macOS, choose **Register collector** for Accessibility access. macOS adds the named **Daytrace Collector** helper — the exact process that observes active application/window metadata — to the list. Enable that entry, not an old Daytrace or Daytrace 2 switch. Daytrace verifies the permission with a real collector launch; the setup is dismissible and never locks access to settings or existing history. This permission is unrelated to the Gatekeeper warning.

Starting with v0.5.4, future updates use a verified one-click replacement and relaunch flow, including automatic repair of a numbered copy such as `Daytrace 2.app`. The one-time transition from v0.5.3 or older still opens the DMG because the older installed binary does not contain this updater. Unsigned builds can still require **Daytrace Collector** consent again when that helper changes; macOS does not allow an app to grant that permission to itself.

Starting with v0.5.5, the previous app is not removed until the new version has rendered and shown a real window. A Gatekeeper block, startup failure, or missing readiness signal restores and reopens the previous copy automatically. The local updater outcome log is `~/Library/Logs/Daytrace/updater.log` and contains no activity data.

Starting with v0.5.6, Windows updates also keep the previous installation until the replacement has shown a non-empty window, reached the local preload/IPC bridge, and returned a one-time readiness token. Before Daytrace closes, the SHA-256-verified Setup payload is extracted to an isolated staging directory and checked for safe paths, exact product version, required files, size, reparse points, and available disk space. A failed preflight leaves the existing installation untouched; a startup failure or missing readiness signal restores and reopens it automatically. If Windows cannot use this transactional path safely, the verified interactive Setup opens as a fallback.

Windows packages run a post-packaging white-window/IPC smoke test. The release check also extracts `Daytrace.exe`, `resources/app.asar`, the Incognito-disabled browser companion manifest, and its lean native host from the actual NSIS artifact and requires their SHA-256 values to match the packaged application exactly. A framed end-to-end host/pipe round trip must store a synthetic foreground context. Optional model weights are not bundled or loaded by default; they are separate release assets with app-pinned SHA-256 values.
