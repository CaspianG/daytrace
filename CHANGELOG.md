# Changelog

All notable changes to Daytrace are documented here.

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
