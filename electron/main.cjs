const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { EventStore } = require("./lib/event-store.cjs");

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
let tracker = null;
let store = null;
let broadcastTimer = null;

function broadcastState() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("daytrace:state-changed", store.state());
  }, 350);
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

async function createWindow() {
  startupLog(`createWindow packaged=${app.isPackaged}`);
  mainWindow = new BrowserWindow({
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
    },
  });

  mainWindow.once("ready-to-show", () => {
    startupLog("ready-to-show");
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.on("did-finish-load", () => startupLog("did-finish-load"));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    startupLog(`did-fail-load code=${code} description=${description} url=${url}`);
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  if (!app.isPackaged) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    const entry = path.join(__dirname, "..", "dist", "client", "index.html");
    startupLog(`loadFile ${entry}`);
    await mainWindow.loadFile(entry);
  }
}

function registerIpc() {
  ipcMain.handle("daytrace:get-state", () => store.state());
  ipcMain.handle("daytrace:ask", (_event, question) => store.ask(question));
  ipcMain.handle("daytrace:set-tracking", (_event, enabled) => {
    store.updateSettings({ trackingEnabled: Boolean(enabled) });
    if (enabled) startTracker(); else stopTracker();
    return store.state();
  });
  ipcMain.handle("daytrace:set-exclusions", (_event, apps) => {
    const excludedApps = Array.isArray(apps) ? apps.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [];
    store.updateSettings({ excludedApps });
    return store.state();
  });
  ipcMain.handle("daytrace:delete-all", () => { store.deleteAll(); return store.state(); });
  ipcMain.handle("daytrace:delete-session", (_event, start, end) => { store.deleteRange(start, end); return store.state(); });
  ipcMain.handle("daytrace:export-skill", (_event, skill) => store.exportSkill(skill));
  ipcMain.handle("daytrace:reveal-data", () => shell.openPath(store.root));
}

startupLog(`process-start version=${app.getVersion()}`);

app.whenReady().then(async () => {
  try {
    startupLog("app-ready");
    Menu.setApplicationMenu(null);
    store = new EventStore(path.join(app.getPath("userData"), "daytrace-data"), broadcastState);
    startupLog("event-store-ready");
    registerIpc();
    await createWindow();
    startupLog("window-loaded");
    startTracker();
    startupLog(`tracker-started=${Boolean(tracker)}`);
    setInterval(() => store.prune(), 15 * 60_000).unref();
  } catch (error) {
    startupLog("startup-failed", error);
    const { dialog } = require("electron");
    dialog.showErrorBox("Daytrace не запустился", "Не удалось открыть локальное окно. Подробности записаны в startup.log.");
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopTracker();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
