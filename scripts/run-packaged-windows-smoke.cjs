const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { EXTENSION_ID, encodeNativeMessage } = require("../electron/lib/browser-companion.cjs");

if (process.platform !== "win32") throw new Error("The packaged Windows smoke test must run on Windows.");

const projectRoot = path.resolve(__dirname, "..");
const { version } = require(path.join(projectRoot, "package.json"));
const executable = path.join(projectRoot, "release", "win-unpacked", "Daytrace.exe");
const installer = path.join(projectRoot, "release", `Daytrace-Setup-${version}-x64.exe`);
const packagedExtensionManifest = path.join(projectRoot, "release", "win-unpacked", "resources", "browser-extension", "manifest.json");
const packagedOptionalModel = path.join(projectRoot, "release", "win-unpacked", "resources", "models", "daytrace-smart-v1.json");
const packagedNativeHost = path.join(projectRoot, "release", "win-unpacked", "resources", "tracker", "windows", "Daytrace.Tracker.exe");
if (!fs.existsSync(executable)) throw new Error(`Packaged executable is missing: ${executable}`);
if (!fs.existsSync(installer)) throw new Error(`Packaged installer is missing: ${installer}`);
if (!fs.existsSync(packagedExtensionManifest)) throw new Error("Packaged browser companion is missing.");
if (!fs.existsSync(packagedNativeHost)) throw new Error("Packaged browser native host is missing.");
if (fs.existsSync(packagedOptionalModel)) throw new Error("The optional smart model must not be bundled or loaded by default.");
const extensionManifest = JSON.parse(fs.readFileSync(packagedExtensionManifest, "utf8"));
if (extensionManifest.incognito !== "not_allowed") throw new Error("Packaged browser companion must reject incognito mode.");

const tempRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(tempRoot, "daytrace-desktop-smoke-"));
let bridgeProcess = null;

