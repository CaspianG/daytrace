import test from "node:test";
import assert from "node:assert/strict";
import serviceModule from "../electron/lib/accessibility-service.cjs";

const { ACCESSIBILITY_SETTINGS_URL, createAccessibilityService } = serviceModule;

test("non-macOS platforms are trusted without prompting or polling", async () => {
  let prompts = 0;
  let opens = 0;
  const service = createAccessibilityService({
    platform: "win32",
    isTrusted: () => { prompts += 1; return false; },
    openExternal: async () => { opens += 1; },
  });
  assert.equal(service.check(), true);
  assert.equal(await service.request(), true);
  assert.equal(prompts, 0);
  assert.equal(opens, 0);
});

test("macOS request prompts, opens the Accessibility pane, and detects consent", async () => {
  let trusted = false;
  let prompted = false;
  let opened = "";
  let poll = null;
  const changes = [];
  const service = createAccessibilityService({
    platform: "darwin",
    isTrusted: (prompt) => { prompted ||= prompt; return trusted; },
    openExternal: async (url) => { opened = url; },
    onChange: (value) => changes.push(value),
    setIntervalFn: (callback) => { poll = callback; return { unref() {} }; },
    clearIntervalFn: () => { poll = null; },
  });

  assert.equal(await service.request(), false);
  assert.equal(prompted, true);
  assert.equal(opened, ACCESSIBILITY_SETTINGS_URL);
  assert.equal(typeof poll, "function");
  trusted = true;
  poll();
  assert.equal(service.check(), true);
  assert.equal(poll, null);
  assert.deepEqual(changes, [false, true]);
});
