import test from "node:test";
import assert from "node:assert/strict";
import privacy from "../electron/lib/privacy.cjs";

test("private browser windows are filtered", () => {
  assert.equal(privacy.shouldRecord({ app: "Google Chrome", title: "New Incognito Tab - Google Chrome" }, { trackingEnabled: true, excludePrivateWindows: true, excludedApps: [] }), false);
});

test("excluded applications are filtered before writes", () => {
  assert.equal(privacy.shouldRecord({ app: "Bitwarden", title: "Vault" }, { trackingEnabled: true, excludePrivateWindows: true, excludedApps: ["Bitwarden"] }), false);
});
