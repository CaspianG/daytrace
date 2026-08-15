const { app, BrowserWindow, ipcMain, Menu, shell, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { EventStore } = require("./lib/event-store.cjs");

// Daytrace renders a small, mostly static interface. Software compositing avoids
// waking the hardware GPU for a window that is open only briefly.
app.disableHardwareAcceleration();

const startupLogPath = path.join(app.getPath("userData"), "startup.log");

function startupLog(message, error = null) {
  const suffix = error ? `\n${error && error.stack ? error.stack : String(error)}` : "";
  try {
    fs.mkdirSync(path.dirname(startupLogPath), { recursive: true });
    fs.appendFileSync(startupLogPath, `${new Date().toISOString()} ${message}${suffix}\n`, "utf8");
  } catch {
    // Startup logging must never prevent the app window from opening.
  }
}

process.on("uncaughtException", (error) => startupLog("uncaughtException", error));
process.on("unhandledRejection", (error) => startupLog("unhandledRejection", error));

let mainWindow = null;
let creatingWindow = null;
let tray = null;
let tracker = null;
let store = null;
let broadcastTimer = null;
let isQuitting = false;

const MAIN_TEXT = {
  en: { open: "Open Daytrace", pause: "Pause tracking", resume: "Resume tracking", quit: "Quit", tooltip: "Daytrace — local day history", startupTitle: "Daytrace could not start", startupMessage: "The local window could not be opened. Details were written to startup.log." },
  ru: { open: "Открыть Daytrace", pause: "Приостановить отслеживание", resume: "Возобновить отслеживание", quit: "Выйти", tooltip: "Daytrace — локальная история дня", startupTitle: "Daytrace не запустился", startupMessage: "Не удалось открыть локальное окно. Подробности записаны в startup.log." },
};

function appLanguage() {
  const value = store?.settings?.language || app.getLocale();
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function mainText() {
  return MAIN_TEXT[appLanguage()];
}

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return;
  mainWindow.webContents.send("daytrace:state-changed", store.state());
}

function broadcastState() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    sendState();
  }, 5000);
}

function trackerPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, "tracker", "Daytrace.Tracker.exe");
  return path.join(__dirname, "..", "native", "windows-tracker", "bin", "Release", "net8.0-windows", "win-x64", "publish", "Daytrace.Tracker.exe");
}

function startTracker() {
  if (process.platform !== "win32" || tracker || !store.settings.trackingEnabled) return;
  const executable = trackerPath();
  if (!fs.existsSync(executable)) return;
  tracker = spawn(executable, [], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const lines = readline.createInterface({ input: tracker.stdout });
  lines.on("line", (line) => {
    try { store.append(JSON.parse(line)); } catch { /* Native diagnostics never enter the event journal. */ }
  });
  tracker.once("exit", () => { tracker = null; });
  tracker.stderr.on("data", (chunk) => console.error(`[tracker] ${String(chunk).trim()}`));
}

function stopTracker() {
  if (!tracker) return;
  tracker.kill();
  tracker = null;
}

function trayIconPath() {
  return path.join(__dirname, "..", "build", "icon.ico");
}

function updateTrayMenu() {
  if (!tray || !store) return;
  const t = mainText();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: () => { void openWindow(); } },
    {
      label: store.settings.trackingEnabled ? t.pause : t.resume,
      click: () => {
        const enabled = !store.settings.trackingEnabled;
        store.updateSettings({ trackingEnabled: enabled });
        if (enabled) startTracker(); else stopTracker();
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: t.quit,
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayIconPath());
  tray.setToolTip(mainText().tooltip);
  tray.on("double-click", () => { void openWindow(); });
  updateTrayMenu();
}

function releaseWindowToTray(window) {
  if (isQuitting || !window || window.isDestroyed()) return;
  if (mainWindow === window) mainWindow = null;
  window.removeAllListeners("close");
  window.destroy();
  startupLog("window-released-to-tray");
}

async function createWindow() {
  startupLog(`createWindow packaged=${app.isPackaged}`);
  const window = new BrowserWindow({
    width: 1488,
    height: 1058,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#fbfaf7",
    title: "Daytrace",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#fbfaf7", symbolColor: "#292823", height: 38 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    startupLog("ready-to-show");
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  });
  window.webContents.on("did-finish-load", () => startupLog("did-finish-load"));
  window.webContents.on("console-message", (_event, details) => {
    if (details.level === "error") startupLog(`renderer-error ${details.message}`);
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    startupLog(`did-fail-load code=${code} description=${description} url=${url}`);
  });
  window.on("minimize", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    setImmediate(() => releaseWindowToTray(window));
  });
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    setImmediate(() => releaseWindowToTray(window));
  });
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  window.on("restore", sendState);

  if (!app.isPackaged) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    const entry = path.join(__dirname, "..", "dist", "client", "index.html");
    startupLog(`loadFile ${entry}`);
    await window.loadFile(entry);
  }

  const renderer = await window.webContents.executeJavaScript(`(() => {
    const root = document.getElementById("root");
    return { children: root ? root.childElementCount : -1, text: root ? root.innerText.trim().length : -1 };
  })()`);
  startupLog(`renderer-ready children=${renderer.children} text=${renderer.text}`);
  if (renderer.children < 1 || renderer.text < 1) throw new Error("Renderer loaded without visible content");
}

