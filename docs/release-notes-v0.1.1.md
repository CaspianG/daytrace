# Daytrace v0.1.1 — renderer and efficiency fix

This maintenance release fixes the white window in the packaged application and substantially reduces background wakeups and UI work.

## Fixed

- Packaged JS and CSS now resolve correctly through `file://` paths.
- Startup verifies that the renderer contains visible content instead of accepting an empty window.
- The decorative timeline artwork is bundled with the renderer instead of using a broken absolute path.

## Lower background activity

- Input events are aggregated into 10-second batches.
- UI state updates are coalesced to 5 seconds and skipped while minimized or hidden.
- Daytrace excludes its own process from activity history.
- Retention pruning remains scheduled, without rescanning and rewriting files on every read.
- Minimizing or closing the window releases the renderer and keeps tracking available from the system tray.
- Launching Daytrace again restores the existing instance instead of starting duplicate trackers.

In a 30-second minimized packaged-app check, Daytrace used 0.0000% average total CPU, wrote 112 bytes, and held about 100 MB of private memory. Results vary by Windows version and workload.

## Install

Download `Daytrace-Setup-0.1.1-x64.exe` and run it. It safely upgrades v0.1.0 and preserves local history.

The installer is not code-signed yet, so Windows SmartScreen may show **Unknown publisher**.
