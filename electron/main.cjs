const { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, systemPreferences, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { EventStore } = require("./lib/event-store.cjs");

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
let isQuitting = false;

const MAIN_TEXT = {
  en: { open: "Open Daytrace", pause: "Pause tracking", resume: "Resume tracking", quit: "Quit", tooltip: "Daytrace — local day history", startupTitle: "Daytrace could not start", startupMessage: "The local window could not be opened. Details were written to startup.log." },
  ru: { open: "Открыть Daytrace", pause: "Приостановить отслеживание", resume: "Возобновить отслеживание", quit: "Выйти", tooltip: "Daytrace — локальная история дня", startupTitle: "Daytrace не запустился", startupMessage: "Не удалось открыть локальное окно. Подробности записаны в startup.log." },
};

function appLanguage() { return String(store?.settings?.language || app.getLocale() || "en").toLowerCase().startsWith("ru") ? "ru" : "en"; }
function mainText() { return MAIN_TEXT[appLanguage()]; }
function accessibilityTrusted(prompt = false) { return process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(prompt); }
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
      accessibilityTrusted: accessibilityTrusted(false),
      autoStartSupported: app.isPackaged && ["win32", "darwin"].includes(process.platform),
      autoStartEnabled: currentAutoStart(),
    },
  };
}
function sendState() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  mainWindow.webContents.send("daytrace:state-changed", state());
}
function broadcastState() { clearTimeout(broadcastTimer); broadcastTimer = setTimeout(sendState, 12_000); }

function trackerPath() {
  if (process.platform === "win32") return app.isPackaged ? path.join(process.resourcesPath, "tracker", "windows", "Daytrace.Tracker.exe") : path.join(__dirname, "..", "native", "windows-tracker", "bin", "Release", "net8.0-windows", "win-x64", "publish", "Daytrace.Tracker.exe");
  if (process.platform === "darwin") return app.isPackaged ? path.join(process.resourcesPath, "tracker", "macos", "daytrace-tracker") : path.join(__dirname, "..", "native", "macos-tracker", "build", "daytrace-tracker");
  return null;
}
function startTracker() {
  if (tracker || !store?.settings.trackingEnabled) return;
  if (process.platform === "darwin" && !accessibilityTrusted(false)) { trackerStatus = "permission-required"; sendState(); return; }
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
    tracker.once("exit", (code) => { tracker = null; if (!isQuitting && store.settings.trackingEnabled) trackerStatus = code === 0 ? "stopped" : "error"; sendState(); });
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
  ipcMain.handle("daytrace:ask", (_event, question) => store.ask(question));
  ipcMain.handle("daytrace:set-tracking", (_event, enabled) => setTracking(enabled));
  ipcMain.handle("daytrace:set-setting", (_event, key, value) => {
    const allowed = new Set(["excludePrivateWindows", "collectWindowTitles", "collectInputCounts", "collectBrowserTabCount"]);
    if (!allowed.has(key)) throw new Error("Unsupported setting");
    store.updateSettings({ [key]: Boolean(value) }); restartTracker(); return state();
  });
  ipcMain.handle("daytrace:set-autostart", (_event, enabled) => {
    if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) return state();
    app.setLoginItemSettings(loginItemSettings(Boolean(enabled)));
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    return state();
  });
  ipcMain.handle("daytrace:request-accessibility", () => { if (process.platform === "darwin") accessibilityTrusted(true); setTimeout(() => { startTracker(); sendState(); }, 800).unref(); return state(); });
  ipcMain.handle("daytrace:set-exclusions", (_event, apps) => { store.updateSettings({ excludedApps: Array.isArray(apps) ? apps.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [] }); return state(); });
  ipcMain.handle("daytrace:set-language", (_event, language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en" }); if (tray) tray.setToolTip(mainText().tooltip); updateTrayMenu(); return state(); });
  ipcMain.handle("daytrace:complete-onboarding", (_event, language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en", onboardingComplete: true }); updateTrayMenu(); return state(); });
  ipcMain.handle("daytrace:delete-all", () => { store.deleteAll(); return state(); });
  ipcMain.handle("daytrace:delete-session", (_event, start, end) => { store.deleteRange(start, end); return state(); });
  ipcMain.handle("daytrace:export-skill", (_event, skill) => store.exportSkill(skill));
  ipcMain.handle("daytrace:reveal-data", () => shell.openPath(store.root));
}

startupLog(`process-start version=${app.getVersion()}`);
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    store = new EventStore(path.join(app.getPath("userData"), "daytrace-data"), broadcastState, { defaultLanguage: app.getLocale() });
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    registerIpc(); createTray();
    const launchedInBackground = process.argv.includes("--background") || app.getLoginItemSettings().wasOpenedAtLogin || app.getLoginItemSettings().wasOpenedAsHidden;
    if (!launchedInBackground) await openWindow(); else setTimeout(startTracker, 400).unref();
    setInterval(() => store.prune(), 15 * 60_000).unref();
  } catch (error) {
    startupLog("startup-failed", error); const { dialog } = require("electron"); const t = mainText(); dialog.showErrorBox(t.startupTitle, t.startupMessage); app.quit();
  }
});
app.on("window-all-closed", () => { });
app.on("activate", () => void openWindow());
app.on("second-instance", () => void openWindow());
app.on("before-quit", () => { isQuitting = true; clearTimeout(releaseTimer); stopTracker("stopped"); });
