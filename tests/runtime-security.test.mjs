import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import security from "../electron/lib/runtime-security.cjs";

const root = path.resolve(import.meta.dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("renderer trust is exact in packaged and development builds", () => {
  const rendererFile = path.join(root, "dist", "client", "index.html");
  const rendererUrl = pathToFileURL(rendererFile).href;
  assert.equal(security.isTrustedRendererUrl(rendererUrl, { packaged: true, rendererFile }), true);
  assert.equal(security.isTrustedRendererUrl(pathToFileURL(path.join(root, "README.md")).href, { packaged: true, rendererFile }), false);
  assert.equal(security.isTrustedRendererUrl("https://example.com/", { packaged: true, rendererFile }), false);
  assert.equal(security.isTrustedRendererUrl("http://127.0.0.1:5173/settings", { packaged: false }), true);
  assert.equal(security.isTrustedRendererUrl("http://127.0.0.1.evil.test:5173/", { packaged: false }), false);
  assert.equal(security.isTrustedRendererUrl("http://localhost:5173/", { packaged: false }), false);
});

test("only documented project links may leave the desktop window", () => {
  assert.equal(security.isSafeExternalUrl("https://github.com/CaspianG/daytrace/releases/latest"), true);
  assert.equal(security.isSafeExternalUrl(`https://www.virustotal.com/gui/file/${"a".repeat(64)}`), true);
  assert.equal(security.isSafeExternalUrl("https://github.com/other/project"), false);
  assert.equal(security.isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(security.isSafeExternalUrl("http://github.com/CaspianG/daytrace"), false);
});

test("IPC requires both the expected webContents and a trusted URL", () => {
  const rendererFile = path.join(root, "dist", "client", "index.html");
  const webContents = { getURL: () => pathToFileURL(rendererFile).href };
  const event = { sender: webContents, senderFrame: { url: pathToFileURL(rendererFile).href } };
  assert.doesNotThrow(() => security.assertTrustedIpcSender(event, { expectedWebContents: webContents, packaged: true, rendererFile }));
  assert.doesNotThrow(() => security.assertTrustedIpcSender(event, { expectedWebContents: [{}, webContents], packaged: true, rendererFile }));
  assert.throws(() => security.assertTrustedIpcSender({ ...event, senderFrame: { url: "https://example.com/" } }, { expectedWebContents: webContents, packaged: true, rendererFile }), /Untrusted IPC sender/);
  assert.throws(() => security.assertTrustedIpcSender(event, { expectedWebContents: {}, packaged: true, rendererFile }), /Untrusted IPC sender/);
});

test("desktop runtime blocks navigation, webviews, and tracker restart races", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /will-navigate/);
  assert.match(mainSource, /will-attach-webview/);
  assert.match(mainSource, /render-process-gone/);
  assert.match(mainSource, /Semantic analysis process exited/);
  assert.match(mainSource, /assertTrustedIpcSender/);
  assert.match(mainSource, /trackerStarting/);
  assert.match(mainSource, /tracker-recovery-scheduled/);
  assert.match(mainSource, /TRACKER_READY_TIMEOUT_MS/);
  assert.match(mainSource, /renderer-recovery-scheduled/);
  assert.match(mainSource, /powerMonitor\.on\("suspend"/);
  assert.match(mainSource, /powerMonitor\.on\("resume"/);
  assert.match(mainSource, /powerMonitor\.on\("lock-screen"/);
  assert.match(mainSource, /powerMonitor\.on\("unlock-screen"/);
  assert.match(mainSource, /change\?\.kind === "input" \|\| change\?\.kind === "click"/);
  assert.match(mainSource, /broadcastDeadline <= deadline/);
  assert.match(mainSource, /broadcastTimer = null; broadcastDeadline = 0; sendState\(\)/);
  assert.match(mainSource, /powerMonitor\.getSystemIdleTime\(\) >= 5 \* 60 && !powerMonitor\.isOnBatteryPower\(\)/);
  assert.match(mainSource, /analysisQuality\.schedule\(60_000\)/);
  assert.match(mainSource, /if \(tracker !== child\) return/);
  assert.match(mainSource, /const shouldRun = Boolean\(store\?\.settings\.trackingEnabled\)/);
  assert.match(mainSource, /\["collectWindowTitles", "collectInputCounts", "collectBrowserTabCount"\]\.includes\(key\)\) restartTracker\(\)/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /connect-src[^;]*127\.0\.0\.1/);
});

test("collection settings remain configurable while tracking is paused and surface failures", () => {
  assert.doesNotMatch(rendererSource, /disabled=\{Boolean\(pending\) \|\| !state\.settings\.trackingEnabled\}/);
  assert.match(rendererSource, /className="settings-action-error" role="alert"/);
  assert.match(rendererSource, /catch \{\s*setActionError\(t\.settings\.actionFailed\)/);
});

test("onboarding is profile-scoped and the replayable quick guide never relies on browser storage", () => {
  assert.match(mainSource, /CURRENT_ONBOARDING_VERSION/);
  assert.match(mainSource, /daytrace:complete-quick-tour/);
  assert.match(mainSource, /--daytrace-reset-quick-tour/);
  assert.match(mainSource, /RESET_QUICK_TOUR && store\.settings\.onboardingComplete/);
  assert.match(mainSource, /daytrace:acknowledge-review-guidance/);
  assert.match(preloadSource, /completeQuickTour/);
  assert.match(preloadSource, /acknowledgeReviewGuidance/);
  assert.match(rendererSource, /quickTourComplete/);
  assert.doesNotMatch(rendererSource, /!state\.settings\.onboardingComplete \|\| Number\(state\.settings\.onboardingVersion/);
  assert.match(rendererSource, /review-coach/);
  assert.doesNotMatch(rendererSource, /localStorage/);
});

test("theme choice stays in the local settings bridge and respects the operating system", () => {
  const themeSource = fs.readFileSync(path.join(root, "src", "theme.js"), "utf8");
  assert.match(mainSource, /daytrace:set-theme/);
  assert.match(mainSource, /nativeTheme\.themeSource/);
  assert.match(mainSource, /setTitleBarOverlay/);
  assert.match(preloadSource, /setTheme/);
  assert.match(themeSource, /prefers-color-scheme: dark/);
  assert.match(themeSource, /prefers-reduced-motion: reduce/);
  assert.match(themeSource, /startViewTransition/);
  assert.doesNotMatch(themeSource, /localStorage|sessionStorage/);
});

test("macOS Accessibility uses the collector identity and never blocks the application shell", () => {
  assert.match(mainSource, /MAC_ACCESSIBILITY_TARGET = "Daytrace Collector"/);
  assert.match(mainSource, /accessibilityMainTrusted: mainAccessibilityTrusted\(\)/);
  assert.doesNotMatch(mainSource, /process\.platform === "darwin" && !accessibilityTrusted\(\).*permission-required/);
  assert.match(rendererSource, /const showMacPermission =/);
  assert.match(rendererSource, /className="permission-close"/);
  assert.doesNotMatch(rendererSource, /return <MacPermissionOnboarding/);
});
