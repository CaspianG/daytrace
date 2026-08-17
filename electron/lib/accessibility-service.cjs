const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

function createAccessibilityService({
  platform = process.platform,
  isTrusted,
  openExternal,
  onChange = () => {},
  intervalMs = 1_500,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let timer = null;
  let lastTrusted;

  function stopWatching() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function check() {
    const trusted = platform !== "darwin" || Boolean(isTrusted(false));
    if (trusted !== lastTrusted) {
      lastTrusted = trusted;
      onChange(trusted);
    }
    if (trusted) stopWatching();
    return trusted;
  }

  function watch() {
    if (platform !== "darwin" || check() || timer) return;
    timer = setIntervalFn(check, intervalMs);
    timer?.unref?.();
  }

  async function request() {
    if (platform !== "darwin") return true;
    const trusted = Boolean(isTrusted(true));
    if (trusted) {
      check();
      return true;
    }
    watch();
    await openExternal(ACCESSIBILITY_SETTINGS_URL);
    return check();
  }

  return { check, request, watch, stop: stopWatching, settingsUrl: ACCESSIBILITY_SETTINGS_URL };
}

module.exports = { ACCESSIBILITY_SETTINGS_URL, createAccessibilityService };
