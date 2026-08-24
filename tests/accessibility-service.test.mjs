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
    setTimeoutFn: (callback) => {
      poll = async () => { poll = null; return callback(); };
      return { unref() {} };
    },
    clearTimeoutFn: () => { poll = null; },
  });

  assert.equal(await service.request(), false);
  assert.equal(prompted, true);
  assert.equal(opened, ACCESSIBILITY_SETTINGS_URL);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof poll, "function");
  trusted = true;
  await poll();
  assert.equal(service.check(), true);
  assert.equal(poll, null);
  assert.deepEqual(changes, [false, true]);
});

test("macOS uses the native collector probe instead of the Electron process result", async () => {
  let collectorTrusted = false;
  let mainProcessChecks = 0;
  const probes = [];
  const service = createAccessibilityService({
    platform: "darwin",
    isTrusted: () => { mainProcessChecks += 1; return true; },
    probeTrusted: async (prompt) => { probes.push(prompt); return collectorTrusted; },
    openExternal: async () => {},
  });

  assert.equal(await service.refresh(false), false);
  assert.equal(service.check(), false);
  collectorTrusted = true;
  assert.equal(await service.refresh(false), true);
  assert.equal(service.check(), true);
  assert.deepEqual(probes, [false, false]);
  assert.equal(mainProcessChecks, 0);
});

test("macOS opens Accessibility settings while the collector prompt remains alive", async () => {
  let finishPrompt;
  let checks = 0;
  const order = [];
  const service = createAccessibilityService({
    platform: "darwin",
    isTrusted: () => false,
    probeTrusted: (prompt) => {
      order.push(prompt ? "prompt" : "check");
      if (!prompt) { checks += 1; return false; }
      return new Promise((resolve) => { finishPrompt = resolve; });
    },
    openExternal: async () => { order.push("settings"); },
    setTimeoutFn: () => ({ unref() {} }),
    clearTimeoutFn: () => {},
  });

  const request = service.request();
  while (!finishPrompt) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["check", "prompt", "settings"]);
  assert.equal(await request, false);
  finishPrompt(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.check(), true);
  assert.equal(checks, 1);
});

test("macOS permission polling is single-flight and exponentially backs off", async () => {
  const scheduled = [];
  let active = 0;
  let peak = 0;
  const service = createAccessibilityService({
    platform: "darwin",
    isTrusted: () => false,
    probeTrusted: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return false;
    },
    openExternal: async () => {},
    intervalMs: 2_000,
    maximumIntervalMs: 30_000,
    setTimeoutFn: (callback, delay) => { scheduled.push({ callback, delay }); return { unref() {} }; },
    clearTimeoutFn: () => {},
  });

  await service.refresh(false);
  service.watch();
  service.watch();
  assert.deepEqual(scheduled.map((item) => item.delay), [2_000]);
  await scheduled.shift().callback();
  assert.deepEqual(scheduled.map((item) => item.delay), [4_000]);
  await scheduled.shift().callback();
  assert.deepEqual(scheduled.map((item) => item.delay), [8_000]);
  assert.equal(peak, 1);
  service.stop();
});
