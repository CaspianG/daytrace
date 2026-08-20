import test from "node:test";
import assert from "node:assert/strict";
import privacy from "../electron/lib/privacy.cjs";

test("private browser windows are filtered", () => {
  assert.equal(privacy.shouldRecord({ app: "Google Chrome", title: "New Incognito Tab - Google Chrome" }, { trackingEnabled: true, excludePrivateWindows: true, excludedApps: [] }), false);
});

test("excluded applications are filtered before writes", () => {
  assert.equal(privacy.shouldRecord({ app: "Bitwarden", title: "Vault" }, { trackingEnabled: true, excludePrivateWindows: true, excludedApps: ["Bitwarden"] }), false);
});

test("Daytrace never records its own window", () => {
  const settings = { trackingEnabled: true, excludePrivateWindows: true, excludedApps: [] };
  assert.equal(privacy.shouldRecord({ app: "Daytrace", process: "Daytrace", title: "Daytrace" }, settings), false);
  assert.equal(privacy.shouldRecord({ app: "Daytrace Tracker", process: "Daytrace.Tracker" }, settings), false);
  assert.equal(privacy.shouldRecord({ app: "Daytrace", process: "local.daytrace.desktop", title: "Today" }, settings), false);
  assert.equal(privacy.shouldRecord({ app: "Daytrace", process: "local.daytrace.desktop", title: "Сегодня" }, settings), false);
});
