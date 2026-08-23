import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import storeModule from "../electron/lib/event-store.cjs";
import diagnostics from "../electron/lib/diagnostics.cjs";

test("platform capabilities hide unsupported macOS tab counts without hiding real features", () => {
  const mac = diagnostics.platformCapabilities("darwin", true);
  assert.equal(mac.browserTabCount, false);
  assert.equal(mac.browserCompanion, true);
  assert.equal(mac.autoStart, true);
  assert.equal(mac.encryptedBackup, true);
  const windows = diagnostics.platformCapabilities("win32", true);
  assert.equal(windows.browserTabCount, true);
});

test("self-diagnostics verifies local storage, collector, and Safari private filtering", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-diagnostics-"));
  const tracker = path.join(root, "tracker");
  fs.writeFileSync(tracker, "stub");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(path.join(root, "data"));
  const result = diagnostics.runDiagnostics({ store, platform: "darwin", packaged: true, trackerStatus: "running", trackerExecutable: tracker, accessibilityTrusted: true, autoStartEnabled: false });
  assert.equal(result.checks.find((item) => item.id === "storage").status, "pass");
  assert.equal(result.checks.find((item) => item.id === "collector").status, "pass");
  assert.equal(result.checks.find((item) => item.id === "private").status, "pass");
  assert.equal(result.checks.find((item) => item.id === "accessibility").status, "pass");
});