async function openWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    sendState();
    return mainWindow;
  }
  if (!creatingWindow) {
    creatingWindow = createWindow().finally(() => { creatingWindow = null; });
  }
  await creatingWindow;
  return mainWindow;
}

function registerIpc() {
  ipcMain.handle("daytrace:get-state", () => store.state());
  ipcMain.handle("daytrace:ask", (_event, question) => store.ask(question));
  ipcMain.handle("daytrace:set-tracking", (_event, enabled) => {
    store.updateSettings({ trackingEnabled: Boolean(enabled) });
    if (enabled) startTracker(); else stopTracker();
    updateTrayMenu();
    return store.state();
  });
  ipcMain.handle("daytrace:set-exclusions", (_event, apps) => {
    const excludedApps = Array.isArray(apps) ? apps.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [];
    store.updateSettings({ excludedApps });
    return store.state();
  });
  ipcMain.handle("daytrace:set-language", (_event, language) => {
    const normalized = String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
    store.updateSettings({ language: normalized });
    if (tray) tray.setToolTip(mainText().tooltip);
    updateTrayMenu();
    return store.state();
  });
  ipcMain.handle("daytrace:complete-onboarding", (_event, language) => {
    const normalized = String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
    store.updateSettings({ language: normalized, onboardingComplete: true });
    if (tray) tray.setToolTip(mainText().tooltip);
    updateTrayMenu();
    return store.state();
  });
  ipcMain.handle("daytrace:delete-all", () => { store.deleteAll(); return store.state(); });
  ipcMain.handle("daytrace:delete-session", (_event, start, end) => { store.deleteRange(start, end); return store.state(); });
  ipcMain.handle("daytrace:export-skill", (_event, skill) => store.exportSkill(skill));
  ipcMain.handle("daytrace:reveal-data", () => shell.openPath(store.root));
}

startupLog(`process-start version=${app.getVersion()}`);

const primaryInstance = app.requestSingleInstanceLock();

if (!primaryInstance) {
  app.quit();
} else app.whenReady().then(async () => {
  try {
    startupLog("app-ready");
    Menu.setApplicationMenu(null);
    store = new EventStore(path.join(app.getPath("userData"), "daytrace-data"), broadcastState, { defaultLanguage: app.getLocale() });
    startupLog("event-store-ready");
    registerIpc();
    createTray();
    await openWindow();
    startupLog("window-loaded");
    startTracker();
    startupLog(`tracker-started=${Boolean(tracker)}`);
    setInterval(() => store.prune(), 15 * 60_000).unref();
  } catch (error) {
    startupLog("startup-failed", error);
    const { dialog } = require("electron");
    const t = mainText();
    dialog.showErrorBox(t.startupTitle, t.startupMessage);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") app.quit();
});

app.on("activate", async () => {
  await openWindow();
});

app.on("second-instance", () => { void openWindow(); });

app.on("before-quit", () => {
  isQuitting = true;
  stopTracker();
});
