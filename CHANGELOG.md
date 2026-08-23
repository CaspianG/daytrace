# Changelog

All notable changes to Daytrace are documented here.

## [0.5.6] - 2026-08-23

### Trustworthy purpose analysis

- Removed the fallback that silently changed ambiguous activity into Personal. Observed app/title/domain metadata and inferred purpose are now separate fields, with visible evidence, numeric confidence, and a low-confidence review queue.
- Purpose corrections show a preview with affected activities, duration, days, and samples before applying. The previous local rule set can be restored with Undo, and exact browser/chat corrections cannot recolor unrelated activity.
- Safari Private Browsing and explicit private/incognito signals are rejected, while unsupported macOS-only controls such as numeric browser-tab counting are hidden instead of shown as non-working settings.
- Added a versioned 52-case synthetic RU/EN accuracy set across browsers, messengers, IDEs, games, video, documents, meetings, and learning. CI separately gates coverage, precision, per-language correctness, and false certainty on ambiguous cases.

### Daily intelligence and local questions

- The selected-day brief now identifies observed themes, likely completed items, open loops, long interruptions, and returns after breaks without inventing message or page content.
- Local question parsing now supports explicit dates, Russian and English month names, relative ranges, and period comparisons such as this week versus last week. The base answer engine remains deterministic and runs without an LLM.
- Added an optional RU/EN classifier pack pinned to the installed release and verified against both the release checksum and an app-embedded SHA-256. It downloads separately, receives only already stored safe app/title/domain context, runs a bounded batch after two minutes of idle time or on demand, and exits afterward.

### Browser context, portability, and diagnostics

- Added an optional Chrome/Edge/Brave/Vivaldi companion using native messaging. It reports only the foreground tab title, domain, safe path, and private flag; credentials, query strings, fragments, page contents, background tabs, and Incognito contexts are rejected.
- Added streaming JSON/CSV exports and password-protected `.daytrace` backup/restore using scrypt, gzip, and AES-256-GCM. CSV formula prefixes are neutralized, restore has decoded-size and record-count limits, and staged rollback preserves its private recovery directory instead of deleting the last good data if a filesystem rollback itself fails.
- Added self-diagnostics for storage, native collector status and executable, macOS Accessibility, active titles, idle boundaries, private filtering, autostart, browser companion, and the optional model.
- Added a safe allowlisted `npm run clean` command for generated build/test/native artifacts. It validates every resolved target remains inside the repository and never removes source, local journals, or arbitrary directories.

### Performance and interface

- The smart classifier is disabled by default, runs only in a short-lived idle worker, and never stays resident. Browser companion transport is event-driven and now uses a debounced one-shot native host instead of keeping a second Electron process alive; retained history remains lazy and smart-context batches are bounded.
- Hardware acceleration is enabled by default to reduce renderer CPU, with `--disable-gpu` or `DAYTRACE_SOFTWARE_RENDERING=1` retained as a white-window compatibility fallback.
- Added fully localized English and Russian controls and screenshots for evidence, review, smart analysis, browser context, diagnostics, export, encrypted backup, and restore. Embedded local fonts are now permitted by the renderer CSP while script, frame, object, media, and network restrictions remain unchanged.

### Crash-safe Windows updates

- Windows updates no longer assume that a successfully started installer or process means the new application works. The verified Setup payload is extracted and validated in an isolated sibling staging directory before Daytrace closes.
- The helper checks archive paths, extracted size and file count, reparse points, available disk space, required packaged files, and the exact `Daytrace.exe` product version before accepting the transaction.
- A parent/helper preparation handshake prevents the desktop process from quitting until the replacement is ready. The installed folder is then renamed to a unique backup, the staged application takes the original path, and the previous version is retained until the replacement proves readiness.
- The replacement must render a non-empty visible window, reach the preload/IPC/local-state bridge, return a one-time 256-bit token from the private update directory, and remain alive before the backup is removed.
- Extraction failures, locked folders, startup crashes, missing readiness, and immediate exits keep or restore the previous installation and reopen it automatically. Rollback also terminates exact-path Electron and native-tracker processes that could hold installation files open.
- The existing Windows uninstaller and icon are preserved so Start Menu/Desktop shortcuts, uninstall behavior, the installation path, and local activity data remain intact.
- Protected/custom installations, insufficient disk space, or unavailable Windows archive support fail safely to the already SHA-256-verified interactive Setup while the existing app remains available. The fallback now has correct English and Russian Windows-specific guidance instead of macOS DMG text.

