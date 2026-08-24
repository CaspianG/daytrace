const path = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");
const fs = require("node:fs");

const CHECK_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 65_000;

function collectorBundlePath(executablePath) {
  const normalized = path.resolve(String(executablePath || ""));
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return "";
  const bundle = normalized.slice(0, markerIndex);
  return bundle.toLowerCase().endsWith(".app") ? bundle : "";
}

function boundedMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function createMacAccessibilityProbe({
  platform = process.platform,
  executablePath,
  spawn = defaultSpawn,
  existsSync = fs.existsSync,
  onDiagnostic = () => {},
  log = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const children = new Set();

  function publish(update) {
    const value = { checkedAt: Date.now(), ...update };
    onDiagnostic(value);
    return value;
  }

  function run(command, args, timeoutMs, phase) {
    return new Promise((resolve) => {
      let settled = false;
      let child = null;
      let stderr = "";
      let timer = null;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeoutFn(timer);
        if (child) children.delete(child);
        resolve(result);
      };
      try {
        child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        children.add(child);
      } catch (error) {
        const message = boundedMessage(error?.message || error);
        log(`${phase}-spawn-failed`, error);
        finish({ ok: false, code: null, signal: null, error: message });
        return;
      }
      child.stderr?.on("data", (chunk) => { if (stderr.length < 1_024) stderr += String(chunk); });
      child.once("error", (error) => {
        const message = boundedMessage(error?.message || error);
        log(`${phase}-process-error`, error);
        finish({ ok: false, code: null, signal: null, error: message });
      });
      child.once("exit", (code, signal) => finish({
        ok: code === 0,
        code: Number.isInteger(code) ? code : null,
        signal: signal || null,
        error: code === 0 ? "" : boundedMessage(stderr) || `exit-${Number.isInteger(code) ? code : signal || "unknown"}`,
      }));
      timer = setTimeoutFn(() => {
        try { child.kill(); } catch { }
        log(`${phase}-timeout`);
        finish({ ok: false, code: null, signal: "timeout", error: "timeout" });
      }, timeoutMs);
      timer?.unref?.();
    });
  }

  async function directCheck(phase = "accessibility-check") {
    const executable = String(executablePath?.() || "");
    if (!executable || !existsSync(executable)) {
      publish({ phase: "unavailable", trusted: false, error: "collector-missing", executable });
      return false;
    }
    const result = await run(executable, ["--check-accessibility"], CHECK_TIMEOUT_MS, phase);
    publish({
      phase: result.ok ? "trusted" : result.code === 77 ? "denied" : "error",
      trusted: result.ok,
      code: result.code,
      signal: result.signal,
      error: result.error,
      executable,
      bundle: collectorBundlePath(executable),
    });
    return result.ok;
  }

  async function probe(prompt = false) {
    if (platform !== "darwin") return true;
    if (!prompt) return directCheck();

    const executable = String(executablePath?.() || "");
    const bundle = collectorBundlePath(executable);
    if (!executable || !bundle || !existsSync(executable) || !existsSync(bundle)) {
      publish({ phase: "unavailable", trusted: false, error: "collector-bundle-missing", executable, bundle });
      return false;
    }

    // Accessibility belongs to the process that asks for it. Launch the helper
    // as its actual .app through LaunchServices so macOS registers the same
    // bundle identity shown in Privacy & Security, rather than a bare nested
    // Mach-O process attributed ambiguously to its Electron parent.
    publish({ phase: "registering", trusted: false, error: "", executable, bundle });
    const opened = await run(
      "/usr/bin/open",
      ["-n", "-W", bundle, "--args", "--request-accessibility"],
      REQUEST_TIMEOUT_MS,
      "accessibility-register",
    );
    if (!opened.ok) {
      publish({ phase: "error", trusted: false, code: opened.code, signal: opened.signal, error: opened.error || "launch-services-failed", executable, bundle });
      return false;
    }
    // `open` reports whether LaunchServices could run the app, not whether TCC
    // granted it. Only the exact collector's own AX check is authoritative.
    return directCheck("accessibility-post-register-check");
  }

  function stop() {
    for (const child of children) { try { child.kill(); } catch { } }
    children.clear();
  }

  return { bundlePath: () => collectorBundlePath(executablePath?.()), probe, stop };
}

module.exports = { CHECK_TIMEOUT_MS, REQUEST_TIMEOUT_MS, collectorBundlePath, createMacAccessibilityProbe };
