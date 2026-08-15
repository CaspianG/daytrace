# Changelog

All notable changes to Daytrace are documented here.

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