### Verification

- Added real PowerShell integration tests for preflight failure without mutation, readiness timeout rollback, a successful ready/stable replacement, paths containing spaces, and preservation of installer-maintenance files.
- The post-package Windows smoke now extracts `Daytrace.exe` and `resources/app.asar` from the actual NSIS Setup and compares their SHA-256 values with `win-unpacked`, proving that the published artifact contains the exact payload used by transactional updates.

## [0.5.5] - 2026-08-20

### Crash-safe macOS updates

- The macOS updater no longer treats a successful `open` request as proof that the new application works. The replacement must now render and show a non-empty Daytrace window, then return a one-time cryptographic readiness token.
- The previous application remains backed up while the helper waits up to 90 seconds for that signal. A Gatekeeper block, startup crash, empty renderer, or missing signal terminates the failed copy, restores the previous bundle, and reopens it automatically.
- Readiness files are accepted only inside the exact private update work directory and cannot be reused or redirected to an arbitrary path.
- A persistent local log at `~/Library/Logs/Daytrace/updater.log` records readiness and rollback outcomes without activity data.
- macOS CI now includes real helper integration scenarios using temporary app bundles, system `ditto`, and Launch Services `open`, covering both successful confirmation and timeout rollback.

### Security, accuracy, and resource use

- The Electron renderer can no longer navigate to an arbitrary site and retain Daytrace IPC privileges. Navigation, popups, webviews, IPC senders, and executable content are restricted to the exact local renderer and a strict Content Security Policy.
- The macOS bundle identifier is now recognized as Daytrace itself, so opening the application never records its own settings or timeline window.
- Collector restarts are serialized and old child-process exit events cannot clear a newer collector reference or create duplicate background trackers.
- Collection and private-window settings remain editable while tracking is paused, failed changes now show an in-app error, and privacy-only changes no longer restart the native collector.
- Generic browser windows such as New Tab now close the previous page context instead of incorrectly charging later activity to an old title.
- Invalid event timestamps, event kinds, settings, and deletion ranges fail closed. A malformed retention update preserves the previous period instead of silently falling back to 48 hours and pruning history. Local journals, settings, generated workflows, and updater logs use private owner-only permissions on macOS.
- Normal questions read only their requested time window instead of synchronously loading a one-year archive. Retention pruning skips recent hourly files without rereading their contents.
- A synthetic one-year archive of 8,760 hourly files opened in 63.3 ms on the Windows verification machine; recent state took 106.2 ms and a today-only question 28.7 ms while reading 48 events.
- The self-contained Windows native collector keeps ReadyToRun startup optimization but removes debug payloads and unused localized framework resources. The verified output fell from 160.1 MiB across 464 files to 144.5 MiB across 242 files without requiring a separate .NET installation.
- Desktop packages keep only the English and Russian Electron locales that Daytrace supports instead of shipping dozens of unused Chromium locale packs.
- Windows release builds now launch the already packaged executable and require a non-empty renderer plus a working preload/IPC/local-state bridge, catching packaged-only white-window failures before publication.
- Generated workflows must match a current local suggestion and treat observed application labels as untrusted data rather than executable instructions.
- GitHub Actions are pinned to reviewed commits, release write access is limited to the publishing job, weekly CodeQL analysis covers JavaScript and C#, and Dependabot now monitors npm and workflow dependencies.

## [0.5.4] - 2026-08-18

### One-click macOS updates

- After downloading and SHA-256 verification, Daytrace now mounts the universal DMG read-only, checks the embedded app version, replaces the installed application, and relaunches it automatically.
- Updating from a numbered duplicate such as `Daytrace 2.app` repairs the installation back to the canonical `/Applications/Daytrace.app` instead of preserving two conflicting copies.
- The replacement helper backs up both the canonical and duplicate copies and restores the previous app if copying or relaunching fails. If the Applications folder is not writable, Daytrace opens the verified DMG and clearly labels the manual Finder flow as a fallback.
- Because current public builds are not Developer ID signed, macOS can still ask the user to enable Accessibility again after an update; Daytrace cannot silently grant that protected permission.

## [0.5.3] - 2026-08-18

### macOS permission recovery

