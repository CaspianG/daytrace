const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { randomBytes: defaultRandomBytes } = require("node:crypto");
const { spawn: defaultSpawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const CONNECT_TIMEOUT_MS = 12_000;
const MAX_LINE_BYTES = 8_192;

function collectorBundlePath(executablePath) {
  const normalized = path.resolve(String(executablePath || ""));
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return "";
  const bundle = normalized.slice(0, markerIndex);
  return bundle.toLowerCase().endsWith(".app") ? bundle : "";
}

function boundedMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function spawnMacCollectorBundle({
  platform = process.platform,
  executablePath,
  collectTitles = true,
  collectInput = true,
  spawn = defaultSpawn,
  createServer = (handler) => net.createServer(handler),
  randomBytes = defaultRandomBytes,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  log = () => {},
} = {}) {
  if (platform !== "darwin") throw new Error("The macOS collector bundle runtime is available only on macOS");
  const bundle = collectorBundlePath(executablePath);
  if (!bundle) throw new Error(`The collector executable is not inside an app bundle: ${executablePath || "missing"}`);

  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;

  const token = randomBytes(32).toString("hex");
  let server = null;
  let socket = null;
  let launcher = null;
  let timer = null;
  let settled = false;
  let authenticated = false;

  function cleanup() {
    if (timer) clearTimeoutFn(timer);
    timer = null;
    try { socket?.destroy(); } catch { }
    socket = null;
    try { server?.close(); } catch { }
    server = null;
    try { launcher?.kill(); } catch { }
    launcher = null;
  }

  function finish(code = 0, signal = null, error = "") {
    if (settled) return;
    settled = true;
    if (error) child.stderr.write(`${boundedMessage(error)}\n`);
    cleanup();
    child.stdout.end();
    child.stderr.end();
    queueMicrotask(() => child.emit("exit", Number.isInteger(code) ? code : null, signal || null));
  }

  child.kill = () => {
    if (child.killed || settled) return false;
    child.killed = true;
    finish(null, "SIGTERM");
    return true;
  };

  function handleLine(line) {
    let message;
    try { message = JSON.parse(line); }
    catch { finish(70, null, "collector-protocol-invalid-json"); return; }

    if (!authenticated) {
      if (message?.type === "status" && message?.token === token) {
        const code = Number.isInteger(message.code) ? message.code : 70;
        finish(code, null, message.error || `collector-status-${code}`);
        return;
      }
      if (message?.type !== "ready" || message?.token !== token) {
        finish(70, null, "collector-protocol-authentication-failed");
        return;
      }
      authenticated = true;
      if (timer) clearTimeoutFn(timer);
      timer = null;
      log(`mac-collector-connected pid=${Number(message.pid) || "unknown"} bundle=${bundle}`);
      return;
    }

    if (message?.type === "liveness") return;
    if (message?.type === "status") {
      const code = Number.isInteger(message.code) ? message.code : 70;
      finish(code, null, message.error || `collector-status-${code}`);
      return;
    }
    if (!message || typeof message !== "object" || typeof message.kind !== "string") {
      finish(70, null, "collector-protocol-invalid-event");
      return;
    }
    child.stdout.write(`${line}\n`);
  }

  server = createServer((candidate) => {
    if (socket) { candidate.destroy(); return; }
    socket = candidate;
    socket.setNoDelay?.(true);
    let buffered = "";
    socket.setEncoding?.("utf8");
    socket.on("data", (chunk) => {
      buffered += String(chunk);
      if (Buffer.byteLength(buffered, "utf8") > MAX_LINE_BYTES * 2) {
        finish(70, null, "collector-protocol-line-too-large");
        return;
      }
      let newline = buffered.indexOf("\n");
      while (newline >= 0 && !settled) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
          finish(70, null, "collector-protocol-line-too-large");
          return;
        }
        if (line) handleLine(line);
        newline = buffered.indexOf("\n");
      }
    });
    socket.once("error", (error) => finish(70, null, `collector-stream-error: ${error?.message || error}`));
    socket.once("close", () => {
      if (!settled) finish(authenticated ? 70 : 77, null, authenticated ? "collector-stream-closed" : "collector-stream-closed-before-authentication");
    });
  });
  server.unref?.();
  server.once("error", (error) => finish(70, null, `collector-server-error: ${error?.message || error}`));
  server.listen(0, "127.0.0.1", () => {
    if (settled) return;
    const address = server.address();
    const port = Number(address?.port || 0);
    if (!port) { finish(70, null, "collector-server-missing-port"); return; }
    const args = [
      "-n", "-g", bundle, "--args", "--stream-events",
      "--callback-port", String(port),
      "--callback-token", token,
      "--collect-titles", collectTitles ? "1" : "0",
      "--collect-input", collectInput ? "1" : "0",
    ];
    try {
      launcher = spawn("/usr/bin/open", args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      finish(70, null, `collector-launch-failed: ${error?.message || error}`);
      return;
    }
    let launcherError = "";
    launcher.stderr?.on("data", (chunk) => { if (launcherError.length < 1_024) launcherError += String(chunk); });
    launcher.once("error", (error) => finish(70, null, `collector-launch-error: ${error?.message || error}`));
    launcher.once("exit", (code, signal) => {
      launcher = null;
      if (!settled && code !== 0) finish(70, signal, launcherError || `collector-launch-exit-${code}`);
    });
    timer = setTimeoutFn(() => finish(70, null, "collector-connect-timeout"), CONNECT_TIMEOUT_MS);
    timer?.unref?.();
  });

  return child;
}

module.exports = { CONNECT_TIMEOUT_MS, MAX_LINE_BYTES, collectorBundlePath, spawnMacCollectorBundle };
