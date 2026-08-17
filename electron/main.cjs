const { app, BrowserWindow, ipcMain, Menu, nativeImage, net, shell, systemPreferences, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { EventStore } = require("./lib/event-store.cjs");
const { createAccessibilityService } = require("./lib/accessibility-service.cjs");
const { getMacInstallInfo } = require("./lib/mac-install-service.cjs");
const { MAX_RELEASE_JSON_BYTES, MAX_UPDATE_BYTES, normalizeChecksumRelease, normalizeRelease, windowsInstallerArgs } = require("./lib/update-service.cjs");

app.disableHardwareAcceleration();
const startupLogPath = path.join(app.getPath("userData"), "startup.log");
function startupLog(message, error = null) {
  const suffix = error ? `\n${error?.stack || String(error)}` : "";
  try { fs.mkdirSync(path.dirname(startupLogPath), { recursive: true }); fs.appendFileSync(startupLogPath, `${new Date().toISOString()} ${message}${suffix}\n`, "utf8"); } catch { }
}
process.on("uncaughtException", (error) => startupLog("uncaughtException", error));
process.on("unhandledRejection", (error) => startupLog("unhandledRejection", error));

let mainWindow = null;
let creatingWindow = null;
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
  } else if (store.settings.trackingEnabled && !tracker) {
    trackerStatus = "permission-required";
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
function state() {
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
  const updateDir = path.join(app.getPath("temp"), "daytrace-updates");
  fs.mkdirSync(updateDir, { recursive: true });
  const destination = path.join(updateDir, release.asset.name);
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
      const installer = spawn(destination, windowsInstallerArgs(process.execPath), { detached: true, windowsHide: true, stdio: "ignore" });
      await new Promise((resolve, reject) => {
        installer.once("spawn", resolve);
        installer.once("error", reject);
      });
      installer.unref();
      isQuitting = true;
      setUpdateRuntime({ status: "restarting", progress: 100 });
      setTimeout(() => app.quit(), 700).unref();
    } else if (process.platform === "darwin") {
      const openError = await shell.openPath(destination);
      if (openError) throw new Error(openError);
      setUpdateRuntime({ status: "installer-opened" });
    } else {
      await shell.openExternal(release.releaseUrl);
    }
  } catch (error) {
    setUpdateRuntime({ status: error?.name === "AbortError" ? "available" : "error", error: String(error?.message || error).slice(0, 160) });
    startupLog("update-install-failed", error);
  } finally {
    updateAbortController = null;
  }
  return updateRuntime;
}

function trackerPath() {
  if (process.platform === "win32") return app.isPackaged ? path.join(process.resourcesPath, "tracker", "windows", "Daytrace.Tracker.exe") : path.join(__dirname, "..", "native", "windows-tracker", "bin", "Release", "net8.0-windows", "win-x64", "publish", "Daytrace.Tracker.exe");
  if (process.platform === "darwin") return app.isPackaged ? path.join(process.resourcesPath, "tracker", "macos", "daytrace-tracker") : path.join(__dirname, "..", "native", "macos-tracker", "build", "daytrace-tracker");
  return null;
}
function startTracker() {
  if (tracker || !store?.settings.trackingEnabled) return;
  if (process.platform === "darwin" && !accessibilityTrusted()) { trackerStatus = "permission-required"; accessibilityService?.watch(); sendState(); return; }
  const executable = trackerPath();
  if (!executable || !fs.existsSync(executable)) { trackerStatus = "unavailable"; startupLog(`tracker-unavailable path=${executable || "none"}`); sendState(); return; }
  trackerStatus = "starting";
  try {
    tracker = spawn(executable, [], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DAYTRACE_COLLECT_TITLES: store.settings.collectWindowTitles ? "1" : "0",
        DAYTRACE_COLLECT_INPUT: store.settings.collectInputCounts ? "1" : "0",
        DAYTRACE_COLLECT_TAB_COUNT: store.settings.collectBrowserTabCount ? "1" : "0",
      },
    });
    trackerStatus = "running";
    const lines = readline.createInterface({ input: tracker.stdout });
    lines.on("line", (line) => { try { store.append(JSON.parse(line)); } catch { } });
    tracker.once("error", (error) => { trackerStatus = "error"; tracker = null; startupLog("tracker-error", error); sendState(); });
    tracker.once("exit", (code) => {
      tracker = null;
      if (!isQuitting && store.settings.trackingEnabled) {
        trackerStatus = code === 77 ? "permission-required" : code === 0 ? "stopped" : "error";
        if (code === 77) accessibilityService?.watch();
      }
      sendState();
    });
    tracker.stderr.on("data", (chunk) => startupLog(`tracker-stderr ${String(chunk).trim()}`));
  } catch (error) { tracker = null; trackerStatus = "error"; startupLog("tracker-spawn-failed", error); }
  sendState();
}
function stopTracker(status = "paused") { if (tracker) tracker.kill(); tracker = null; trackerStatus = status; sendState(); }
function restartTracker() { stopTracker("starting"); setTimeout(startTracker, 250).unref(); }

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