- Daytrace now identifies the exact running app bundle and detects copies launched as `Daytrace 2`, directly from a mounted DMG, or outside an Applications folder.
- Accessibility setup explains that the collector status and permission card refer to the same macOS permission, shows the mismatched copy and path, and offers an in-app restart after access is enabled.
- The macOS update handoff now explicitly tells users to quit the old app and choose **Replace**, not **Keep Both**, preventing stale copies from receiving the Accessibility grant.

## [0.5.2] - 2026-08-17

### Day navigation and insights

- The header now shows the actual selected date, uses DST-safe previous/next navigation, and opens a localized calendar that marks days containing retained activity.
- Day changes and the calendar use short native-feeling transitions in the existing Calm Chronicle visual language.
- The hourly activity rhythm is now interactive and reveals active time, leading purpose, and top applications for the selected hour.

### Retention and performance

- Retention is configurable to 48 hours, 7 days, 30 days, 90 days, or one year; shortening it prunes out-of-window events immediately and visibly warns that deleted data cannot be restored.
- Historical days are loaded lazily from hourly local JSONL files. Background state and workflow suggestions remain bounded to the recent 48-hour analysis window even when the archive is longer.
- Local question parsing can address explicitly requested ranges up to the one-year retention limit.

### macOS

- First launch now presents a dedicated, localized Accessibility setup instead of silently leaving the tracker at zero.
- The permission action invokes the native macOS prompt, opens the exact Accessibility settings pane, and polls only while permission is pending.
- Returning to Daytrace after granting access starts the native collector automatically; collector exit code 77 is now shown as a permission requirement rather than a generic error.

### Release integrity

- Tagged releases now keep macOS available while Apple Developer ID credentials are unavailable: they deliberately build without signing/notarization and publish a prominent Gatekeeper explanation in both README languages, the GitHub Release body, a companion text asset, the mounted DMG, and the root of the macOS ZIP.
- The documented first-launch flow uses Finder's supported **Open** / **Open Anyway** controls, asks users to verify `SHA256SUMS.txt`, and explicitly avoids global Gatekeeper disabling. The strict signed/notarized build and verification path remains available for the future.

### Updates

- A compact bottom-left status now shows update checking, download percentage, verification, installation, restart, macOS DMG handoff, and failures without requiring a trip to Settings.
- Silent Windows updates now use NSIS update mode, preserve the current installation directory, and force Daytrace to reopen after installation.

### Purpose accuracy

- Manual timeline corrections are now scoped to one native application or an exact browser/chat app-title context and are never allowed to train neighboring activities.
- Removed one-sided neighbor propagation and replaced broad session coloring with guarded context inference that requires multiple independent automatic signals.
- Opaque activities now receive a visible low-confidence best estimate after semantic, service, application, sequence, and repeated-context analysis, so automatic day summaries no longer default to unknown purpose.
- Added specific recognition for Google Cloud, AWS, Azure, Aéza, VirusTotal, ChatCut, Telemost, finance-learning contexts, and Steam offers while eliminating a Russian false positive that interpreted generic special offers as work.
- The real retained 48-hour journal was re-evaluated locally: no automatic activity remained unknown, and the Scrap Mechanic correction stayed confined to game-related contexts instead of recoloring ChatGPT, Telegram, cloud consoles, or other applications.
- Popular game processes and common packaged-game executable names are recognized as entertainment instead of remaining unknown.
- Visible active-window titles now cover more development, installation, debugging, infrastructure, search, comparison, and reference contexts in English and Russian.
- On the same local 48-hour diagnostic journal, unknown observed time fell to 1.7%; the remaining opaque chat titles stay honest rather than being assigned an unsupported purpose.

## [0.5.1] - 2026-08-16

### Fixed

- Returning to the same foreground window after a long idle period, sleep, or an overnight gap now creates a new activity instead of reconnecting the entire gap as active time.
- Windows and macOS collectors emit explicit local `idle` and `resume` boundaries after five minutes without system input, independently of whether anonymous input counters are enabled.
- A six-minute signal-gap guard repairs the same failure mode while reading legacy journals and protects against suspended collectors or missed boundary events.
- macOS now emits minute heartbeats while present, preserving passive reading and video viewing without counting an abandoned window indefinitely.
- macOS input batches are attributed to the window that was active before a foreground switch rather than the newly focused window.

### Interface

- Gaps of at least five minutes between observed sessions appear as localized **Break / Перерыв** entries in the newest-first timeline and are excluded from active time, application totals, purpose charts, and local answers.

### Verification

- Added regression coverage for an unchanged browser tab left overnight, explicit idle/resume events, and 90 minutes of passive viewing followed by inactivity.

