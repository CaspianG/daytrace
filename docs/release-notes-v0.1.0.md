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

## SHA-256

```text
FC1421C1F219386635C90A9820FB44DE0BCE06DB7D2C0AE1AB941F73D0815683  Daytrace-Setup-0.1.0-x64.exe
AC8C10014D4047F31ADDB03FE3D1699D5C876056D3E2B400331973C627FC39CD  Daytrace-Portable-0.1.0-x64.zip
```

## Known limitations

- Windows x64 only.
- Russian-first interface.
- Private-browser detection is title-based; exclude an entire browser for the strictest boundary.
- This release is not code-signed, so Windows SmartScreen may show **Unknown publisher**.
