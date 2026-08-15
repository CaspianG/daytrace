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