## [0.5.0] - 2026-08-16

### Added

- A layered on-device purpose classifier for popular video, streaming, social, shopping, learning, developer, office, creative, remote-work, and communication contexts in English and Russian.
- Service-aware overrides that distinguish cases such as an educational YouTube lecture, YouTube Studio work, and ordinary entertainment viewing.
- Context learning inside the local retention window: repeated active titles can reuse a strongly established purpose, while short opaque intervals can use matching surrounding or dominant-session evidence.
- Explicit confidence reasons for recognized services, specialized applications, repeated contexts, adjacent activity, coherent sessions, conflicts, and genuinely insufficient evidence.
- A broad automated classifier matrix covering browsers, Telegram chat titles, work tools, creative applications, learning tools, games, media, and conflicting contexts.

### Accuracy and privacy

- On the same 48-hour local journal used for development verification, unclassified foreground time fell from 98.7% with v0.4.2 rules to 28.4% with v0.5.0 rules. This is a diagnostic result for one machine, not a universal accuracy claim.
- General-purpose Telegram, browser, and AI-assistant contexts are not assigned a blanket application stereotype. Opaque or conflicting contexts remain unknown unless local sequence, repetition, or a user rule supports an inference.
- Classification still uses only the foreground app, visible active-window title, aggregate activity, and local history. Message bodies, page contents, URLs, typed text, and background-tab titles are never read or stored.

## [0.4.2] - 2026-08-16

### Fixed

- Update checks now fall back to the public GitHub Releases feed when the unauthenticated API rate limit is exhausted, instead of leaving Settings in an error state.
- The fallback remains fail-closed: it accepts only the official repository tag, exact platform filename, and matching entry in the release's `SHA256SUMS.txt` manifest.

### Release integrity

- Release automation now publishes `SHA256SUMS.txt` alongside every Windows and macOS artifact for token-free verified updates.

## [0.4.1] - 2026-08-16

### Added

- Automatic update checks against the official GitHub Releases feed 15 seconds after launch and every six hours while online, with a low-frequency retry after an offline check.
- A bilingual update panel in Settings with installed/latest versions, last-check time, download progress, and a manual **Check for updates** action.
- A bottom-left **Update** action that appears only when a newer stable release has the exact expected Windows or macOS artifact.
- Verified update downloads: Daytrace enforces the expected artifact name and repository URL, size bounds, and the SHA-256 digest published by GitHub before opening an installer.

### Platform behavior

- Windows downloads the NSIS installer, verifies it, starts the silent per-user update, and exits so files can be replaced.
- macOS downloads and verifies the universal DMG, then opens it for the user; unsigned builds intentionally do not attempt an unsafe silent self-replacement.
- No activity journal, window title, question, rule, or settings data is included in update requests.

## [0.4.0] - 2026-08-16

### Added

- Independent purpose classification for work, learning, personal activity, entertainment, and genuinely unknown time; application type is no longer treated as purpose.
- Per-activity confidence, evidence, and purpose breakdowns for sessions and day-overview charts.
- One-click purpose corrections in the timeline and reusable local substring rules for chats, page titles, projects, and keywords.
- Purpose-aware local questions such as “How long did I study?” and purpose-specific splits for Telegram, browsers, and other applications.

### Accuracy and privacy

- Browsers, messengers, editors, office tools, design tools, and AI assistants stay unknown without title, sequence, or user-rule evidence.
- Conflicting title signals are not forced into a category; short ambiguous transitions inherit surrounding context only when both sides agree, and remain low-confidence.
- Corrections are sanitized, capped, stored in local settings, and applied to timelines, summaries, answers, and workflow suggestions without reading message bodies or page contents.

### Verification

- Added classifier, persistence, localization, conservative-fallback, sequence-context, and purpose-aware Q&A tests.
- Verified the packaged Windows build at 0.039% total CPU over 30 seconds, 199 MiB combined background working set without a renderer process, and 1.14 seconds to a validated non-empty window on the test machine.

## [0.3.1] - 2026-08-16

### Fixed

- Removed the artificial five-second minimum from every title-change fragment, preventing noisy Telegram and browser titles from inflating observed time.
- Work blocks no longer inherit the first application's category. Overview totals are calculated per activity, and mixed blocks are labelled explicitly.
- Legacy system-window events are filtered during sessionization, so already-recorded PickerHost and ShellExperienceHost rows no longer affect the timeline.
- Replaced speculative category descriptions with neutral, evidence-based explanations that never invent tasks, requirements, emails, or API discussions.

