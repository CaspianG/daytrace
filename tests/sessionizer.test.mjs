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