function sha256(filePath) {
  const hash = createHash("sha256");
  const handle = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

try {
  const desktopStartedAt = Date.now();
  const result = spawnSync(executable, ["--daytrace-smoke-test", `--daytrace-smoke-user-data=${userData}`], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
  });
  const logPath = path.join(userData, "startup.log");
  const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (result.error) throw result.error;
  if (result.status !== 0 || !/desktop-smoke-passed/.test(startupLog)) {
    throw new Error(`Packaged desktop smoke failed with exit ${result.status}.\n${result.stderr || ""}\n${startupLog}`);
  }
  process.stdout.write(`Packaged Windows renderer, preload, IPC, and local state smoke passed in ${Date.now() - desktopStartedAt} ms.\n`);

  const nativeFrame = encodeNativeMessage({
    type: "context",
    at: new Date().toISOString(),
    browser: "Google Chrome",
    title: "Synthetic packaged host check",
    domain: "example.com",
    url: "https://example.com/check",
    private: false,
  });
  const bridgeRoot = path.join(userData, "native-bridge");
  fs.mkdirSync(bridgeRoot, { recursive: true });
  const bridgeModule = path.join(projectRoot, "electron", "lib", "browser-companion.cjs");
  const bridgeCode = `
    const fs = require("node:fs");
    const { BrowserCompanionService } = require(process.argv[1]);
    const root = process.argv[2];
    const log = (value) => fs.appendFileSync(require("node:path").join(root, "smoke.log"), value + "\\n");
    let service;
    service = new BrowserCompanionService(root, (context) => {
      log("context:" + JSON.stringify({ domain: context?.domain, title: context?.title }));
      return context?.domain === "example.com" && context?.title === "Synthetic packaged host check";
    }, { platform: "win32" });
    service.start().then(() => log("started")).catch((error) => { log("error:" + error.message); process.exit(2); });
    setTimeout(() => { service.stop(); process.exit(3); }, 15000);
  `;
  bridgeProcess = spawn(process.execPath, ["-e", bridgeCode, bridgeModule, bridgeRoot], { cwd: projectRoot, stdio: "ignore", windowsHide: true });
  const bridgeConfig = path.join(bridgeRoot, "browser-host.json");
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  const bridgeDeadline = Date.now() + 5_000;
  while (!fs.existsSync(bridgeConfig) && Date.now() < bridgeDeadline) Atomics.wait(waitArray, 0, 0, 50);
  if (!fs.existsSync(bridgeConfig)) throw new Error("Synthetic local browser bridge did not start.");
  const bridgeAddress = JSON.parse(fs.readFileSync(bridgeConfig, "utf8")).address;
  const nodeProbeCode = `
    const fs = require("node:fs"), net = require("node:net");
    const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const socket = net.createConnection(config.address);
    socket.setTimeout(3000, () => process.exit(3));
    socket.once("error", () => process.exit(4));
    socket.on("data", (chunk) => { process.stdout.write(chunk); socket.destroy(); });
    socket.once("close", () => process.exit(0));
    socket.once("connect", () => socket.write(JSON.stringify({ token: config.token, message: { type: "context", at: new Date().toISOString(), browser: "Google Chrome", title: "Synthetic packaged host check", domain: "example.com", url: "https://example.com/check", private: false } }) + "\\n"));
  `;
  const nodeProbe = spawnSync(process.execPath, ["-e", nodeProbeCode, bridgeConfig], { cwd: projectRoot, encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (nodeProbe.status !== 0 || !/\"ok\":true/.test(nodeProbe.stdout || "")) throw new Error(`Synthetic Node pipe probe failed (exit=${nodeProbe.status}, output=${String(nodeProbe.stdout || "").trim()}).`);
  const nativeHost = spawnSync(packagedNativeHost, [`chrome-extension://${EXTENSION_ID}/`], {
    cwd: projectRoot,
    input: nativeFrame,
    env: { ...process.env, DAYTRACE_BROWSER_HOST_TEST: "1", DAYTRACE_BROWSER_DATA_ROOT: bridgeRoot },
    timeout: 30_000,
    windowsHide: true,
  });
  if (nativeHost.error) throw nativeHost.error;
  const nativeOutput = Buffer.from(nativeHost.stdout || []);
  const nativeLength = nativeOutput.length >= 4 ? nativeOutput.readUInt32LE(0) : 0;
  if (nativeHost.status !== 0 || nativeLength <= 0 || nativeLength !== nativeOutput.length - 4) {
    throw new Error(`Packaged browser native host did not return a valid frame (exit=${nativeHost.status}, stdout=${nativeOutput.length} bytes/${nativeOutput.toString("hex").slice(0, 80)}, stderr=${String(nativeHost.stderr || "").trim().slice(0, 500)}).`);
  }
  const nativeResponse = JSON.parse(nativeOutput.subarray(4).toString("utf8"));
  if (nativeResponse.ok !== true || nativeResponse.stored !== true) {
    const bridgeLog = fs.existsSync(path.join(bridgeRoot, "smoke.log")) ? fs.readFileSync(path.join(bridgeRoot, "smoke.log"), "utf8").trim() : "no bridge log";
    throw new Error(`Packaged browser native host did not use the isolated local bridge: ${JSON.stringify(nativeResponse).slice(0, 500)}; address=${bridgeAddress}; ${bridgeLog}`);
  }
  process.stdout.write("Packaged one-shot browser native host smoke passed.\n");

  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "";
  const tarPath = path.join(systemRoot, "System32", "tar.exe");
  if (!fs.existsSync(tarPath)) throw new Error(`Windows archive helper is missing: ${tarPath}`);
  const payloadDirectory = path.join(userData, "installer-payload");
  fs.mkdirSync(path.join(payloadDirectory, "resources"), { recursive: true });
  const extraction = spawnSync(tarPath, ["-xf", installer, "-C", payloadDirectory, "Daytrace.exe", "resources/app.asar", "resources/browser-extension/manifest.json", "resources/tracker/windows/Daytrace.Tracker.exe"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
  });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`Windows installer payload extraction failed with exit ${extraction.status}.\n${extraction.stderr || ""}`);
  const extractedExecutable = path.join(payloadDirectory, "Daytrace.exe");
  const extractedArchive = path.join(payloadDirectory, "resources", "app.asar");
  const extractedExtensionManifest = path.join(payloadDirectory, "resources", "browser-extension", "manifest.json");
  const extractedNativeHost = path.join(payloadDirectory, "resources", "tracker", "windows", "Daytrace.Tracker.exe");
  const packagedArchive = path.join(projectRoot, "release", "win-unpacked", "resources", "app.asar");
  if (!fs.existsSync(extractedExecutable) || !fs.existsSync(extractedArchive)) throw new Error("Windows installer is missing the transactional update payload.");
  if (!fs.existsSync(extractedExtensionManifest)) throw new Error("Windows installer is missing the browser companion.");
  if (!fs.existsSync(extractedNativeHost)) throw new Error("Windows installer is missing the native browser host.");
  if (sha256(extractedExecutable) !== sha256(executable) || sha256(extractedArchive) !== sha256(packagedArchive)) {
    throw new Error("Windows installer payload differs from the packaged application.");
  }
  if (sha256(extractedExtensionManifest) !== sha256(packagedExtensionManifest)) throw new Error("Windows installer browser companion differs from the packaged application.");
  if (sha256(extractedNativeHost) !== sha256(packagedNativeHost)) throw new Error("Windows installer native browser host differs from the packaged application.");
  process.stdout.write("Windows installer payload is safely extractable for transactional updates.\n");
} finally {
  if (bridgeProcess && bridgeProcess.exitCode === null) bridgeProcess.kill();
  const resolved = fs.realpathSync(userData);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("daytrace-desktop-smoke-")) throw new Error(`Refusing unsafe smoke cleanup: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}
