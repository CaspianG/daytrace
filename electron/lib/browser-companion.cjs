const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const nodeNet = require("node:net");
const { execFileSync } = require("node:child_process");

const HOST_NAME = "com.daytrace.browser";
const EXTENSION_ID = "mnjnhakgamhedpkchgmefgekmmbcpmbo";
const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024;

function secureMode(target, mode) {
  if (process.platform === "win32") return;
  try { fs.chmodSync(target, mode); } catch { }
}

function clean(value, limit) {
  return String(value || "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function socketAddress(root, platform = process.platform) {
  const id = crypto.createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 20);
  return platform === "win32" ? `\\\\.\\pipe\\daytrace-browser-${id}` : path.join(root, "browser-companion.sock");
}

function safeBrowserContext(message, now = Date.now()) {
  if (!message || message.type !== "context" || message.private === true || message.incognito === true) return null;
  const at = new Date(message.at || now).getTime();
  if (!Number.isFinite(at) || Math.abs(at - now) > 10 * 60_000) return null;
  let parsed;
  try { parsed = new URL(String(message.url || "")); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
  const domain = clean(parsed.hostname, 180).toLowerCase();
  if (!domain || domain !== clean(message.domain, 180).toLowerCase()) return null;
  const browser = clean(message.browser, 120);
  if (!/(?:chrome|edge|brave|vivaldi|opera|chromium)/i.test(browser)) return null;
  return {
    at: new Date(at).toISOString(),
    kind: "foreground",
    app: browser,
    process: browser,
    title: clean(message.title, 300),
    context: "browser",
    domain,
    urlPath: clean(parsed.pathname, 240) || "/",
    source: "browser-companion",
    private: false,
  };
}

function manifestContents(executable) {
  return {
    name: HOST_NAME,
    description: "Daytrace local browser context bridge",
    path: path.resolve(executable),
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  };
}

function writeManifest(file, executable) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(manifestContents(executable), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  secureMode(file, 0o600);
}

function installNativeHost({ root, executable, platform = process.platform, home = os.homedir(), runRegistry = execFileSync }) {
  if (!executable || !fs.existsSync(executable)) throw new Error("Daytrace executable is unavailable");
  const localManifest = path.join(root, "browser-host", `${HOST_NAME}.json`);
  writeManifest(localManifest, executable);
  const installed = [];
  if (platform === "win32") {
    const keys = [
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
      `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
      `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
      `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${HOST_NAME}`,
    ];
    for (const key of keys) {
      runRegistry("reg.exe", ["ADD", key, "/ve", "/t", "REG_SZ", "/d", localManifest, "/f"], { windowsHide: true, stdio: "ignore" });
      installed.push(key);
    }
    runRegistry("reg.exe", ["ADD", "HKCU\\Software\\Daytrace\\BrowserHost", "/v", "DataRoot", "/t", "REG_SZ", "/d", path.resolve(root), "/f"], { windowsHide: true, stdio: "ignore" });
  } else if (platform === "darwin") {
    const folders = [
      path.join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
      path.join(home, "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts"),
      path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"),
      path.join(home, "Library", "Application Support", "Vivaldi", "NativeMessagingHosts"),
    ];
    for (const folder of folders) {
      const destination = path.join(folder, `${HOST_NAME}.json`);
      writeManifest(destination, executable);
      installed.push(destination);
    }
  } else throw new Error("Browser companion is supported on Windows and macOS only");
  return { manifest: localManifest, installed };
}

function readHostConfig(root) {
  const file = path.join(root, "browser-host.json");
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 16 * 1024) throw new Error("Browser companion is not running");
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value.address !== "string" || !/^[a-f0-9]{64}$/i.test(value.token || "")) throw new Error("Browser companion configuration is invalid");
  return value;
}

function encodeNativeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_NATIVE_MESSAGE_BYTES) throw new Error("Native message is too large");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function forwardToRunningApp(root, message) {
  return new Promise((resolve) => {
    let config;
    try { config = readHostConfig(root); } catch (error) { resolve({ ok: false, error: String(error.message || error) }); return; }
    const socket = nodeNet.createConnection(config.address);
    let buffer = "";
    const finish = (value) => {
      if (!socket.destroyed) socket.destroy();
      resolve(value);
    };
    socket.setTimeout(3_000, () => finish({ ok: false, error: "Daytrace companion timed out" }));
    socket.once("error", (error) => finish({ ok: false, error: String(error.message || error) }));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try { finish(JSON.parse(buffer.slice(0, newline))); } catch { finish({ ok: false, error: "Invalid Daytrace response" }); }
    });
    socket.once("connect", () => socket.write(`${JSON.stringify({ token: config.token, message })}\n`));
  });
}

