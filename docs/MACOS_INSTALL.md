# Install Daytrace on macOS without Apple notarization

Daytrace supports macOS 12 and newer on both Apple Silicon and Intel Macs. The current universal build is distributed without an Apple Developer ID signature and without Apple notarization because the project does not currently have those Apple credentials.

This means Gatekeeper can display a message such as **“Apple could not verify Daytrace is free of malware”** or **“Daytrace cannot be opened because the developer cannot be verified.”** The message is a trust warning about the missing Apple signature. It does not mean macOS detected malware.

## Before opening the file

1. Download the DMG only from the [official Daytrace releases page](https://github.com/CaspianG/daytrace/releases/latest).
2. Download `SHA256SUMS.txt` from the same release.
3. In Terminal, run `shasum -a 256 ~/Downloads/Daytrace-*-macOS-universal.dmg` and compare the result with the DMG line in `SHA256SUMS.txt`.

The hash must match exactly. Delete the download if it does not.

## Install and open Daytrace

1. Open `Daytrace-…-macOS-universal.dmg`.
2. Drag **Daytrace** to **Applications**.
3. Open Finder and select **Applications**.
4. Control-click or right-click **Daytrace**, then choose **Open**.
5. In the confirmation dialog, choose **Open** again.

If macOS still blocks it:

1. Try to open Daytrace once so macOS records the blocked launch.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to **Security** and find the message that Daytrace was blocked.
4. Click **Open Anyway**, authenticate with your password or Touch ID if requested, then confirm **Open**.

You normally need this exception only for the first launch of that downloaded build. Do not disable Gatekeeper globally and do not paste unrelated quarantine-removal commands from the internet.

## Enable local activity collection

After the app itself opens, Daytrace presents a separate Accessibility setup. This permission lets the native local collector observe the active application and visible active-window metadata. It does not grant cloud access and is unrelated to the Gatekeeper warning.

Choose **Open Accessibility Settings**, enable Daytrace under **System Settings → Privacy & Security → Accessibility**, then return to Daytrace. Keep exactly one installed copy named `/Applications/Daytrace.app`; when updating, choose **Replace**, not **Keep Both**, so macOS does not create `Daytrace 2.app` with a separate permission record. If macOS does not apply the new grant immediately, use **Restart Daytrace** in the app. You can continue without permission, but the timeline remains empty until it is granted.

## Updates after installation

Starting with v0.5.4, **Settings → Updates → Update** is the normal one-click path. Daytrace downloads the official universal DMG, verifies its SHA-256, mounts it read-only, checks the embedded app version, replaces `/Applications/Daytrace.app`, removes a numbered running duplicate such as `Daytrace 2.app`, and reopens Daytrace. The old copy is kept as a temporary rollback until the new app launches successfully. Finder opens only if macOS does not allow automatic replacement.

The transition from v0.5.3 or older is a one-time exception: those installed binaries only know how to open the DMG, so perform the replacement described above once. Updates from v0.5.4 onward use the automatic path.

Because the current public build has no stable Developer ID signature, macOS can still ask you to enable Daytrace in Accessibility again after an update. Daytrace detects this and opens the correct settings pane, but no application is allowed to grant this protected permission to itself.

## Why the warning cannot be removed in code

Apple removes this first-launch warning for software distributed outside the App Store only after the app is signed with a paid **Developer ID Application** certificate and accepted by Apple's notarization service. A self-signed or ad-hoc signature cannot create that trust. The project keeps a strict signed-release path ready for the future, but current public macOS artifacts deliberately identify themselves as unsigned and include this guide.

See [macOS signing and notarization](MACOS_SIGNING.md) for the maintainer-side details.
