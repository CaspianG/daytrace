import test from "node:test";
import assert from "node:assert/strict";
import recoveryModule from "../electron/lib/runtime-recovery.cjs";

const { createRecoveryBackoff } = recoveryModule;

test("runtime recovery backs off, avoids duplicate timers, and resets after stable uptime", () => {
  let current = 1_000;
  let scheduled = null;
  const retries = [];
  const recovery = createRecoveryBackoff({
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
    stableAfterMs: 60_000,
    now: () => current,
    setTimeoutFn: (callback, delay) => { scheduled = { callback, delay }; return { unref() {} }; },
    clearTimeoutFn: () => { scheduled = null; },
    onRetry: (value) => retries.push(value),
  });

  recovery.markStarted();
  assert.deepEqual(recovery.schedule("first"), { scheduled: true, exhausted: false, attempt: 1, delayMs: 1_000, reason: "first" });
  assert.equal(recovery.schedule("duplicate").scheduled, false);
  scheduled.callback();
  assert.equal(retries[0].attempt, 1);

  current += 5_000;
  recovery.markStarted();
  assert.equal(recovery.schedule("second").delayMs, 2_000);
  scheduled.callback();

  current += 61_000;
  recovery.markStarted(current - 61_000);
  assert.equal(recovery.schedule("stable-reset").delayMs, 1_000);
});

test("renderer-style recovery stops after a bounded number of attempts", () => {
  let scheduled = null;
  const recovery = createRecoveryBackoff({
    maxAttempts: 2,
    setTimeoutFn: (callback) => { scheduled = callback; return { unref() {} }; },
    clearTimeoutFn: () => { scheduled = null; },
  });
  recovery.markStarted();
  assert.equal(recovery.schedule().attempt, 1);
  scheduled();
  recovery.markStarted();
  assert.equal(recovery.schedule().attempt, 2);
  scheduled();
  recovery.markStarted();
  assert.equal(recovery.schedule().exhausted, true);
});
