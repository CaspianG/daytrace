const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

function createAccessibilityService({
  platform = process.platform,
  isTrusted,
  probeTrusted = null,
  openExternal,
  onChange = () => {},
  intervalMs = 1_500,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let timer = null;
  let lastTrusted;
  let refreshPromise = null;

  function stopWatching() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
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
    if (refreshPromise && !prompt) return refreshPromise;
    const pending = Promise.resolve()
      .then(() => probeTrusted ? probeTrusted(Boolean(prompt)) : isTrusted?.(Boolean(prompt)))
      .catch(() => isTrusted?.(Boolean(prompt)))
      .then(publish);
    if (!prompt) refreshPromise = pending;
    try { return await pending; }
    finally { if (refreshPromise === pending) refreshPromise = null; }
  }

  function watch() {
    if (platform !== "darwin" || check() || timer) return;
    timer = setIntervalFn(() => refresh(false), intervalMs);
    timer?.unref?.();
  }

  async function request() {
    if (platform !== "darwin") return true;
    let trusted = await refresh(true);
    if (trusted) return true;
    await openExternal(ACCESSIBILITY_SETTINGS_URL);
    trusted = await refresh(false);
    if (!trusted) watch();
    return trusted;
  }

  return { check, refresh, mark: publish, request, watch, stop: stopWatching, settingsUrl: ACCESSIBILITY_SETTINGS_URL };
}

module.exports = { ACCESSIBILITY_SETTINGS_URL, createAccessibilityService };
