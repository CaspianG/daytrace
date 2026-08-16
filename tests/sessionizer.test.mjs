import test from "node:test";
import assert from "node:assert/strict";
import sessionizer from "../electron/lib/sessionizer.cjs";

test("foreground and aggregate input events become a development session", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Daytrace - App.jsx" },
    { at: new Date(base + 60_000).toISOString(), kind: "input", app: "Visual Studio Code", count: 12 },
    { at: new Date(base + 4 * 60_000).toISOString(), kind: "click", app: "Visual Studio Code", count: 2 },
  ];
  const sessions = sessionizer.sessionize(events, base + 5 * 60_000);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].label, "Разработка");
  assert.equal(sessions[0].activities[0].inputs, 12);
});

test("session labels can be generated in English", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [{ at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Daytrace - App.jsx" }];
  const sessions = sessionizer.sessionize(events, base + 60_000, "en");
  assert.equal(sessions[0].label, "Development");
});

test("heartbeats preserve reading time and browser tab metadata", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Google Chrome", title: "Daytrace documentation - Google Chrome", context: "browser", tabCount: 4 },
    { at: new Date(base + 60_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Daytrace documentation - Google Chrome", context: "browser", tabCount: 7 },
  ];
  const sessions = sessionizer.sessionize(events, base + 65_000, "en");
  assert.equal(sessions[0].activities[0].durationMs, 65_000);
  assert.equal(sessions[0].activities[0].tabCount, 7);
  assert.equal(sessions[0].activities[0].title, "Daytrace documentation");
});

test("title changes inside the same app become separate contexts", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project chat - Telegram Desktop", context: "messaging" },
    { at: new Date(base + 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Design chat - Telegram Desktop", context: "messaging" },
  ];
  const sessions = sessionizer.sessionize(events, base + 120_000, "en");
  assert.deepEqual(sessions[0].activities.map((item) => item.title), ["Project chat", "Design chat"]);
});

test("legacy Telegram counters are removed and duplicate contexts merge", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "(1) Project chat @ Team (10082423)", context: "messaging" },
    { at: new Date(base + 20_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project chat @ Team (10082424)", context: "messaging" },
    { at: new Date(base + 40_000).toISOString(), kind: "click", app: "Telegram Desktop", count: 2 },
  ];
  const sessions = sessionizer.sessionize(events, base + 60_000, "en");
  assert.equal(sessions[0].activities.length, 1);
  assert.equal(sessions[0].activities[0].title, "Project chat @ Team");
});

test("rapid title noise does not receive artificial five-second durations", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Chat A", context: "messaging" },
    { at: new Date(base + 100).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Chat B", context: "messaging" },
    { at: new Date(base + 200).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Chat C", context: "messaging" },
    { at: new Date(base + 1_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "Home", context: "browser" },
    { at: new Date(base + 61_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Home", context: "browser" },
  ];
  const sessions = sessionizer.sessionize(events, base + 62_000, "en");
  const telegramMs = sessions.flatMap((item) => item.activities).filter((item) => item.app === "Telegram Desktop").reduce((sum, item) => sum + item.durationMs, 0);
  assert.equal(telegramMs, 0);
  assert.ok(sessions.flatMap((item) => item.activities).find((item) => item.app === "Google Chrome").durationMs >= 60_000);
});

test("returning to the same window after an idle night creates a new activity", () => {
  const base = new Date("2026-08-15T22:00:00+03:00").getTime();
  const morning = base + 10 * 60 * 60_000;
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Google Chrome", title: "Project dashboard", context: "browser" },
    { at: new Date(base + 60_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Project dashboard", context: "browser" },
    { at: new Date(morning).toISOString(), kind: "input", app: "Google Chrome", title: "Project dashboard", context: "browser", count: 1 },
    { at: new Date(morning + 60_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Project dashboard", context: "browser" },
  ];
  const activities = sessionizer.sessionize(events, morning + 70_000, "en").flatMap((session) => session.activities);
  assert.equal(activities.length, 2);
  assert.ok(activities.reduce((sum, activity) => sum + activity.durationMs, 0) < 4 * 60_000);
  assert.ok(activities.every((activity) => activity.durationMs <= 135_000));
});

test("explicit idle and resume events close and reopen the same foreground context", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project chat", context: "messaging" },
    { at: new Date(base + 4 * 60_000).toISOString(), kind: "heartbeat", app: "Telegram Desktop", title: "Project chat", context: "messaging" },
    { at: new Date(base + 5 * 60_000).toISOString(), kind: "idle", app: "Telegram Desktop", title: "Project chat", context: "messaging" },
    { at: new Date(base + 8 * 60 * 60_000).toISOString(), kind: "resume", app: "Telegram Desktop", title: "Project chat", context: "messaging" },
    { at: new Date(base + 8 * 60 * 60_000 + 60_000).toISOString(), kind: "heartbeat", app: "Telegram Desktop", title: "Project chat", context: "messaging" },
  ];
  const activities = sessionizer.sessionize(events, base + 8 * 60 * 60_000 + 70_000, "en").flatMap((session) => session.activities);
  assert.equal(activities.length, 2);
  assert.ok(activities[0].end <= base + 5 * 60_000);
  assert.equal(activities[1].start, base + 8 * 60 * 60_000);
});

test("heartbeats preserve passive viewing until idle detection stops them", () => {
  const base = new Date("2026-08-15T18:00:00+03:00").getTime();
  const events = [{ at: new Date(base).toISOString(), kind: "foreground", app: "Google Chrome", title: "YouTube — documentary", context: "browser" }];
  for (let minute = 1; minute <= 90; minute += 1) {
    events.push({ at: new Date(base + minute * 60_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "YouTube — documentary", context: "browser" });
  }
  events.push({ at: new Date(base + 95 * 60_000).toISOString(), kind: "idle", app: "Google Chrome", title: "YouTube — documentary", context: "browser" });
  const [activity] = sessionizer.sessionize(events, base + 8 * 60 * 60_000, "en").flatMap((session) => session.activities);
  assert.ok(activity.durationMs >= 90 * 60_000);
  assert.ok(activity.durationMs <= 92 * 60_000);
  assert.equal(activity.intent, "entertainment");
});

test("mixed work blocks keep per-activity categories and ignore legacy shell noise", () => {
  const base = new Date("2026-08-15T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "PickerHost", process: "PickerHost", title: "Open" },
    { at: new Date(base + 2_000).toISOString(), kind: "foreground", app: "Telegram Desktop", process: "Telegram", title: "Project", context: "messaging" },
    { at: new Date(base + 62_000).toISOString(), kind: "foreground", app: "Google Chrome", process: "chrome", title: "Home", context: "browser" },
    { at: new Date(base + 122_000).toISOString(), kind: "foreground", app: "ChatGPT", process: "ChatGPT", title: "Chat" },
  ];
  const [session] = sessionizer.sessionize(events, base + 182_000, "en");
  assert.equal(session.label, "Mixed activity");
  assert.deepEqual([...new Set(session.activities.map((item) => item.focus))], ["communication", "browser", "ai"]);
  assert.equal(session.activities.some((item) => item.app === "PickerHost"), false);
});
