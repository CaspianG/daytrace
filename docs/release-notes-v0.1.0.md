# Daytrace v0.1.0 — first public release

Daytrace turns Windows application activity into a local, readable workday timeline. No account, API key, screenshots, audio, clipboard capture, or cloud backend is required.

## Highlights

- one-click per-user Windows installer with Desktop and Start Menu shortcuts;
- portable ZIP for users who do not want installation;
- foreground application and window-title timeline;
- aggregate click and keypress counts without coordinates, keys, or typed text;
- local morning/day/evening questions and summaries;
- private-window filtering, app exclusions, pause, deletion, and 48-hour retention;
- repeated-flow detection with reviewable local `SKILL.md` export.

## Download

- **Recommended:** `Daytrace-Setup-0.1.0-x64.exe`
- **Portable:** `Daytrace-Portable-0.1.0-x64.zip`

SHA-256 checksums for the CI-built files are included directly in the GitHub Release description.

## Known limitations

- Windows x64 only.
- Russian-first interface.
- Private-browser detection is title-based; exclude an entire browser for the strictest boundary.
- This release is not code-signed, so Windows SmartScreen may show **Unknown publisher**.
