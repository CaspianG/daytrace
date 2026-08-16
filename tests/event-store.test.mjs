import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import storeModule from "../electron/lib/event-store.cjs";

test("event store filters private windows and removes data older than 48 hours", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-store-test-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);

  assert.equal(store.append({ at: new Date().toISOString(), kind: "foreground", app: "Google Chrome", process: "chrome", title: "New Incognito Tab - Google Chrome" }), false);
  assert.equal(store.append({ at: new Date().toISOString(), kind: "foreground", app: "Visual Studio Code", process: "code", title: "Daytrace - App.jsx" }), true);

  const oldAt = new Date(Date.now() - 49 * 60 * 60_000).toISOString();
  const oldFile = path.join(root, "events", "old.jsonl");
  fs.writeFileSync(oldFile, `${JSON.stringify({ at: oldAt, kind: "foreground", app: "Old App" })}\n`, "utf8");
  store.prune();

  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(store.loadEvents().length, 1);
});

test("event store keeps only safe accessibility metadata", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-context-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.append({ at: new Date().toISOString(), kind: "heartbeat", app: "Google Chrome", process: "chrome", title: "\u200ELocal\u2068 documentation\u2069", context: "browser", tabCount: 500, value: "must not persist" });
  const [event] = store.loadEvents();
  assert.equal(event.context, "browser");
  assert.equal(event.tabCount, 200);
  assert.equal(event.title, "Local documentation");
  assert.equal("value" in event, false);
});

test("collection switches and private-window setting are enforced before disk writes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-settings-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);

  store.updateSettings({ collectWindowTitles: false, collectInputCounts: false, collectBrowserTabCount: false, excludePrivateWindows: false });
  assert.equal(store.append({ at: new Date().toISOString(), kind: "input", app: "Editor", title: "Secret", count: 4 }), false);
  assert.equal(store.append({ at: new Date().toISOString(), kind: "foreground", app: "Google Chrome", process: "chrome", title: "Private Browsing", context: "browser", tabCount: 9 }), true);
  const [event] = store.loadEvents();
  assert.equal(event.title, "");
  assert.equal(event.tabCount, 0);
  assert.equal(store.settings.excludePrivateWindows, false);
});
