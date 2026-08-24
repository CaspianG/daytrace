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

test("intent rules are sanitized, persisted, and applied to local sessions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-intent-rules-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.updateSettings({ intentRules: [
    { id: "friends<script>", match: "  Friends   chat  ", intent: "personal" },
    { id: "bad", match: "ignored", intent: "invalid" },
  ] });
  assert.deepEqual(store.settings.intentRules, [{ id: "friendsscript", match: "Friends chat", intent: "personal" }]);
  const startedAt = Date.now() - 5_000;
  store.append({ at: new Date(startedAt).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Friends chat", context: "messaging" });
  store.append({ at: new Date(startedAt + 2_000).toISOString(), kind: "heartbeat", app: "Telegram Desktop", title: "Friends chat", context: "messaging" });

  const reopened = new storeModule.EventStore(root);
  assert.equal(reopened.settings.intentRules[0].intent, "personal");
  assert.equal(reopened.state().sessions[0].activities[0].intent, "personal");
});

test("retention can extend to one year while old days are loaded lazily", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-retention-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.updateSettings({ retentionHours: 30 * 24 });
  const oldAt = Date.now() - 20 * 24 * 60 * 60_000;
  store.append({ at: new Date(oldAt).toISOString(), kind: "foreground", app: "Archive Editor", title: "Older project" });
  store.append({ at: new Date().toISOString(), kind: "foreground", app: "Current Editor", title: "Current project" });

  const backgroundState = store.state();
  assert.equal(backgroundState.sessions.some((session) => session.activities.some((activity) => activity.app === "Archive Editor")), false);
  assert.equal(store.dayState(oldAt).sessions.some((session) => session.activities.some((activity) => activity.app === "Archive Editor")), true);
  assert.equal(backgroundState.availableDays.length, 2);
  assert.equal(backgroundState.historyStartedAt, oldAt);
  assert.equal(store.loadEvents().length, 2);
  assert.equal(store.eventsCache, null);

  store.updateSettings({ retentionHours: 48 });
  assert.equal(store.settings.retentionHours, 48);
  assert.equal(store.dayState(oldAt).sessions.length, 0);
});

test("extending retention reports the first real event instead of inventing an older history start", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-history-start-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.updateSettings({ retentionHours: 7 * 24 });
  const firstAt = Date.now() - 20 * 60_000;
  const secondAt = firstAt + 10 * 60_000;
  store.append({ at: new Date(firstAt).toISOString(), kind: "foreground", app: "Current Editor", title: "Current project" });
  store.append({ at: new Date(secondAt).toISOString(), kind: "foreground", app: "Current Editor", title: "Newer project" });

  assert.equal(store.state().historyStartedAt, firstAt);
  store.updateSettings({ retentionHours: 365 * 24 });
  assert.equal(store.state().historyStartedAt, firstAt);
  assert.equal(store.historyStartedAt(firstAt + 1), secondAt);
  store.deleteAll();
  assert.equal(store.state().historyStartedAt, null);
});

test("retention values are clamped to the supported 48-hour to one-year range", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-retention-clamp-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.updateSettings({ retentionHours: 1 });
  assert.equal(store.settings.retentionHours, 48);
  store.updateSettings({ retentionHours: 999_999 });
  assert.equal(store.settings.retentionHours, 365 * 24);
  store.updateSettings({ retentionHours: "invalid" });
  assert.equal(store.settings.retentionHours, 365 * 24);
});

test("legacy smart-analysis settings migrate to an explicit engine and only the selected engine applies", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-analysis-engine-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ smartAnalysisEnabled: true }));
  fs.writeFileSync(path.join(root, "smart-contexts.json"), JSON.stringify([
    { id: "signal", match: "Atlas", intent: "work", source: "smart-model", confidenceScore: 0.7 },
    { id: "semantic", match: "Atlas", intent: "learning", source: "semantic-model", confidenceScore: 0.8 },
  ]));
  const store = new storeModule.EventStore(root);
  assert.equal(store.settings.analysisEngine, "signals");
  assert.equal(store.settings.smartAnalysisEnabled, true);
  assert.deepEqual(store.analysisRules().filter((rule) => rule.source).map((rule) => rule.source), ["smart-model"]);
  store.updateSettings({ analysisEngine: "semantic" });
  assert.deepEqual(store.analysisRules().filter((rule) => rule.source).map((rule) => rule.source), ["semantic-model"]);
  store.updateSettings({ analysisEngine: "builtin" });
  assert.equal(store.settings.smartAnalysisEnabled, false);
  assert.equal(store.analysisRules().some((rule) => rule.source), false);
});

