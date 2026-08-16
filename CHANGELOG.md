# Changelog

All notable changes to Daytrace are documented here.

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
