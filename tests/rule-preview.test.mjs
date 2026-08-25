import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import storeModule from "../electron/lib/event-store.cjs";

test("rule changes show their exact retained impact and can be undone", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-rule-preview-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  const base = Date.now() - 120_000;
  store.append({ at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Chess club", context: "messaging" });
  store.append({ at: new Date(base + 35_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project Atlas — API", context: "messaging" });
  store.append({ at: new Date(base + 70_000).toISOString(), kind: "idle", app: "Telegram Desktop", title: "Project Atlas — API", context: "messaging" });
  const rules = [{ id: "chess", scope: "context", app: "Telegram Desktop", title: "Chess club", match: "Chess club", intent: "entertainment" }];
  const retainedChess = store.state().sessions.flatMap((session) => session.activities).find((item) => item.title === "Chess club");
  const preview = await store.previewIntentRules(rules);
  assert.equal(preview.affectedActivities, 1);
  assert.ok(retainedChess.durationMs > 0);
  assert.equal(preview.affectedDurationMs, retainedChess.durationMs);
  assert.equal(preview.samples[0].title, "Chess club");
  store.applyIntentRules(rules);
  assert.equal(store.state().sessions.flatMap((session) => session.activities).find((item) => item.title === "Chess club").intent, "entertainment");
  store.undoIntentRules();
  assert.equal(store.state().sessions.flatMap((session) => session.activities).find((item) => item.title === "Chess club").intent, "unknown");
});