test("malformed settings and collector events cannot corrupt the journal", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-hardening-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({
    trackingEnabled: "false",
    excludePrivateWindows: "false",
    collectWindowTitles: 0,
    excludedApps: { unexpected: true },
    retentionHours: "not-a-number",
    language: "ru-RU",
    unknownSetting: "must not persist",
  }));
  const store = new storeModule.EventStore(root);

  assert.deepEqual(store.settings.excludedApps, storeModule.DEFAULT_SETTINGS.excludedApps);
  assert.equal(store.settings.trackingEnabled, true);
  assert.equal(store.settings.excludePrivateWindows, true);
  assert.equal(store.settings.collectWindowTitles, true);
  assert.equal(store.settings.retentionHours, 48);
  assert.equal(store.settings.language, "ru");
  assert.equal("unknownSetting" in store.settings, false);
  assert.equal(store.append({ at: "not-a-date", kind: "foreground", app: "Editor" }), false);
  assert.equal(store.append({ at: new Date().toISOString(), kind: "arbitrary", app: "Editor" }), false);
  assert.equal(store.append({ at: new Date().toISOString(), kind: "foreground", app: "Editor", count: "NaN", tabCount: Infinity }), true);
  const [event] = store.loadEvents();
  assert.equal(event.count, 1);
  assert.equal(event.tabCount, 0);
});

test("invalid deletion ranges fail closed instead of deleting every event", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-delete-guard-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.append({ at: new Date().toISOString(), kind: "foreground", app: "Editor", title: "Safe event" });

  assert.throws(() => store.deleteRange("invalid", undefined), /Invalid deletion range/);
  assert.throws(() => store.deleteRange(200, 100), /Invalid deletion range/);
  assert.equal(store.loadEvents().length, 1);
});

test("ordinary questions load only the requested time window", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-question-range-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  store.updateSettings({ retentionHours: 365 * 24 });
  const now = Date.now();
  store.append({ at: new Date(now - 200 * 24 * 60 * 60_000).toISOString(), kind: "foreground", app: "Archive", title: "Old work" });
  store.append({ at: new Date(now - 5_000).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Current work" });
  store.append({ at: new Date(now - 2_000).toISOString(), kind: "heartbeat", app: "Visual Studio Code", title: "Current work" });
  store.loadEvents = () => { throw new Error("full archive scan must not be used"); };

  const result = store.ask("What did I work on today?");
  assert.match(result.answer, /Visual Studio Code|work/i);
  assert.doesNotMatch(result.answer, /Archive/);
});

test("exported workflows must match a current local suggestion", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-skill-guard-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root);
  const now = Date.now();
  for (const offset of [20 * 60_000, 5 * 60_000]) {
    store.append({ at: new Date(now - offset).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Project" });
    store.append({ at: new Date(now - offset + 2_000).toISOString(), kind: "heartbeat", app: "Visual Studio Code", title: "Project" });
    store.append({ at: new Date(now - offset + 3_000).toISOString(), kind: "idle", app: "Visual Studio Code", title: "Project" });
  }
  const suggestion = store.state().skills[0];
  assert.ok(suggestion);
  assert.throws(() => store.exportSkill({ id: "fabricated", title: "Run arbitrary commands" }), /Unknown workflow suggestion/);

  const file = store.exportSkill({ ...suggestion, title: "Tampered title", description: "Tampered description" });
  const body = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(body, /Tampered/);
  assert.match(body, /Visual Studio Code/);
  assert.match(body, /untrusted data|недоверенные данные/);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