### Added

- Conservative categories for browser activity, AI assistants, audio production, remote work, and genuinely unknown activity.
- Classification confidence and per-block category breakdown in the local data model.
- Automated checks that README, README_RU, package metadata, and changelog all name the same current version.

### Performance

- Replaced global keyboard and mouse hooks with a once-per-second anonymous active-time sample.
- Replaced the noisy system-wide title-change hook with a five-second check of only the foreground window.
- Kept exact foreground-switch events and the once-per-minute Windows browser-tab count, while eliminating per-keystroke and mouse-move wakeups.

## [0.3.0] - 2026-08-16

### Added

- Universal macOS 12+ build with a native Swift Accessibility collector and explicit permission status.
- Launch-at-login settings for installed Windows and macOS applications.
- Independent controls for active-window titles, anonymous input counts, browser-tab counts, and private-window filtering.
- Visible collector health and an explanation of how deterministic local answers interpret each question.
- English and Russian settings screenshots and macOS release artifacts in GitHub Actions.

### Fixed

- Private-window filtering is now a working switch instead of a read-only checkbox.
- Stable-title debouncing and system-window filtering prevent Telegram, Chrome, and Windows shell noise from inflating context-switch counts.
- Session duration and context-switch metrics now use observed activities rather than raw event spans.
- Combined date/time questions such as “yesterday morning” and explicit ranges are parsed correctly.

### Performance

- The desktop window is shown before the native tracker starts, removing the tracker from the critical launch path.
- Windows uses a non-single-file native collector, avoiding startup extraction and AV blocking.
- Event and derived-state caches avoid rereading the complete 48-hour journal on every update.
- Renderer broadcasts are coalesced to 12 seconds; a hidden renderer is released after a 30-second quick-reopen window.
- Frontend build tools are no longer shipped inside the desktop package.

## [0.2.0] - 2026-08-15

### Added

- Complete day overview with active time, application count, context-switch count, maximum observed browser tabs, focus distribution, top applications, and hourly activity rhythm.
- Previous-day navigation inside the 48-hour retention window.
- Low-frequency browser tab-count sampling through Windows UI Automation; tab titles outside the active window, URLs, and form values are never read.
- Active-title change tracking for browser tabs and Telegram chats without waiting for the whole application window to change.
- Idle-aware heartbeats that preserve long reading and review sessions without recording inactive computer time indefinitely.
- Context-aware local answers for browser use, Telegram activity, time allocation, and task switching.

### Changed

- The day timeline is reverse chronological by default, with the newest session and newest activity first.
- “Day history” is now “Day overview” in both English and Russian.
- The morning-only panel is now a selected-day summary.

### Privacy and performance

- Accessibility enrichment stores only the active window title, a coarse context type, and a bounded numeric tab count.
- Message contents, typed text, URLs, non-active tab titles, screenshots, audio, clipboard data, and key identities remain outside the journal.
- Browser accessibility sampling runs once per minute and only for the active browser window.

## [0.1.1] - 2026-08-15

### Fixed

- Packaged renderer assets now use relative `file://` paths, fixing the white application window.
- Startup verification now rejects a renderer that contains no visible content.
- Timeline artwork is bundled through Vite instead of relying on a broken absolute asset path.

### Performance

- Aggregate input flushes are batched every 10 seconds instead of every 2 seconds.
- Timeline refreshes are coalesced to 5 seconds and skipped while the window is hidden or minimized.
- Daytrace never records its own window, preventing a feedback loop while reviewing history.
- Event loading no longer performs redundant retention rewrites; scheduled pruning remains active.
- Closing or minimizing releases the renderer while the native tracker remains available from the tray.
- A single-instance guard restores the existing window without spawning duplicate trackers.

## [0.1.0] - 2026-08-15

### Added

- Windows foreground-application tracking through native WinEvent hooks.
- Aggregate mouse-click and keypress counts without coordinates, key identities, or text.
- Local hourly JSONL storage with automatic 48-hour retention.
- Private-browser title filtering and configurable application exclusions.
- Workday timeline, focus-session grouping, morning summary, and local Q&A.
- Repeated-flow detection with local `SKILL.md` draft export.
- Pause, per-session deletion, and delete-all controls.
- One-click per-user NSIS installer and portable ZIP distribution.
- English and Russian project documentation.
