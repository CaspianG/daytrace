# Install Daytrace on macOS without Apple notarization

Daytrace supports macOS 12 and newer on both Apple Silicon and Intel Macs. The current universal build is distributed without an Apple Developer ID signature and without Apple notarization because the project does not currently have those Apple credentials. Starting with v0.5.12, it has a stable self-signed community code identity only so macOS can recognize the same local collector across Daytrace updates; this is not an Apple-trusted signature.

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

Choose **Register collector**. Daytrace launches the embedded helper so macOS adds **Daytrace Activity Collector** under **System Settings → Privacy & Security → Accessibility**, then opens that pane. Enable that exact entry and return to Daytrace. The app verifies the grant with a real collector launch; use **Check again** if needed. The permission window is dismissible, so settings and existing history remain available even while collection is disabled. Keep one installed `/Applications/Daytrace.app`; when updating, choose **Replace**, not **Keep Both**.

If the switch is already on but Daytrace still shows the permission screen:

1. If only **Daytrace**, **Daytrace 2**, or the old **Daytrace Collector** is enabled, that is not the current collector identity.
2. Update to v0.5.13 or newer. Permission checks and real collection now launch the same **Daytrace Activity Collector.app** through LaunchServices, so a different executable or the Daytrace UI cannot produce a false success or denial.
3. Click **Repair Daytrace permission** once. Daytrace resets only `io.github.caspiang.daytrace.collector`, registers the exact current helper again, and opens Accessibility. No other application's permission is changed.
4. Enable the newly registered **Daytrace Activity Collector** entry. The helper reports its own authenticated result and collection starts automatically; **Check again** remains available for an explicit retry.
5. A close button and **Open Daytrace without tracking** always keep the interface available.

The collector is a named nested helper at `Daytrace.app/Contents/Helpers/Daytrace Activity Collector.app` with bundle ID `io.github.caspiang.daytrace.collector`. This removes the previous mismatch where the interface asked for permission for `Daytrace.app` while a different executable performed and checked the protected operation.

## Updates after installation

Starting with v0.5.4, **Settings → Updates → Update** is the normal one-click path. Daytrace downloads the official universal DMG, verifies its SHA-256, mounts it read-only, checks the embedded app version, replaces `/Applications/Daytrace.app`, removes a numbered running duplicate such as `Daytrace 2.app`, and reopens Daytrace. The old copy is kept as a temporary rollback until the new app launches successfully. Finder opens only if macOS does not allow automatic replacement.

Starting with v0.5.5, “launches successfully” means that the new application has rendered and shown a real non-empty window and returned a protected one-time readiness token. A successful `open` request alone is not enough. If Gatekeeper blocks the new bundle, the renderer fails, or no readiness signal arrives within 90 seconds, Daytrace terminates that copy, restores the previous application, and reopens it automatically. The local outcome log is `~/Library/Logs/Daytrace/updater.log`; it never contains activity history.

The transition from v0.5.3 or older is a one-time exception: those installed binaries only know how to open the DMG, so perform the replacement described above once. Updates from v0.5.4 onward use the automatic path, while v0.5.5 adds readiness-confirmed rollback safety.

v0.5.12 is a one-time permission migration from the former **Daytrace Collector** to the newly named **Daytrace Activity Collector**. Click **Register collector** and enable the new entry once; the old entry can be removed. The helper now has a fixed bundle version, no longer inherits the changing parent `app.asar` hash, launches through macOS LaunchServices, and is signed by the same protected community key on every public build. This is designed to preserve its Accessibility identity across later community updates. Daytrace still verifies the exact helper after every check and shows a real result instead of treating a button press as success.

v0.5.13 fixes the remaining case where registration used the helper app but live tracking or a quick check could run its executable through a different path. Checks and collection now use the same LaunchServices app identity and an authenticated loopback readiness channel. If macOS already retained an inconsistent TCC record, **Repair Daytrace permission** performs the one exact reset and re-registration inside the app.

## Why the warning cannot be removed in code

Apple removes this first-launch warning for software distributed outside the App Store only after the app is signed with a paid **Developer ID Application** certificate and accepted by Apple's notarization service. A self-signed or ad-hoc signature cannot create that trust. The community identity used from v0.5.12 stabilizes local permission identity only; it does not bypass Gatekeeper, and users must not install it as a trusted root. The project keeps a strict Apple-signed release path ready for the future, and every current package includes this guide.

See [macOS signing and notarization](MACOS_SIGNING.md) for the maintainer-side details.