async function runNativeMessagingHost({ root, origin, input = process.stdin, output = process.stdout }) {
  if (origin !== `chrome-extension://${EXTENSION_ID}/`) {
    output.write(encodeNativeMessage({ ok: false, error: "Untrusted extension" }));
    return;
  }
  let buffer = Buffer.alloc(0);
  let chain = Promise.resolve();
  await new Promise((resolve) => {
    input.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (length <= 0 || length > MAX_NATIVE_MESSAGE_BYTES) { buffer = Buffer.alloc(0); output.write(encodeNativeMessage({ ok: false, error: "Invalid native message" })); break; }
        if (buffer.length < length + 4) break;
        const body = buffer.subarray(4, length + 4);
        buffer = buffer.subarray(length + 4);
        chain = chain.then(async () => {
          let message;
          try { message = JSON.parse(body.toString("utf8")); } catch { output.write(encodeNativeMessage({ ok: false, error: "Invalid JSON" })); return; }
          output.write(encodeNativeMessage(await forwardToRunningApp(root, message)));
        });
      }
    });
    input.once("end", resolve);
    input.once("error", resolve);
  });
  await chain;
}

class BrowserCompanionService {
  constructor(root, onContext, options = {}) {
    this.root = root;
    this.onContext = onContext;
    this.platform = options.platform || process.platform;
    this.address = socketAddress(root, this.platform);
    this.configFile = path.join(root, "browser-host.json");
    this.server = null;
    this.connectedAt = null;
    this.lastContextAt = null;
    this.lastError = "";
  }

  start() {
    if (this.server) return Promise.resolve(this.status());
    if (this.platform !== "win32") try { fs.rmSync(this.address, { force: true }); } catch { }
    const token = crypto.randomBytes(32).toString("hex");
    this.server = nodeNet.createServer((socket) => {
      socket.setEncoding("utf8");
      let input = "";
      socket.on("data", (chunk) => {
        input += chunk;
        if (input.length > MAX_NATIVE_MESSAGE_BYTES * 2) { socket.end(`${JSON.stringify({ ok: false, error: "Message too large" })}\n`); return; }
        const newline = input.indexOf("\n");
        if (newline < 0) return;
        try {
          const packet = JSON.parse(input.slice(0, newline));
          if (packet.token !== token) throw new Error("Invalid companion token");
          const context = safeBrowserContext(packet.message);
          if (!context) throw new Error("Unsupported or private browser context");
          const accepted = Boolean(this.onContext(context));
          this.connectedAt = Date.now();
          if (accepted) this.lastContextAt = Date.now();
          socket.end(`${JSON.stringify({ ok: accepted, stored: accepted })}\n`);
        } catch (error) {
          this.lastError = String(error?.message || error);
          socket.end(`${JSON.stringify({ ok: false, error: this.lastError })}\n`);
        }
      });
    });
    return new Promise((resolve, reject) => {
      this.server.once("error", (error) => { this.server = null; this.lastError = String(error?.message || error); reject(error); });
      this.server.listen(this.address, () => {
        fs.writeFileSync(this.configFile, `${JSON.stringify({ address: this.address, token })}\n`, { encoding: "utf8", mode: 0o600 });
        secureMode(this.configFile, 0o600);
        if (this.platform !== "win32") secureMode(this.address, 0o600);
        resolve(this.status());
      });
    });
  }

  stop() {
    try { fs.rmSync(this.configFile, { force: true }); } catch { }
    if (!this.server) return;
    this.server.close();
    this.server = null;
    if (this.platform !== "win32") try { fs.rmSync(this.address, { force: true }); } catch { }
  }

  status() {
    return { running: Boolean(this.server), connectedAt: this.connectedAt, lastContextAt: this.lastContextAt, error: this.lastError, extensionId: EXTENSION_ID };
  }
}

module.exports = {
  BrowserCompanionService,
  EXTENSION_ID,
  HOST_NAME,
  MAX_NATIVE_MESSAGE_BYTES,
  encodeNativeMessage,
  installNativeHost,
  runNativeMessagingHost,
  safeBrowserContext,
  socketAddress,
};