async function createWindow() {
  startupLog(`createWindow packaged=${app.isPackaged}`);
  const window = new BrowserWindow({
    width: 1488, height: 1058, minWidth: 1080, minHeight: 720, backgroundColor: "#fbfaf7", title: "Daytrace",
    titleBarStyle: "hidden", titleBarOverlay: { color: "#fbfaf7", symbolColor: "#292823", height: 38 }, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  });
  mainWindow = window;
  window.webContents.on("did-finish-load", () => startupLog("did-finish-load"));
  window.webContents.on("console-message", (_event, details) => { if (details.level === "error") startupLog(`renderer-error ${details.message}`); });
  window.webContents.on("did-fail-load", (_event, code, description, url) => startupLog(`did-fail-load code=${code} description=${description} url=${url}`));
  window.on("minimize", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("close", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("focus", () => { if (process.platform === "darwin") { accessibilityService?.check(); startTracker(); } });
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  if (!app.isPackaged) await window.loadURL("http://127.0.0.1:5173");
  else await window.loadFile(path.join(__dirname, "..", "dist", "client", "index.html"));
  const renderer = await window.webContents.executeJavaScript("(() => { const root = document.getElementById('root'); return { children: root?.childElementCount || 0, text: root?.innerText.trim().length || 0 }; })()");
  if (renderer.children < 1 || renderer.text < 1) throw new Error("Renderer loaded without visible content");
  window.show(); window.focus(); startupLog(`window-visible children=${renderer.children} text=${renderer.text}`);
  setTimeout(startTracker, 400).unref();
  return window;
}
async function openWindow() {
  clearTimeout(releaseTimer);
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); sendState(); return mainWindow; }
  if (!creatingWindow) creatingWindow = createWindow().finally(() => { creatingWindow = null; });
  return creatingWindow;
}

function setTracking(enabled) {
  store.updateSettings({ trackingEnabled: Boolean(enabled) });
  if (enabled) startTracker(); else stopTracker("paused");
  updateTrayMenu(); return state();
}
function registerIpc() {
  ipcMain.handle("daytrace:get-state", () => state());
  ipcMain.handle("daytrace:get-day", (_event, day) => store.dayState(day));
  ipcMain.handle("daytrace:ask", (_event, question) => store.ask(question));
  ipcMain.handle("daytrace:set-tracking", (_event, enabled) => setTracking(enabled));
  ipcMain.handle("daytrace:set-setting", (_event, key, value) => {
    const allowed = new Set(["excludePrivateWindows", "collectWindowTitles", "collectInputCounts", "collectBrowserTabCount"]);
    if (!allowed.has(key)) throw new Error("Unsupported setting");
    store.updateSettings({ [key]: Boolean(value) }); restartTracker(); return state();
  });
  ipcMain.handle("daytrace:set-retention", (_event, hours) => { store.updateSettings({ retentionHours: hours }); return state(); });
  ipcMain.handle("daytrace:set-autostart", (_event, enabled) => {
    if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) return state();
    app.setLoginItemSettings(loginItemSettings(Boolean(enabled)));
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    return state();
  });
  ipcMain.handle("daytrace:request-accessibility", async () => {
    if (process.platform === "darwin") await accessibilityService.request();
    if (accessibilityTrusted()) startTracker();
    else { trackerStatus = "permission-required"; accessibilityService?.watch(); }
    sendState();
    return state();
  });
  ipcMain.handle("daytrace:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("daytrace:set-exclusions", (_event, apps) => { store.updateSettings({ excludedApps: Array.isArray(apps) ? apps.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [] }); return state(); });
  ipcMain.handle("daytrace:set-intent-rules", (_event, rules) => { store.updateSettings({ intentRules: Array.isArray(rules) ? rules : [] }); return state(); });
  ipcMain.handle("daytrace:set-language", (_event, language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en" }); if (tray) tray.setToolTip(mainText().tooltip); updateTrayMenu(); return state(); });
  ipcMain.handle("daytrace:complete-onboarding", (_event, language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en", onboardingComplete: true }); updateTrayMenu(); return state(); });
  ipcMain.handle("daytrace:delete-all", () => { store.deleteAll(); return state(); });
  ipcMain.handle("daytrace:delete-session", (_event, start, end) => { store.deleteRange(start, end); return state(); });
  ipcMain.handle("daytrace:export-skill", (_event, skill) => store.exportSkill(skill));
  ipcMain.handle("daytrace:reveal-data", () => shell.openPath(store.root));
  ipcMain.handle("daytrace:check-updates", async () => { await checkForUpdates(); return state(); });
  ipcMain.handle("daytrace:install-update", async () => { await downloadAndInstallUpdate(); return state(); });
}

startupLog(`process-start version=${app.getVersion()}`);
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    store = new EventStore(path.join(app.getPath("userData"), "daytrace-data"), broadcastState, { defaultLanguage: app.getLocale() });
    accessibilityService = createAccessibilityService({
      platform: process.platform,
      isTrusted: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
      openExternal: async (url) => {
        try { await shell.openExternal(url); }
        catch (error) { startupLog("accessibility-settings-open-failed", error); }
      },
      onChange: accessibilityChanged,
    });
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    registerIpc(); createTray();
    const launchedInBackground = process.argv.includes("--background") || app.getLoginItemSettings().wasOpenedAtLogin || app.getLoginItemSettings().wasOpenedAsHidden;
    if (!launchedInBackground) await openWindow(); else setTimeout(startTracker, 400).unref();
    setInterval(() => store.prune(), 15 * 60_000).unref();
    scheduleUpdateCheck();
  } catch (error) {
    startupLog("startup-failed", error); const { dialog } = require("electron"); const t = mainText(); dialog.showErrorBox(t.startupTitle, t.startupMessage); app.quit();
  }
});
app.on("window-all-closed", () => { });
app.on("activate", () => { accessibilityService?.check(); startTracker(); void openWindow(); });
app.on("second-instance", () => void openWindow());
app.on("before-quit", () => { isQuitting = true; clearTimeout(releaseTimer); clearTimeout(updateTimer); updateAbortController?.abort(); accessibilityService?.stop(); stopTracker("stopped"); });
