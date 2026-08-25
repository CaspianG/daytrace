const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

function createAccessibilityService({
  platform = process.platform,
  isTrusted,
  probeTrusted = null,
  openExternal,
  onChange = () => {},
  intervalMs = 2_000,
  maximumIntervalMs = 30_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let timer = null;
  let lastTrusted;
  let refreshPromise = null;
  let promptPromise = null;
  let nextIntervalMs = intervalMs;

  function stopWatching() {
    if (timer === null) return;
    clearTimeoutFn(timer);
    timer = null;
    nextIntervalMs = intervalMs;
  }

  function publish(value) {
    const trusted = platform !== "darwin" || Boolean(value);
    if (trusted !== lastTrusted) {
      lastTrusted = trusted;
      onChange(trusted);
    }
    if (trusted) stopWatching();
    return trusted;
  }

  function check() {
    if (platform !== "darwin") return publish(true);
    if (lastTrusted !== undefined) return lastTrusted;
    return publish(Boolean(isTrusted?.(false)));
  }

  async function refresh(prompt = false) {
    if (platform !== "darwin") return publish(true);
    if (prompt && promptPromise) return promptPromise;
    if (refreshPromise && !prompt) return refreshPromise;
    const pending = Promise.resolve()
      .then(() => probeTrusted ? probeTrusted(Boolean(prompt)) : isTrusted?.(Boolean(prompt)))
      // Once a dedicated collector probe exists, the Electron window is not a
      // valid fallback identity. Treat a probe failure as denied so Daytrace
      // never claims access that the process doing the AX calls does not have.
      .catch(() => probeTrusted ? false : isTrusted?.(Boolean(prompt)))
      .then(publish);
    if (prompt) promptPromise = pending;
    else refreshPromise = pending;
    try { return await pending; }
    finally {
      if (refreshPromise === pending) refreshPromise = null;
      if (promptPromise === pending) promptPromise = null;
    }
  }

  function watch() {
    if (platform !== "darwin" || check() || timer !== null) return;
    const delay = nextIntervalMs;
    timer = setTimeoutFn(async () => {
      timer = null;
      const trusted = await refresh(false);
      if (trusted) return;
      nextIntervalMs = Math.min(maximumIntervalMs, Math.max(intervalMs, delay * 2));
      watch();
    }, delay);
    timer?.unref?.();
  }

  async function request() {
    if (platform !== "darwin") return true;
    let trusted = await refresh(false);
    if (trusted) return true;
    const promptResult = refresh(true);
    await Promise.resolve();
    await openExternal(ACCESSIBILITY_SETTINGS_URL);
    void promptResult.then((value) => { if (!value) watch(); });
    return check();
  }

  return { check, refresh, mark: publish, request, watch, stop: stopWatching, settingsUrl: ACCESSIBILITY_SETTINGS_URL };
}

module.exports = { ACCESSIBILITY_SETTINGS_URL, createAccessibilityService };
