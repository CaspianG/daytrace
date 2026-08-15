# Contributing to Daytrace

Thanks for helping improve a local-first activity history tool.

## Before you start

- Open an issue before a large UI, storage, or capture change.
- Keep changes narrow and independently testable.
- Never add telemetry, analytics, crash upload, cloud sync, remote fonts, or an external API without an explicit design discussion.
- Treat changes to `native/windows-tracker`, `electron/lib/privacy.cjs`, retention, or IPC as security-sensitive.

## Local setup

Requirements: Windows 10/11 x64, Node.js 22+, npm, and .NET 8 SDK.

```powershell
npm ci
npm run dev:desktop
```

## Required checks

```powershell
npm test
npm run test:sites
npm run build
```

For installer or native-tracker changes, also run:

```powershell
npm run dist
```

Then verify the installed application opens a real Daytrace window, starts `Daytrace.Tracker.exe`, creates both shortcuts, and uninstalls without deleting `%APPDATA%\daytrace-local`.

## Privacy review checklist

- Is the data necessary for a visible user feature?
- Is it filtered before disk writes?
- Does a negative test prove excluded/private activity is absent?
- Are exact keys, text values, coordinates, screenshots, audio, and clipboard still impossible to persist?
- Are retention and delete controls preserved?
- Is the limitation documented honestly?

## Pull requests

Describe what changed, why it is needed, its privacy impact, and the checks performed. Include before/after screenshots for visual changes, but never attach real activity data.
