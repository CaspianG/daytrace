import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import security from "../electron/lib/runtime-security.cjs";

const root = path.resolve(import.meta.dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
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
  assert.throws(() => security.assertTrustedIpcSender({ ...event, senderFrame: { url: "https://example.com/" } }, { expectedWebContents: webContents, packaged: true, rendererFile }), /Untrusted IPC sender/);
  assert.throws(() => security.assertTrustedIpcSender(event, { expectedWebContents: {}, packaged: true, rendererFile }), /Untrusted IPC sender/);
});

test("desktop runtime blocks navigation, webviews, and tracker restart races", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /will-navigate/);
  assert.match(mainSource, /will-attach-webview/);
  assert.match(mainSource, /assertTrustedIpcSender/);
  assert.match(mainSource, /trackerStarting/);
  assert.match(mainSource, /if \(tracker !== child\) return/);
  assert.match(mainSource, /const shouldRun = Boolean\(store\?\.settings\.trackingEnabled\)/);
  assert.match(mainSource, /if \(key !== "excludePrivateWindows"\) restartTracker\(\)/);
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
