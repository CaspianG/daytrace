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
