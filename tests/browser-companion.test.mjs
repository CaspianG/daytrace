import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nodeNet from "node:net";
import companion from "../electron/lib/browser-companion.cjs";

const extensionWorker = fs.readFileSync(new URL("../browser-extension/service-worker.js", import.meta.url), "utf8");

test("browser context strips secrets and rejects private or untrusted contexts", () => {
  const safe = companion.safeBrowserContext({
    type: "context",
    at: new Date().toISOString(),
    browser: "Google Chrome",
    title: "Daytrace pull request",
    domain: "github.com",
    url: "https://github.com/CaspianG/daytrace/pull/42?token=secret#review",
    private: false,
  });
  assert.equal(safe.domain, "github.com");
  assert.equal(safe.urlPath, "/CaspianG/daytrace/pull/42");
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(companion.safeBrowserContext({ type: "context", at: new Date().toISOString(), browser: "Google Chrome", title: "Private", domain: "example.com", url: "https://example.com", private: true }), null);
  assert.equal(companion.safeBrowserContext({ type: "context", at: new Date().toISOString(), browser: "Unknown app", title: "Page", domain: "example.com", url: "https://example.com" }), null);
});

test("browser companion is event-driven and leaves no second Electron process resident", () => {
  assert.match(extensionWorker, /sendNativeMessage/);
  assert.match(extensionWorker, /setTimeout\(\(\) => void sendActiveTab\(force\), 250\)/);
  assert.match(extensionWorker, /chrome\.windows\.get\(tab\.windowId\)/);
  assert.match(extensionWorker, /browserWindow\?\.focused/);
  assert.doesNotMatch(extensionWorker, /connectNative/);
  assert.doesNotMatch(extensionWorker, /setInterval/);
});

test("native-messaging frame is length-prefixed and bounded", () => {
  const frame = companion.encodeNativeMessage({ ok: true });
  assert.equal(frame.readUInt32LE(0), frame.length - 4);
  assert.deepEqual(JSON.parse(frame.subarray(4).toString("utf8")), { ok: true });
  assert.throws(() => companion.encodeNativeMessage({ value: "x".repeat(companion.MAX_NATIVE_MESSAGE_BYTES) }), /too large/i);
});

test("local companion socket authenticates and forwards only sanitized context", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-browser-service-"));
  const accepted = [];
  const service = new companion.BrowserCompanionService(root, (context) => { accepted.push(context); return true; }, { platform: process.platform });
  t.after(() => { service.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  await service.start();
  const config = JSON.parse(fs.readFileSync(path.join(root, "browser-host.json"), "utf8"));
  const response = await new Promise((resolve, reject) => {
    const socket = nodeNet.createConnection(config.address);
    let data = "";
    socket.once("error", reject);
    socket.on("data", (chunk) => { data += chunk; });
    socket.once("end", () => resolve(JSON.parse(data.trim())));
    socket.once("connect", () => socket.write(`${JSON.stringify({ token: config.token, message: { type: "context", at: new Date().toISOString(), browser: "Microsoft Edge", title: "API documentation", domain: "example.com", url: "https://example.com/docs?q=private" } })}\n`));
  });
  assert.equal(response.ok, true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].urlPath, "/docs");
  assert.equal(service.status().lastContextAt > 0, true);
});

test("a listening companion reports runtime failure and removes its stale endpoint", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-browser-recovery-"));
  const failures = [];
  const service = new companion.BrowserCompanionService(root, () => true, {
    platform: process.platform,
    onFailure: (error) => failures.push(error.message),
  });
  t.after(() => { service.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  await service.start();
  const server = service.server;
  server.emit("error", new Error("synthetic runtime failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.status().running, false);
  assert.deepEqual(failures, ["synthetic runtime failure"]);
  assert.equal(fs.existsSync(path.join(root, "browser-host.json")), false);
});

test("macOS host installation writes only declared per-user manifests", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-browser-host-"));
  const home = path.join(root, "home");
  const executable = path.join(root, "Daytrace");
  fs.writeFileSync(executable, "stub");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = companion.installNativeHost({ root, executable, platform: "darwin", home });
  assert.equal(installed.installed.length, 4);
  for (const file of installed.installed) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(manifest.name, companion.HOST_NAME);
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${companion.EXTENSION_ID}/`]);
    assert.equal(manifest.path, path.resolve(executable));
  }
});

test("Windows host installation points Chromium at the lean native collector and records its local data root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-browser-win-host-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "Daytrace.Tracker.exe");
  fs.writeFileSync(executable, "synthetic executable");
  const calls = [];
  const installed = companion.installNativeHost({
    root,
    executable,
    platform: "win32",
    runRegistry: (...args) => calls.push(args),
  });
  const manifest = JSON.parse(fs.readFileSync(installed.manifest, "utf8"));
  assert.equal(manifest.path, path.resolve(executable));
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.at(-1)[1].slice(0, 6), ["ADD", "HKCU\\Software\\Daytrace\\BrowserHost", "/v", "DataRoot", "/t", "REG_SZ"]);
  assert.equal(calls.at(-1)[1].includes(path.resolve(root)), true);
});
