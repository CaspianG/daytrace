const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, powerMonitor, shell, systemPreferences, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { CURRENT_ONBOARDING_VERSION, EventStore, normalizeAnalysisEngine } = require("./lib/event-store.cjs");
const { createAccessibilityService } = require("./lib/accessibility-service.cjs");
const { getMacInstallInfo } = require("./lib/mac-install-service.cjs");
const { confirmMacUpdateReady, findStaleMacDuplicates, getMacUpdateReadyRequest, prepareMacUpdate } = require("./lib/mac-update-service.cjs");
const { assertTrustedIpcSender, isSafeExternalUrl, isTrustedRendererUrl } = require("./lib/runtime-security.cjs");
const { MAX_RELEASE_JSON_BYTES, MAX_UPDATE_BYTES, normalizeChecksumRelease, normalizeRelease } = require("./lib/update-service.cjs");
const { WINDOWS_UPDATE_ENV, confirmWindowsUpdateReady, getWindowsUpdateReadyRequest, prepareWindowsUpdate } = require("./lib/windows-update-service.cjs");
const { BrowserCompanionService, installNativeHost, runNativeMessagingHost } = require("./lib/browser-companion.cjs");
const { SmartAnalysisService } = require("./lib/smart-analysis-service.cjs");
const { SemanticModelService } = require("./lib/semantic-model-service.cjs");
const { createEncryptedBackup, exportCsv, exportJson, restoreEncryptedBackup } = require("./lib/data-portability.cjs");
const { platformCapabilities, runDiagnostics } = require("./lib/diagnostics.cjs");

if (process.argv.includes("--disable-gpu") || process.env.DAYTRACE_SOFTWARE_RENDERING === "1") app.disableHardwareAcceleration();
const SEMANTIC_SMOKE_TEST = process.argv.includes("--daytrace-semantic-smoke-test");
const SMOKE_TEST = process.argv.includes("--daytrace-smoke-test") || SEMANTIC_SMOKE_TEST;
const smokeTempRoot = fs.realpathSync(app.getPath("temp"));
const smokeUserDataArgument = process.argv.find((argument) => String(argument).startsWith("--daytrace-smoke-user-data="));
const requestedSmokeUserData = smokeUserDataArgument ? path.resolve(String(smokeUserDataArgument).slice("--daytrace-smoke-user-data=".length)) : "";
let canonicalSmokeUserData = "";
try { canonicalSmokeUserData = requestedSmokeUserData ? fs.realpathSync(requestedSmokeUserData) : ""; } catch { }
const smokeUserData = SMOKE_TEST && path.dirname(canonicalSmokeUserData) === smokeTempRoot && path.basename(canonicalSmokeUserData).startsWith("daytrace-desktop-smoke-")
  ? canonicalSmokeUserData
  : SMOKE_TEST ? path.join(smokeTempRoot, `daytrace-desktop-smoke-${process.pid}`) : "";
if (SMOKE_TEST) app.setPath("userData", smokeUserData);
const startupLogPath = path.join(app.getPath("userData"), "startup.log");
function startupLog(message, error = null) {
  const suffix = error ? `\n${error?.stack || String(error)}` : "";
  try {
    fs.mkdirSync(path.dirname(startupLogPath), { recursive: true, mode: 0o700 });
    if (fs.existsSync(startupLogPath) && fs.statSync(startupLogPath).size > 1024 * 1024) {
      fs.rmSync(`${startupLogPath}.1`, { force: true });
      fs.renameSync(startupLogPath, `${startupLogPath}.1`);
    }
    fs.appendFileSync(startupLogPath, `${new Date().toISOString()} ${message}${suffix}\n`, { encoding: "utf8", mode: 0o600 });
    if (process.platform !== "win32") fs.chmodSync(startupLogPath, 0o600);
  } catch { }
}
process.on("uncaughtException", (error) => startupLog("uncaughtException", error));
process.on("unhandledRejection", (error) => startupLog("unhandledRejection", error));

let mainWindow = null;
let creatingWindow = null;
let semanticWindow = null;
let creatingSemanticWindow = null;
let tray = null;
let tracker = null;
let trackerStatus = "stopped";
let store = null;
let broadcastTimer = null;
let releaseTimer = null;
let updateTimer = null;
let updateAbortController = null;
let isQuitting = false;
let availableRelease = null;
let accessibilityService = null;
let trackerStarting = false;
let browserCompanion = null;
let smartAnalysis = null;
let semanticAnalysis = null;
let smartAnalysisTimer = null;
let semanticRequestPending = false;
let semanticBackgroundWindowOwned = false;
let latestDiagnostics = null;
const UPDATE_DIR = path.join(app.getPath("temp"), "daytrace-updates");
const DATA_ROOT = path.join(app.getPath("userData"), "daytrace-data");
const macUpdateReadyRequest = process.platform === "darwin" ? getMacUpdateReadyRequest({
  argv: process.argv,
  updateDir: UPDATE_DIR,
}) : null;
const windowsUpdateReadyRequest = process.platform === "win32" ? getWindowsUpdateReadyRequest({
  environment: process.env,
  updateDir: UPDATE_DIR,
}) : null;
for (const name of [WINDOWS_UPDATE_ENV.readyFile, WINDOWS_UPDATE_ENV.readyToken]) delete process.env[name];
let updateRuntime = {
  status: app.isPackaged ? "idle" : "disabled",
  currentVersion: app.getVersion(),
  latestVersion: null,
  checkedAt: null,
  progress: 0,
  error: null,
};

const RELEASES_API = "https://api.github.com/repos/CaspianG/daytrace/releases/latest";
const RELEASES_FEED = "https://github.com/CaspianG/daytrace/releases.atom";
const UPDATE_INTERVAL_MS = 6 * 60 * 60_000;
const OFFLINE_RETRY_MS = 30 * 60_000;
const REVIEW_ACTION_SNOOZE_MS = 24 * 60 * 60_000;
const REVIEW_LATER_SNOOZE_MS = 7 * 24 * 60 * 60_000;
const RENDERER_FILE = path.join(__dirname, "..", "dist", "client", "index.html");
const DEV_RENDERER_ORIGIN = "http://127.0.0.1:5173";
const USE_LOCAL_RENDERER = app.isPackaged || SMOKE_TEST;

