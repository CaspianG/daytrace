const path = require("node:path");
const { randomBytes: defaultRandomBytes } = require("node:crypto");
const { spawn: defaultSpawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");

const CHECK_TIMEOUT_MS = 5_000;
const CALLBACK_CHECK_TIMEOUT_MS = 12_000;
const REQUEST_TIMEOUT_MS = 70_000;
const COLLECTOR_BUNDLE_ID = "io.github.caspiang.daytrace.collector";

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
  createServer = (handler) => net.createServer(handler),
  randomBytes = defaultRandomBytes,
  existsSync = fs.existsSync,
  onDiagnostic = () => {},
  log = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const children = new Set();
  const servers = new Set();
  let denialCount = 0;

  function publish(update) {
    if (update.trusted) denialCount = 0;
    else if (update.phase === "denied") denialCount += 1;
    const value = { checkedAt: Date.now(), denialCount, bundleIdentifier: COLLECTOR_BUNDLE_ID, ...update };
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

  function launchBundleProbe(prompt) {
    return new Promise((resolve) => {
      const executable = String(executablePath?.() || "");
      const bundle = collectorBundlePath(executable);
      if (!executable || !bundle || !existsSync(executable) || !existsSync(bundle)) {
        const diagnostic = publish({ phase: "unavailable", trusted: false, error: "collector-bundle-missing", executable, bundle, transport: "launch-services-callback" });
        resolve(diagnostic);
        return;
      }

      const token = randomBytes(32).toString("hex");
      let server = null;
      let socket = null;
      let launcher = null;
      let timer = null;
      let settled = false;
      const finish = (diagnostic) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeoutFn(timer);
        try { socket?.destroy(); } catch { }
        try { server?.close(); } catch { }
        if (server) servers.delete(server);
        if (launcher) children.delete(launcher);
        resolve(publish({ executable, bundle, transport: "launch-services-callback", ...diagnostic }));
      };

      server = createServer((candidate) => {
        if (socket) { candidate.destroy(); return; }
        socket = candidate;
        socket.setEncoding?.("utf8");
        let buffered = "";
        socket.on("data", (chunk) => {
          buffered += String(chunk);
          if (Buffer.byteLength(buffered, "utf8") > 4_096) {
            finish({ phase: "error", trusted: false, error: "probe-response-too-large" });
            return;
          }
          const newline = buffered.indexOf("\n");
          if (newline < 0) return;
          let message;
          try { message = JSON.parse(buffered.slice(0, newline)); }
          catch { finish({ phase: "error", trusted: false, error: "probe-response-invalid" }); return; }
          if (message?.type !== "probe" || message?.token !== token) {
            finish({ phase: "error", trusted: false, error: "probe-response-authentication-failed" });
            return;
          }
          const trusted = Boolean(message.trusted);
          finish({
            phase: trusted ? "trusted" : "denied",
            trusted,
            code: trusted ? 0 : 77,
            signal: null,
            error: trusted ? "" : boundedMessage(message.error) || "permission-required",
            pid: Number(message.pid) || null,
          });
        });
        socket.once("error", (error) => finish({ phase: "error", trusted: false, error: boundedMessage(error?.message || error) }));
        socket.once("close", () => { if (!settled) finish({ phase: "error", trusted: false, error: "probe-response-closed" }); });
      });
      servers.add(server);
      server.unref?.();
      server.once("error", (error) => finish({ phase: "error", trusted: false, error: boundedMessage(error?.message || error) }));
      server.listen(0, "127.0.0.1", () => {
        if (settled) return;
        const port = Number(server.address()?.port || 0);
        if (!port) { finish({ phase: "error", trusted: false, error: "probe-callback-port-missing" }); return; }
        publish({ phase: prompt ? "registering" : "checking", trusted: false, error: "", executable, bundle, transport: "launch-services-callback" });
        const args = [
          "-n", "-g", bundle, "--args", prompt ? "--request-accessibility" : "--check-accessibility",
          "--callback-port", String(port), "--callback-token", token,
        ];
        try {
          launcher = spawn("/usr/bin/open", args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
          children.add(launcher);
        } catch (error) {
          finish({ phase: "error", trusted: false, error: boundedMessage(error?.message || error) });
          return;
        }
        let launcherError = "";
        launcher.stderr?.on("data", (chunk) => { if (launcherError.length < 1_024) launcherError += String(chunk); });
        launcher.once("error", (error) => finish({ phase: "error", trusted: false, error: boundedMessage(error?.message || error) }));
        launcher.once("exit", (code, signal) => {
          children.delete(launcher);
          launcher = null;
          if (!settled && code !== 0) finish({ phase: "error", trusted: false, code, signal, error: boundedMessage(launcherError) || `launch-services-exit-${code}` });
        });
        timer = setTimeoutFn(() => finish({ phase: "error", trusted: false, signal: "timeout", error: "probe-callback-timeout" }), prompt ? REQUEST_TIMEOUT_MS : CALLBACK_CHECK_TIMEOUT_MS);
        timer?.unref?.();
      });
    });
  }

  async function probe(prompt = false) {
    if (platform !== "darwin") return true;
    // TCC must be checked by the same app identity and launch path that performs
    // the real AX calls. Never trust a bare executable preflight here: it can
    // disagree with the LaunchServices app shown in System Settings and create
    // an endless allowed/denied restart loop.
    return Boolean((await launchBundleProbe(Boolean(prompt))).trusted);
  }

  async function reset() {
    if (platform !== "darwin") return true;
    const executable = String(executablePath?.() || "");
    const bundle = collectorBundlePath(executable);
    publish({ phase: "repairing", trusted: false, error: "", executable, bundle, transport: "tccutil" });
    const result = await run("/usr/bin/tccutil", ["reset", "Accessibility", COLLECTOR_BUNDLE_ID], CHECK_TIMEOUT_MS, "accessibility-reset");
    if (!result.ok) {
      publish({ phase: "error", trusted: false, code: result.code, signal: result.signal, error: result.error || "tcc-reset-failed", executable, bundle, transport: "tccutil" });
      return false;
    }
    denialCount = 0;
    publish({ phase: "reset", trusted: false, code: 0, signal: null, error: "", executable, bundle, transport: "tccutil" });
    return true;
  }

  function stop() {
    for (const child of children) { try { child.kill(); } catch { } }
    children.clear();
    for (const server of servers) { try { server.close(); } catch { } }
    servers.clear();
  }

  return { bundlePath: () => collectorBundlePath(executablePath?.()), probe, reset, stop };
}

module.exports = { CALLBACK_CHECK_TIMEOUT_MS, CHECK_TIMEOUT_MS, COLLECTOR_BUNDLE_ID, REQUEST_TIMEOUT_MS, collectorBundlePath, createMacAccessibilityProbe };
