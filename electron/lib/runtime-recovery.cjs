function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createRecoveryBackoff({
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
  stableAfterMs = 60_000,
  maxAttempts = Number.POSITIVE_INFINITY,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onRetry = () => {},
} = {}) {
  const base = positiveInteger(baseDelayMs, 1_000);
  const maximum = Math.max(base, positiveInteger(maxDelayMs, 60_000));
  const stableAfter = positiveInteger(stableAfterMs, 60_000);
  const attemptsMaximum = Number.isFinite(Number(maxAttempts))
    ? positiveInteger(maxAttempts, 1)
    : Number.POSITIVE_INFINITY;
  let timer = null;
  let failures = 0;
  let startedAt = 0;
  let pending = null;

  function markStarted(at = now()) {
    startedAt = Number(at) || now();
  }

  function schedule(reason = "runtime-failure") {
    if (timer !== null) return { scheduled: false, ...pending };
    const current = now();
    if (startedAt && current - startedAt >= stableAfter) failures = 0;
    if (failures >= attemptsMaximum) return { scheduled: false, exhausted: true, attempt: failures, reason };
    failures += 1;
    const delayMs = Math.min(maximum, base * (2 ** Math.min(20, failures - 1)));
    pending = { exhausted: false, attempt: failures, delayMs, reason: String(reason || "runtime-failure") };
    timer = setTimeoutFn(() => {
      const retry = pending;
      timer = null;
      pending = null;
      try { void onRetry(retry); } catch { }
    }, delayMs);
    timer?.unref?.();
    return { scheduled: true, ...pending };
  }

  function cancel({ reset = true } = {}) {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
    pending = null;
    if (reset) {
      failures = 0;
      startedAt = 0;
    }
  }

  function snapshot() {
    return { pending: timer !== null, failures, startedAt, ...(pending || {}) };
  }

  return { cancel, markStarted, schedule, snapshot };
}

module.exports = { createRecoveryBackoff };