const MAIN_TEXT = {
  en: { open: "Open Daytrace", pause: "Pause tracking", resume: "Resume tracking", quit: "Quit", tooltip: "Daytrace — local day history", startupTitle: "Daytrace could not start", startupMessage: "The local window could not be opened. Details were written to startup.log." },
  ru: { open: "Открыть Daytrace", pause: "Приостановить отслеживание", resume: "Возобновить отслеживание", quit: "Выйти", tooltip: "Daytrace — локальная история дня", startupTitle: "Daytrace не запустился", startupMessage: "Не удалось открыть локальное окно. Подробности записаны в startup.log." },
};

function appLanguage() { return String(store?.settings?.language || app.getLocale() || "en").toLowerCase().startsWith("ru") ? "ru" : "en"; }
function mainText() { return MAIN_TEXT[appLanguage()]; }
function accessibilityTrusted() { return accessibilityService?.check() ?? process.platform !== "darwin"; }
function accessibilityChanged(trusted) {
  if (!store || process.platform !== "darwin") return;
  if (trusted) {
    if (store.settings.trackingEnabled && !tracker) startTracker();
  } else if (store.settings.trackingEnabled) {
    stopTracker("permission-required");
  }
  sendState();
}
function loginItemSettings(enabled) {
  if (process.platform === "darwin") return { openAtLogin: enabled, type: "mainAppService" };
  return { openAtLogin: enabled, path: process.execPath, args: ["--background"], enabled };
}
function currentAutoStart() {
  if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) return false;
  try { return Boolean(app.getLoginItemSettings(loginItemSettings(true)).openAtLogin); } catch { return false; }
}
function analysisRuntimeStatus() {
  const engine = normalizeAnalysisEngine(store?.settings?.analysisEngine);
  const signal = smartAnalysis?.status() || { installed: false, running: false };
  const semantic = semanticAnalysis?.status() || { installed: false, running: false };
  const selected = engine === "semantic" ? semantic : engine === "signals" ? signal : { installed: true, running: false, version: "built-in" };
  return { engine, ...selected, signal, semantic };
}
function state() {
  const browserStatus = browserCompanion?.status() || { running: false };
  const smartStatus = analysisRuntimeStatus();
  return {
    ...store.state(),
    runtime: {
      platform: process.platform,
      packaged: app.isPackaged,
      trackerStatus,
      accessibilityTrusted: accessibilityTrusted(),
      macInstall: getMacInstallInfo({ platform: process.platform, packaged: app.isPackaged, execPath: process.execPath }),
      autoStartSupported: app.isPackaged && ["win32", "darwin"].includes(process.platform),
      autoStartEnabled: currentAutoStart(),
      capabilities: platformCapabilities(process.platform, app.isPackaged),
      browserCompanion: browserStatus,
      smartAnalysis: smartStatus,
      diagnostics: latestDiagnostics,
      update: { ...updateRuntime },
    },
  };
}
function sendState() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  mainWindow.webContents.send("daytrace:state-changed", state());
}
function broadcastState() { clearTimeout(broadcastTimer); broadcastTimer = setTimeout(sendState, 12_000); }

function setUpdateRuntime(patch) {
  updateRuntime = { ...updateRuntime, ...patch };
  sendState();
}

async function fetchFallbackRelease(controller) {
  const feed = await net.fetch(RELEASES_FEED, { signal: controller.signal });
  if (!feed.ok) throw new Error(`release-fallback-http-${feed.status}`);
  const feedBody = await feed.text();
  if (Buffer.byteLength(feedBody, "utf8") > MAX_RELEASE_JSON_BYTES) throw new Error("release-feed-too-large");
  const releaseUrl = feedBody.match(/href="(https:\/\/github\.com\/CaspianG\/daytrace\/releases\/tag\/v?\d+\.\d+\.\d+)"/i)?.[1];
  const version = String(releaseUrl || "").match(/\/tag\/v?(\d+\.\d+\.\d+)\/?$/i)?.[1];
  if (!version) throw new Error("invalid-release-redirect");
  const checksumsUrl = `https://github.com/CaspianG/daytrace/releases/download/v${version}/SHA256SUMS.txt`;
  const checksumsResponse = await net.fetch(checksumsUrl, { signal: controller.signal });
  if (!checksumsResponse.ok) throw new Error(`release-checksums-http-${checksumsResponse.status}`);
  const checksums = await checksumsResponse.text();
  if (Buffer.byteLength(checksums, "utf8") > MAX_RELEASE_JSON_BYTES) throw new Error("release-checksums-too-large");
  return normalizeChecksumRelease(releaseUrl, checksums, process.platform, app.getVersion());
}

async function checkForUpdates() {
  if (!app.isPackaged) { setUpdateRuntime({ status: "disabled" }); return updateRuntime; }
  if (["checking", "downloading"].includes(updateRuntime.status)) return updateRuntime;
  availableRelease = null;
  setUpdateRuntime({ status: "checking", latestVersion: null, error: null, progress: 0 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  timeout.unref();
  try {
    const response = await net.fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Daytrace/${app.getVersion()}` },
      signal: controller.signal,
    });
    let release;
    if (response.status === 403 || response.status === 429) {
      await response.body?.cancel();
      release = await fetchFallbackRelease(controller);
    } else {
      if (!response.ok) throw new Error(`release-check-http-${response.status}`);
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RELEASE_JSON_BYTES) throw new Error("release-metadata-too-large");
      release = normalizeRelease(JSON.parse(body), process.platform, app.getVersion());
    }
    if (!release) throw new Error("invalid-release-metadata");
    availableRelease = release.available ? release : null;
    if (release.available && !release.asset) throw new Error("platform-update-asset-missing");
    setUpdateRuntime({
      status: release.available ? "available" : "up-to-date",
      latestVersion: release.version,
      checkedAt: Date.now(),
      releaseUrl: release.releaseUrl,
      error: null,
    });
  } catch (error) {
    const offline = error?.name === "AbortError" || /fetch|network|internet|offline|ENOTFOUND|ECONN/i.test(String(error?.message || error));
    setUpdateRuntime({ status: offline ? "offline" : "error", checkedAt: Date.now(), error: String(error?.message || error).slice(0, 160) });
    if (!offline) startupLog("update-check-failed", error);
  } finally {
    clearTimeout(timeout);
  }
  return updateRuntime;
}

function scheduleUpdateCheck(delay = 15_000) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    await checkForUpdates();
    scheduleUpdateCheck(updateRuntime.status === "offline" ? OFFLINE_RETRY_MS : UPDATE_INTERVAL_MS);
  }, delay);
  updateTimer.unref();
}

async function sha256(file) {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function downloadAndInstallUpdate() {
  if (!app.isPackaged) return updateRuntime;
  if (["downloading", "installing", "restarting"].includes(updateRuntime.status)) return updateRuntime;
  if (!availableRelease) await checkForUpdates();
  const release = availableRelease;
  if (!release?.available || !release.asset) return updateRuntime;
  if (!release.asset.digest) {
    setUpdateRuntime({ status: "error", error: "missing-release-digest" });
    await shell.openExternal(release.releaseUrl);
    return updateRuntime;
  }
  if (release.asset.size > MAX_UPDATE_BYTES) {
    setUpdateRuntime({ status: "error", error: "update-asset-too-large" });
    return updateRuntime;
  }
  fs.mkdirSync(UPDATE_DIR, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(UPDATE_DIR, 0o700);
  const destination = path.join(UPDATE_DIR, release.asset.name);
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  updateAbortController = new AbortController();
  setUpdateRuntime({ status: "downloading", progress: 0, error: null });
  try {
    const response = await net.fetch(release.asset.downloadUrl, { signal: updateAbortController.signal });
    if (!response.ok || !response.body) throw new Error(`update-download-http-${response.status}`);
    const announcedSize = Number(response.headers.get("content-length") || release.asset.size || 0);
    if (announcedSize > MAX_UPDATE_BYTES) throw new Error("update-download-too-large");
    let received = 0;
    let lastProgressAt = 0;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_UPDATE_BYTES) return callback(new Error("update-download-too-large"));
        const now = Date.now();
        if (now - lastProgressAt > 400) {
          lastProgressAt = now;
          setUpdateRuntime({ progress: announcedSize ? Math.min(99, Math.round((received / announcedSize) * 100)) : 0 });
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(destination, { flags: "wx" }));
    if (release.asset.size && received !== release.asset.size) throw new Error("update-size-mismatch");
    if (await sha256(destination) !== release.asset.digest) throw new Error("update-digest-mismatch");
    setUpdateRuntime({ status: "ready", progress: 100, error: null });
    if (process.platform === "win32") {
      setUpdateRuntime({ status: "installing", progress: 100 });
      try {
        await prepareWindowsUpdate({
          installerPath: destination,
          currentExecutable: process.execPath,
          expectedVersion: release.version,
          tempDir: UPDATE_DIR,
          logFile: path.join(app.getPath("logs"), "updater.log"),
        });
        isQuitting = true;
        setUpdateRuntime({ status: "restarting", progress: 100 });
        setTimeout(() => app.quit(), 700).unref();
      } catch (automaticError) {
        startupLog("windows-automatic-update-fallback", automaticError);
        const openError = await shell.openPath(destination);
        if (openError) throw new Error(openError);
        setUpdateRuntime({ status: "windows-installer-opened", error: null });
      }
    } else if (process.platform === "darwin") {
      setUpdateRuntime({ status: "installing", progress: 100 });
      const installInfo = getMacInstallInfo({ platform: process.platform, packaged: app.isPackaged, execPath: process.execPath });
      try {
        await prepareMacUpdate({
          dmgPath: destination,
          currentBundlePath: installInfo.bundlePath,
          expectedVersion: release.version,
          tempDir: UPDATE_DIR,
        });
        isQuitting = true;
        setUpdateRuntime({ status: "restarting", progress: 100 });
        setTimeout(() => app.quit(), 700).unref();
      } catch (automaticError) {
        startupLog("mac-automatic-update-fallback", automaticError);
        const openError = await shell.openPath(destination);
        if (openError) throw new Error(openError);
        setUpdateRuntime({ status: "installer-opened", error: String(automaticError?.message || automaticError).slice(0, 160) });
      }
    } else {
      await shell.openExternal(release.releaseUrl);
    }
  } catch (error) {
    try { if (fs.existsSync(destination)) fs.rmSync(destination, { force: true }); } catch { }
    setUpdateRuntime({ status: error?.name === "AbortError" ? "available" : "error", error: String(error?.message || error).slice(0, 160) });
    startupLog("update-install-failed", error);
  } finally {
    updateAbortController = null;
  }
  return updateRuntime;
}

async function cleanStaleMacDuplicates() {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  const installInfo = getMacInstallInfo({ platform: process.platform, packaged: app.isPackaged, execPath: process.execPath });
  const duplicates = await findStaleMacDuplicates({ currentBundlePath: installInfo.bundlePath, currentVersion: app.getVersion() });
  for (const duplicatePath of duplicates) {
    try {
      await shell.trashItem(duplicatePath);
      startupLog(`mac-stale-duplicate-trashed path=${duplicatePath}`);
    } catch (error) {
      startupLog(`mac-stale-duplicate-cleanup-failed path=${duplicatePath}`, error);
    }
  }
}

function trackerPath() {
  if (process.platform === "win32") return app.isPackaged ? path.join(process.resourcesPath, "tracker", "windows", "Daytrace.Tracker.exe") : path.join(__dirname, "..", "native", "windows-tracker", "bin", "Release", "daytrace-win-x64", "Daytrace.Tracker.exe");
  if (process.platform === "darwin") return app.isPackaged ? path.join(path.dirname(process.execPath), "daytrace-tracker") : path.join(__dirname, "..", "native", "macos-tracker", "build", "daytrace-tracker");
  return null;
}
function probeTrackerAccessibility(prompt = false) {
  if (process.platform !== "darwin") return Promise.resolve(true);
  const executable = trackerPath();
  if (!executable || !fs.existsSync(executable)) {
    startupLog(`accessibility-probe-unavailable path=${executable || "none"}`);
    return Promise.resolve(Boolean(systemPreferences.isTrustedAccessibilityClient(Boolean(prompt))));
  }
  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;
    const finish = (trusted) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(Boolean(trusted));
    };
    let child;
    try {
      child = spawn(executable, [prompt ? "--request-accessibility" : "--check-accessibility"], { windowsHide: true, stdio: "ignore" });
    } catch (error) {
      startupLog("accessibility-probe-spawn-failed", error);
      finish(false);
      return;
    }
    timeout = setTimeout(() => {
      child.kill();
      startupLog("accessibility-probe-timeout");
      finish(false);
    }, 5_000);
    timeout.unref?.();
    child.once("error", (error) => { startupLog("accessibility-probe-error", error); finish(false); });
    child.once("exit", (code) => finish(code === 0));
  });
}
function startTracker() {
  if (tracker || trackerStarting || !store?.settings.trackingEnabled) return;
  trackerStarting = true;
  try {
    if (process.platform === "darwin" && !accessibilityTrusted()) { trackerStatus = "permission-required"; accessibilityService?.watch(); sendState(); return; }
    const executable = trackerPath();
    if (!executable || !fs.existsSync(executable)) { trackerStatus = "unavailable"; startupLog(`tracker-unavailable path=${executable || "none"}`); sendState(); return; }
    trackerStatus = "starting";
    const child = spawn(executable, [], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DAYTRACE_COLLECT_TITLES: store.settings.collectWindowTitles ? "1" : "0",
        DAYTRACE_COLLECT_INPUT: store.settings.collectInputCounts ? "1" : "0",
        DAYTRACE_COLLECT_TAB_COUNT: store.settings.collectBrowserTabCount ? "1" : "0",
      },
    });
    tracker = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        if (tracker === child && trackerStatus === "starting") {
          trackerStatus = "running";
          accessibilityService?.mark(true);
          sendState();
        }
        store.append(event);
      } catch { }
    });
    child.once("error", (error) => {
      if (tracker !== child) return;
      trackerStatus = "error"; tracker = null; startupLog("tracker-error", error); sendState();
    });
    child.once("exit", (code) => {
      if (tracker !== child) return;
      tracker = null;
      if (!isQuitting && store.settings.trackingEnabled) {
        trackerStatus = code === 77 ? "permission-required" : code === 0 ? "stopped" : "error";
        if (code === 77) { accessibilityService?.mark(false); accessibilityService?.watch(); }
      }
      sendState();
    });
    child.stderr.on("data", (chunk) => startupLog(`tracker-stderr ${String(chunk).trim()}`));
  } catch (error) { tracker = null; trackerStatus = "error"; startupLog("tracker-spawn-failed", error); }
  finally { trackerStarting = false; }
  sendState();
}
function stopTracker(status = "paused") { const child = tracker; tracker = null; trackerStarting = false; if (child) child.kill(); trackerStatus = status; sendState(); }
function restartTracker() {
  const shouldRun = Boolean(store?.settings.trackingEnabled);
  stopTracker(shouldRun ? "starting" : "paused");
  if (shouldRun) setTimeout(startTracker, 250).unref();
}

function trayIconPath() { return path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"); }
function updateTrayMenu() {
  if (!tray || !store) return;
  const t = mainText();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: () => void openWindow() },
    { label: store.settings.trackingEnabled ? t.pause : t.resume, click: () => { const enabled = !store.settings.trackingEnabled; setTracking(enabled); } },
    { type: "separator" },
    { label: t.quit, click: () => { isQuitting = true; app.quit(); } },
  ]));
}
function createTray() {
  if (tray) return;
  let icon = nativeImage.createFromPath(trayIconPath());
  if (process.platform === "darwin") { icon = icon.resize({ width: 18, height: 18 }); icon.setTemplateImage(true); }
  tray = new Tray(icon); tray.setToolTip(mainText().tooltip); tray.on("double-click", () => void openWindow()); updateTrayMenu();
}
function scheduleWindowRelease(window) {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) { window.destroy(); startupLog("window-released-after-grace"); }
  }, 30_000);
  releaseTimer.unref();
}
function hideWindow(window) { if (isQuitting || !window || window.isDestroyed()) return; window.hide(); scheduleWindowRelease(window); }

function openAllowedExternal(url) {
  if (!isSafeExternalUrl(url)) return;
  void shell.openExternal(url).catch((error) => startupLog("external-link-open-failed", error));
}

function secureWindowNavigation(window) {
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url, { packaged: USE_LOCAL_RENDERER, rendererFile: RENDERER_FILE, devOrigin: DEV_RENDERER_ORIGIN })) return;
    event.preventDefault();
    openAllowedExternal(url);
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternal(url);
    return { action: "deny" };
  });
}

async function createSemanticHostWindow() {
  const window = new BrowserWindow({
    width: 360, height: 240, show: false, backgroundColor: "#fbfaf7",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  semanticWindow = window;
  secureWindowNavigation(window);
  window.webContents.on("console-message", (details) => { if (details.level === "error") startupLog(`semantic-renderer-error ${details.message}`); });
  window.webContents.on("did-fail-load", (_event, code, description, url) => startupLog(`semantic-did-fail-load code=${code} description=${description} url=${url}`));
  window.webContents.on("render-process-gone", (_event, details) => {
    startupLog(`semantic-renderer-gone reason=${details.reason}`);
    if (semanticAnalysis?.active) semanticAnalysis.cancel(`Semantic analysis process exited: ${details.reason}`);
    if (!window.isDestroyed()) window.destroy();
  });
  window.on("closed", () => { if (semanticWindow === window) semanticWindow = null; });
  try {
    if (!USE_LOCAL_RENDERER) await window.loadURL(`${DEV_RENDERER_ORIGIN}?semanticHost=1`);
    else await window.loadFile(RENDERER_FILE, { query: { semanticHost: "1" } });
    const ready = await window.webContents.executeJavaScript("new Promise((resolve) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceSemanticHostReady ? resolve(true) : Date.now() >= deadline ? resolve(false) : setTimeout(check, 25); check(); })");
    if (!ready) throw new Error("Semantic worker host did not become ready");
    startupLog("semantic-window-ready-background");
    return window;
  } catch (error) {
    if (semanticAnalysis?.active) semanticAnalysis.cancel(error?.message || "Semantic analysis host failed");
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

async function ensureSemanticHostWindow() {
  if (semanticWindow && !semanticWindow.isDestroyed()) return semanticWindow;
  if (!creatingSemanticWindow) creatingSemanticWindow = createSemanticHostWindow().finally(() => { creatingSemanticWindow = null; });
  return creatingSemanticWindow;
}

async function createWindow(showWindow = true) {
  startupLog(`createWindow packaged=${app.isPackaged}`);
  const window = new BrowserWindow({
    width: 1488, height: 1058, minWidth: 1080, minHeight: 720, backgroundColor: "#fbfaf7", title: "Daytrace",
    titleBarStyle: "hidden", titleBarOverlay: { color: "#fbfaf7", symbolColor: "#292823", height: 38 }, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  });
  mainWindow = window;
  secureWindowNavigation(window);
  window.webContents.on("did-finish-load", () => startupLog("did-finish-load"));
  window.webContents.on("console-message", (details) => { if (details.level === "error") startupLog(`renderer-error ${details.message}`); });
  window.webContents.on("did-fail-load", (_event, code, description, url) => startupLog(`did-fail-load code=${code} description=${description} url=${url}`));
  window.webContents.on("render-process-gone", (_event, details) => {
    startupLog(`renderer-gone reason=${details.reason}`);
    if (semanticAnalysis?.active) semanticAnalysis.cancel(`Semantic analysis process exited: ${details.reason}`);
  });
  window.on("minimize", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("close", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("focus", () => {
    if (process.platform !== "darwin") return;
    void accessibilityService?.refresh(false).then((trusted) => { if (trusted) startTracker(); else accessibilityService?.watch(); sendState(); });
  });
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  if (!USE_LOCAL_RENDERER) await window.loadURL(DEV_RENDERER_ORIGIN);
  else await window.loadFile(RENDERER_FILE);
  const renderer = await window.webContents.executeJavaScript("new Promise((resolve) => { const deadline = Date.now() + 10000; const check = () => { const root = document.getElementById('root'); if (window.__daytraceAppReady && root?.childElementCount > 0 && root?.innerText.trim().length > 0) resolve({ children: root.childElementCount, text: root.innerText.trim().length }); else if (Date.now() >= deadline) resolve({ children: 0, text: 0 }); else setTimeout(check, 25); }; check(); })");
  if (renderer.children < 1 || renderer.text < 1) throw new Error("Renderer loaded without visible content");
  const bridgeReady = await window.webContents.executeJavaScript("window.daytrace?.getState().then((value) => Boolean(value?.settings && value?.runtime)).catch(() => false)");
  if (!bridgeReady) throw new Error("Renderer could not reach the local Daytrace service");
  if (SMOKE_TEST) {
    startupLog(`desktop-smoke-ready children=${renderer.children} text=${renderer.text}`);
  } else if (showWindow) {
    window.show(); window.focus(); startupLog(`window-visible children=${renderer.children} text=${renderer.text}`);
    if (windowsUpdateReadyRequest) {
      confirmWindowsUpdateReady(windowsUpdateReadyRequest);
      startupLog("windows-update-ready-confirmed");
    }
    if (macUpdateReadyRequest) {
      confirmMacUpdateReady(macUpdateReadyRequest);
      startupLog("mac-update-ready-confirmed");
    }
  } else startupLog(`window-ready-background children=${renderer.children} text=${renderer.text}`);
  setTimeout(startTracker, 400).unref();
  return window;
}
async function openWindow(showWindow = true) {
  clearTimeout(releaseTimer);
  if (showWindow) semanticBackgroundWindowOwned = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (showWindow) { mainWindow.show(); mainWindow.focus(); }
    sendState(); return mainWindow;
  }
  if (!creatingWindow) creatingWindow = createWindow(showWindow).finally(() => { creatingWindow = null; });
  const window = await creatingWindow;
  if (showWindow && !SMOKE_TEST && !window.isVisible()) { window.show(); window.focus(); }
  return window;
}

function setTracking(enabled) {
  store.updateSettings({ trackingEnabled: Boolean(enabled) });
  if (enabled) startTracker(); else stopTracker("paused");
  updateTrayMenu(); return state();
}

function extensionFolder() {
  return app.isPackaged ? path.join(process.resourcesPath, "browser-extension") : path.join(__dirname, "..", "browser-extension");
}

async function syncBrowserCompanion() {
  if (!browserCompanion || !store) return;
  if (store.settings.browserCompanionEnabled) {
    try { await browserCompanion.start(); }
    catch (error) { startupLog("browser-companion-start-failed", error); }
  } else browserCompanion.stop();
  sendState();
}

async function runSmartAnalysis(force = false) {
  const engine = normalizeAnalysisEngine(store?.settings?.analysisEngine);
  if (engine === "builtin") return { status: "disabled", rules: [] };
  if (!force && powerMonitor.getSystemIdleTime() < 120) return { status: "waiting-for-idle", rules: [] };
  if (engine === "semantic") return requestSemanticAnalysis();
  if (!smartAnalysis) return { status: "unavailable", rules: [] };
  try {
    const analysis = smartAnalysis.analyze(store);
    sendState();
    const result = await analysis;
    sendState();
    return result;
  } catch (error) {
    startupLog("smart-analysis-failed", error);
    sendState();
    throw error;
  }
}

function requestSemanticAnalysis() {
  if (!semanticAnalysis?.status().installed) return { status: "model-required" };
  if (semanticAnalysis.status().running) return { status: "busy" };
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!store.smartAnalysisCandidates(1, 30).length) {
      const result = semanticAnalysis.begin(store);
      sendState();
      return result;
    }
    if (semanticRequestPending) return { status: "requested" };
    semanticRequestPending = true;
    void ensureSemanticHostWindow().then((window) => {
      if (store.settings.analysisEngine === "semantic" && semanticAnalysis?.status().installed && !window.isDestroyed()) window.webContents.send("daytrace:semantic-analysis-requested");
      else if (!window.isDestroyed()) window.destroy();
    }).catch((error) => startupLog("semantic-background-window-failed", error)).finally(() => { semanticRequestPending = false; });
    return { status: "requested" };
  }
  clearTimeout(releaseTimer);
  if (!mainWindow.isVisible()) semanticBackgroundWindowOwned = true;
  mainWindow.webContents.send("daytrace:semantic-analysis-requested");
  return { status: "requested" };
}

function releaseSemanticBackgroundWindow() {
  if (semanticWindow && !semanticWindow.isDestroyed()) {
    const completedWindow = semanticWindow;
    setTimeout(() => { if (semanticWindow === completedWindow && !completedWindow.isDestroyed()) completedWindow.destroy(); }, 100).unref();
  }
  if (semanticBackgroundWindowOwned) {
    semanticBackgroundWindowOwned = false;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) scheduleWindowRelease(mainWindow);
  }
}

function scheduleSmartAnalysis() {
  clearInterval(smartAnalysisTimer);
  smartAnalysisTimer = setInterval(() => void runSmartAnalysis(false).catch(() => {}), 5 * 60_000);
  smartAnalysisTimer.unref();
  setTimeout(() => void runSmartAnalysis(false).catch(() => {}), 60_000).unref();
}

function refreshDiagnostics() {
  latestDiagnostics = runDiagnostics({
    store,
    platform: process.platform,
    packaged: app.isPackaged,
    trackerStatus,
    trackerExecutable: trackerPath() || "",
    accessibilityTrusted: accessibilityTrusted(),
    autoStartEnabled: currentAutoStart(),
    browserStatus: browserCompanion?.status() || {},
    smartStatus: analysisRuntimeStatus(),
  });
  sendState();
  return latestDiagnostics;
}

async function chooseExport(format) {
  const normalized = format === "csv" ? "csv" : "json";
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: normalized === "csv" ? "Export Daytrace CSV" : "Export Daytrace JSON",
    defaultPath: `Daytrace-export-${new Date().toISOString().slice(0, 10)}.${normalized}`,
    filters: [{ name: normalized.toUpperCase(), extensions: [normalized] }],
  });
  if (selected.canceled || !selected.filePath) return "";
  return normalized === "csv" ? exportCsv(store, selected.filePath) : exportJson(store, selected.filePath, app.getVersion());
}

async function chooseBackup(passphrase) {
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: "Create encrypted Daytrace backup",
    defaultPath: `Daytrace-backup-${new Date().toISOString().slice(0, 10)}.daytrace`,
    filters: [{ name: "Encrypted Daytrace backup", extensions: ["daytrace"] }],
  });
  if (selected.canceled || !selected.filePath) return "";
  return createEncryptedBackup(store, selected.filePath, passphrase, app.getVersion());
}

async function chooseRestore(passphrase) {
  const selected = await dialog.showOpenDialog(mainWindow, {
    title: "Restore encrypted Daytrace backup",
    properties: ["openFile"],
    filters: [{ name: "Encrypted Daytrace backup", extensions: ["daytrace"] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return state();
  if (smartAnalysis?.status().running || semanticAnalysis?.status().running) throw new Error("Wait for local smart analysis to finish before restoring a backup");
  const wasTracking = store.settings.trackingEnabled;
  stopTracker("stopped");
  browserCompanion?.stop();
  try {
    await restoreEncryptedBackup(DATA_ROOT, selected.filePaths[0], passphrase, { defaultLanguage: app.getLocale() });
    store = new EventStore(DATA_ROOT, broadcastState, { defaultLanguage: app.getLocale() });
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    await syncBrowserCompanion();
    if (store.settings.trackingEnabled || wasTracking) startTracker();
    latestDiagnostics = null;
    return state();
  } catch (error) {
    store = new EventStore(DATA_ROOT, broadcastState, { defaultLanguage: app.getLocale() });
    await syncBrowserCompanion();
    if (store.settings.trackingEnabled || wasTracking) startTracker();
    throw error;
  }
}

function handleIpc(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event, {
      expectedWebContents: [mainWindow?.webContents, semanticWindow?.webContents].filter(Boolean),
      packaged: USE_LOCAL_RENDERER,
      rendererFile: RENDERER_FILE,
      devOrigin: DEV_RENDERER_ORIGIN,
    });
    return listener(...args);
  });
}
function registerIpc() {
  handleIpc("daytrace:get-state", () => state());
  handleIpc("daytrace:get-day", (day) => store.dayState(day));
  handleIpc("daytrace:ask", (question) => store.ask(question));
  handleIpc("daytrace:set-tracking", (enabled) => setTracking(enabled));
  handleIpc("daytrace:set-setting", async (key, value) => {
    const allowed = new Set(["excludePrivateWindows", "collectWindowTitles", "collectInputCounts", "collectBrowserTabCount", "browserCompanionEnabled"]);
    if (!allowed.has(key)) throw new Error("Unsupported setting");
    const enabled = key === "collectBrowserTabCount" && !platformCapabilities(process.platform, app.isPackaged).browserTabCount ? false : Boolean(value);
    store.updateSettings({ [key]: enabled });
    if (["collectWindowTitles", "collectInputCounts", "collectBrowserTabCount"].includes(key)) restartTracker();
    if (key === "browserCompanionEnabled") await syncBrowserCompanion();
    return state();
  });
  handleIpc("daytrace:set-analysis-engine", async (engine) => {
    const normalized = normalizeAnalysisEngine(engine);
    store.updateSettings({ analysisEngine: normalized });
    if (normalized === "signals" && smartAnalysis?.status().installed) await runSmartAnalysis(true);
    if (normalized === "semantic" && semanticAnalysis?.status().installed) setTimeout(requestSemanticAnalysis, 50).unref();
    return state();
  });
  handleIpc("daytrace:set-retention", (hours) => { store.updateSettings({ retentionHours: hours }); return state(); });
  handleIpc("daytrace:set-autostart", (enabled) => {
    if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) return state();
    app.setLoginItemSettings(loginItemSettings(Boolean(enabled)));
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    return state();
  });
  handleIpc("daytrace:request-accessibility", async () => {
    if (process.platform === "darwin") await accessibilityService.request();
    if (accessibilityTrusted()) startTracker();
    else { trackerStatus = "permission-required"; accessibilityService?.watch(); }
    sendState();
    return state();
  });
  handleIpc("daytrace:refresh-accessibility", async () => {
    if (process.platform === "darwin") await accessibilityService.refresh(false);
    if (accessibilityTrusted()) startTracker();
    else { trackerStatus = "permission-required"; accessibilityService?.watch(); }
    sendState();
    return state();
  });
  handleIpc("daytrace:dismiss-accessibility-onboarding", () => {
    store.updateSettings({ accessibilityOnboardingDismissed: true });
    return state();
  });
  handleIpc("daytrace:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  handleIpc("daytrace:set-exclusions", (apps) => { store.updateSettings({ excludedApps: apps }); return state(); });
  handleIpc("daytrace:preview-intent-rules", (rules) => store.previewIntentRules(Array.isArray(rules) ? rules : []));
  handleIpc("daytrace:set-intent-rules", (rules) => store.applyIntentRules(Array.isArray(rules) ? rules : []));
  handleIpc("daytrace:undo-intent-rules", () => store.undoIntentRules());
  handleIpc("daytrace:set-language", (language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en" }); if (tray) tray.setToolTip(mainText().tooltip); updateTrayMenu(); return state(); });
  handleIpc("daytrace:complete-onboarding", (selection) => {
    const input = selection && typeof selection === "object" ? selection : { language: selection };
    const language = String(input.language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
    const analysisEngine = normalizeAnalysisEngine(input.analysisEngine || store.settings.analysisEngine);
    if (analysisEngine === "signals" && !smartAnalysis?.status().installed) throw new Error("Install the signal pack before selecting it during onboarding");
    if (analysisEngine === "semantic" && !semanticAnalysis?.status().installed) throw new Error("Install the semantic model before selecting it during onboarding");
    store.updateSettings({ language, analysisEngine, onboardingComplete: true, onboardingVersion: CURRENT_ONBOARDING_VERSION });
    updateTrayMenu();
    if (analysisEngine === "signals") setTimeout(() => void runSmartAnalysis(true).catch(() => {}), 50).unref();
    if (analysisEngine === "semantic") setTimeout(requestSemanticAnalysis, 50).unref();
    return state();
  });
  handleIpc("daytrace:restart-onboarding", () => {
    store.updateSettings({ onboardingVersion: Math.max(0, CURRENT_ONBOARDING_VERSION - 1) });
    return state();
  });
  handleIpc("daytrace:acknowledge-review-guidance", (action) => {
    const normalized = ["review", "model", "later", "understood"].includes(String(action)) ? String(action) : "later";
    const delay = normalized === "later" ? REVIEW_LATER_SNOOZE_MS : REVIEW_ACTION_SNOOZE_MS;
    const backlog = store.state().reviewBacklog || {};
    store.updateSettings({
      reviewLearningExplained: true,
      reviewReminderSnoozedUntil: Date.now() + delay,
      reviewReminderLastCount: Math.max(0, Number(backlog.uniqueCount || 0)),
    });
    return state();
  });
  handleIpc("daytrace:delete-all", () => { store.deleteAll(); return state(); });
  handleIpc("daytrace:delete-session", (start, end) => { store.deleteRange(start, end); return state(); });
  handleIpc("daytrace:export-skill", (skill) => store.exportSkill(skill));
  handleIpc("daytrace:export-data", (format) => chooseExport(format));
  handleIpc("daytrace:create-backup", (passphrase) => chooseBackup(passphrase));
  handleIpc("daytrace:restore-backup", (passphrase) => chooseRestore(passphrase));
  handleIpc("daytrace:run-diagnostics", () => refreshDiagnostics());
  handleIpc("daytrace:install-browser-host", async () => {
    if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) throw new Error("Install the packaged Daytrace app before enabling the browser companion");
    const hostExecutable = process.platform === "win32" ? trackerPath() : process.execPath;
    const installed = installNativeHost({ root: store.root, executable: hostExecutable, platform: process.platform });
    store.updateSettings({ browserCompanionEnabled: true });
    await syncBrowserCompanion();
    return { ...state(), browserHost: installed };
  });
  handleIpc("daytrace:reveal-browser-extension", async () => {
    const folder = extensionFolder();
    if (!fs.existsSync(path.join(folder, "manifest.json"))) throw new Error("Browser extension files are missing");
    shell.showItemInFolder(path.join(folder, "manifest.json"));
    return folder;
  });
  handleIpc("daytrace:download-smart-model", async () => {
    await smartAnalysis.download();
    store.updateSettings({ analysisEngine: "signals" });
    await runSmartAnalysis(true);
    return state();
  });
  handleIpc("daytrace:install-smart-model", async () => {
    const selected = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "Daytrace smart model", extensions: ["json"] }] });
    if (!selected.canceled && selected.filePaths[0]) {
      smartAnalysis.installFile(selected.filePaths[0]);
      store.updateSettings({ analysisEngine: "signals" });
      await runSmartAnalysis(true);
    }
    return state();
  });
  handleIpc("daytrace:remove-smart-model", () => { smartAnalysis.remove(); if (store.settings.analysisEngine === "signals") store.updateSettings({ analysisEngine: "builtin" }); return state(); });
  handleIpc("daytrace:run-smart-analysis", async () => { await runSmartAnalysis(true); return state(); });
  handleIpc("daytrace:download-semantic-model", async () => {
    await semanticAnalysis.download();
    store.updateSettings({ analysisEngine: "semantic" });
    return state();
  });
  handleIpc("daytrace:remove-semantic-model", () => { semanticAnalysis.remove(); if (store.settings.analysisEngine === "semantic") store.updateSettings({ analysisEngine: "builtin" }); return state(); });
  handleIpc("daytrace:begin-semantic-analysis", () => { const result = semanticAnalysis.begin(store); if (result.status !== "ready") releaseSemanticBackgroundWindow(); return result; });
  handleIpc("daytrace:report-semantic-analysis", (token, progress, stage) => semanticAnalysis.report(String(token || ""), progress, stage));
  handleIpc("daytrace:finish-semantic-analysis", (token, decisions) => { semanticAnalysis.complete(String(token || ""), decisions, store); const nextState = state(); releaseSemanticBackgroundWindow(); return nextState; });
  handleIpc("daytrace:fail-semantic-analysis", (token, error) => { if (semanticAnalysis.active?.token === String(token || "")) semanticAnalysis.cancel(error); const nextState = state(); releaseSemanticBackgroundWindow(); return nextState; });
  handleIpc("daytrace:reveal-data", () => shell.openPath(store.root));
  handleIpc("daytrace:check-updates", async () => { await checkForUpdates(); return state(); });
  handleIpc("daytrace:install-update", async () => { await downloadAndInstallUpdate(); return state(); });
}

const nativeMessagingOrigin = process.argv.find((argument) => /^chrome-extension:\/\/[a-p]{32}\/$/.test(String(argument)));
if (nativeMessagingOrigin) {
  runNativeMessagingHost({ root: DATA_ROOT, origin: nativeMessagingOrigin })
    .catch(() => {})
    .finally(() => app.exit(0));
} else {
  startupLog(`process-start version=${app.getVersion()}`);
  if (!app.requestSingleInstanceLock()) app.quit();
  else app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      store = new EventStore(DATA_ROOT, broadcastState, { defaultLanguage: app.getLocale() });
      smartAnalysis = new SmartAnalysisService(DATA_ROOT, { version: app.getVersion(), fetch: (url, options) => net.fetch(url, options) });
      semanticAnalysis = new SemanticModelService(DATA_ROOT, {
        version: app.getVersion(),
        fetch: (url, options) => net.fetch(url, options),
        developmentAssetRoot: app.isPackaged ? "" : path.join(__dirname, "..", "models"),
        onChange: sendState,
      });
      browserCompanion = new BrowserCompanionService(DATA_ROOT, (context) => Boolean(store?.settings.browserCompanionEnabled && store.append(context)));
      accessibilityService = createAccessibilityService({
        platform: process.platform,
        isTrusted: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
        probeTrusted: process.platform === "darwin" ? probeTrackerAccessibility : null,
        openExternal: async (url) => {
          try { await shell.openExternal(url); }
          catch (error) { startupLog("accessibility-settings-open-failed", error); }
        },
        onChange: accessibilityChanged,
      });
      await accessibilityService.refresh(false);
      store.updateSettings({ autoStartEnabled: currentAutoStart() });
      await syncBrowserCompanion();
      registerIpc(); createTray();
      const launchedInBackground = process.argv.includes("--background") || app.getLoginItemSettings().wasOpenedAtLogin || app.getLoginItemSettings().wasOpenedAsHidden;
      if (!launchedInBackground) await openWindow(); else setTimeout(startTracker, 400).unref();
      if (SEMANTIC_SMOKE_TEST) {
        await semanticAnalysis.download();
        store.updateSettings({ analysisEngine: "semantic" });
        const observedAt = Date.now() - 10_000;
        store.append({ at: new Date(observedAt).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Согласуем структуру кабинета с командой", context: "messaging" });
        store.append({ at: new Date(observedAt + 2_000).toISOString(), kind: "heartbeat", app: "Telegram Desktop", title: "Согласуем структуру кабинета с командой", context: "messaging" });
        store.append({ at: new Date(observedAt + 3_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "Prepare the quarterly plan for our department", domain: "acme.invalid", context: "browser" });
        store.append({ at: new Date(observedAt + 5_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Prepare the quarterly plan for our department", domain: "acme.invalid", context: "browser" });
        await new Promise((resolve) => setTimeout(resolve, 150));
        const semanticStartedAt = Date.now();
        const totalPrivateMiB = () => app.getAppMetrics().reduce((total, metric) => total + Number(metric.memory?.privateBytes || 0), 0) / 1024;
        const baselinePrivateMiB = totalPrivateMiB();
        let peakPrivateMiB = baselinePrivateMiB;
        requestSemanticAnalysis();
        const deadline = Date.now() + 90_000;
        while (["never"].includes(semanticAnalysis.status().lastResult.status) && Date.now() < deadline) {
          if (semanticAnalysis.status().error) throw new Error(semanticAnalysis.status().error);
          peakPrivateMiB = Math.max(peakPrivateMiB, totalPrivateMiB());
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const result = semanticAnalysis.status().lastResult;
        const englishRule = store.smartRules.find((rule) => rule.source === "semantic-model" && rule.domain === "acme.invalid");
        const russianRule = store.smartRules.find((rule) => rule.source === "semantic-model" && rule.title === "Согласуем структуру кабинета с командой");
        if (result.status !== "complete" || result.refined < 2 || englishRule?.intent !== "work" || russianRule?.intent !== "work") throw new Error(`Semantic renderer smoke did not produce both RU/EN exact rules: ${JSON.stringify(result)}`);
        await new Promise((resolve) => setTimeout(resolve, 175));
        if (semanticWindow && !semanticWindow.isDestroyed()) throw new Error("Semantic background window remained resident after analysis");
        startupLog(`semantic-desktop-smoke-passed refined=${result.refined} changed=${result.changed} durationMs=${Date.now() - semanticStartedAt} baselinePrivateMiB=${baselinePrivateMiB.toFixed(1)} peakPrivateMiB=${peakPrivateMiB.toFixed(1)}`);
        isQuitting = true; app.exit(0); return;
      }
      if (SMOKE_TEST) { startupLog("desktop-smoke-passed"); isQuitting = true; app.exit(0); return; }
      setTimeout(() => void cleanStaleMacDuplicates(), 1_000).unref();
      setTimeout(refreshDiagnostics, 3_000).unref();
      setInterval(() => store.prune(), 15 * 60_000).unref();
      scheduleSmartAnalysis();
      scheduleUpdateCheck();
    } catch (error) {
      startupLog("startup-failed", error);
      if (SMOKE_TEST) { isQuitting = true; app.exit(1); return; }
      const t = mainText(); dialog.showErrorBox(t.startupTitle, t.startupMessage); app.quit();
    }
  });
  app.on("window-all-closed", () => { });
  app.on("activate", () => {
    if (process.platform === "darwin") void accessibilityService?.refresh(false).then((trusted) => { if (trusted) startTracker(); else accessibilityService?.watch(); });
    else startTracker();
    void openWindow();
  });
  app.on("second-instance", () => void openWindow());
  app.on("before-quit", () => {
    isQuitting = true;
    clearTimeout(releaseTimer);
    clearTimeout(updateTimer);
    clearInterval(smartAnalysisTimer);
    updateAbortController?.abort();
    accessibilityService?.stop();
    browserCompanion?.stop();
    semanticAnalysis?.cancel();
    stopTracker("stopped");
  });
}
