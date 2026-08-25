const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, shell, systemPreferences, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { CURRENT_ONBOARDING_VERSION, EventStore, normalizeAnalysisEngine, normalizeTheme } = require("./lib/event-store.cjs");
const { createAccessibilityService } = require("./lib/accessibility-service.cjs");
const { getMacInstallInfo } = require("./lib/mac-install-service.cjs");
const { confirmMacUpdateReady, findStaleMacDuplicates, getMacUpdateReadyRequest, prepareMacUpdate } = require("./lib/mac-update-service.cjs");
const { assertTrustedIpcSender, isSafeExternalUrl, isTrustedRendererUrl } = require("./lib/runtime-security.cjs");
const { MAX_RELEASE_JSON_BYTES, MAX_UPDATE_BYTES, normalizeChecksumRelease, normalizeRelease } = require("./lib/update-service.cjs");
const { WINDOWS_UPDATE_ENV, confirmWindowsUpdateReady, getWindowsUpdateReadyRequest, prepareWindowsUpdate } = require("./lib/windows-update-service.cjs");
const { BrowserCompanionService, installNativeHost, runNativeMessagingHost } = require("./lib/browser-companion.cjs");
const { SmartAnalysisService } = require("./lib/smart-analysis-service.cjs");
const { AUTO_ANALYSIS_INTERVAL_MS, SemanticModelService } = require("./lib/semantic-model-service.cjs");
const { AnalysisQualityService } = require("./lib/analysis-quality-service.cjs");
const { createEncryptedBackup, exportCsv, exportJson, restoreEncryptedBackup } = require("./lib/data-portability.cjs");
const { platformCapabilities, runDiagnostics } = require("./lib/diagnostics.cjs");
const { createMacAccessibilityProbe } = require("./lib/mac-accessibility-probe.cjs");
const { spawnMacCollectorBundle } = require("./lib/mac-collector-runtime.cjs");
const { createRecoveryBackoff } = require("./lib/runtime-recovery.cjs");
const { compactRendererState } = require("./lib/renderer-state.cjs");

if (process.argv.includes("--disable-gpu") || process.env.DAYTRACE_SOFTWARE_RENDERING === "1") app.disableHardwareAcceleration();
const BACKGROUND_PERFORMANCE_SMOKE = process.argv.includes("--daytrace-background-performance-smoke-test");
const RUNTIME_RECOVERY_SMOKE = process.argv.includes("--daytrace-runtime-recovery-smoke-test");
const SEMANTIC_SMOKE_TEST = process.argv.includes("--daytrace-semantic-smoke-test");
const NAVIGATION_PERFORMANCE_SMOKE = process.argv.includes("--daytrace-navigation-performance-smoke-test");
const SMOKE_TEST = process.argv.includes("--daytrace-smoke-test") || SEMANTIC_SMOKE_TEST || NAVIGATION_PERFORMANCE_SMOKE;
const RESET_QUICK_TOUR = process.argv.includes("--daytrace-reset-quick-tour");
const ISOLATED_TEST_RUNTIME = SMOKE_TEST || BACKGROUND_PERFORMANCE_SMOKE || RUNTIME_RECOVERY_SMOKE;
const smokeTempRoot = fs.realpathSync(app.getPath("temp"));
const smokeUserDataArgument = process.argv.find((argument) => String(argument).startsWith("--daytrace-smoke-user-data="));
const requestedSmokeUserData = smokeUserDataArgument ? path.resolve(String(smokeUserDataArgument).slice("--daytrace-smoke-user-data=".length)) : "";
let canonicalSmokeUserData = "";
try { canonicalSmokeUserData = requestedSmokeUserData ? fs.realpathSync(requestedSmokeUserData) : ""; } catch { }
const smokeUserData = ISOLATED_TEST_RUNTIME && path.dirname(canonicalSmokeUserData) === smokeTempRoot && path.basename(canonicalSmokeUserData).startsWith("daytrace-desktop-smoke-")
  ? canonicalSmokeUserData
  : ISOLATED_TEST_RUNTIME ? path.join(smokeTempRoot, `daytrace-desktop-smoke-${process.pid}`) : "";
if (ISOLATED_TEST_RUNTIME) app.setPath("userData", smokeUserData);
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
let broadcastDeadline = 0;
let releaseTimer = null;
let updateTimer = null;
let updateAbortController = null;
let isQuitting = false;
let availableRelease = null;
let accessibilityService = null;
let macAccessibilityProbe = null;
let accessibilityRuntime = { phase: "idle", checkedAt: null, code: null, signal: null, error: "" };
let trackerStarting = false;
let browserCompanion = null;
let smartAnalysis = null;
let semanticAnalysis = null;
let analysisQuality = null;
let smartAnalysisTimer = null;
let semanticRequestPending = false;
let semanticBackgroundWindowOwned = false;
let latestDiagnostics = null;
let trackerReadyTimer = null;
let systemResumeTimer = null;
let trackerStderrWindowAt = 0;
let trackerStderrSuppressed = 0;
let rendererRecoveryShowWindow = true;
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
const MAC_COLLECTOR_NAME = "Daytrace Activity Collector";
const MAC_ACCESSIBILITY_TARGET = MAC_COLLECTOR_NAME;
const TRACKER_READY_TIMEOUT_MS = 10_000;
const RENDERER_FILE = path.join(__dirname, "..", "dist", "client", "index.html");
const DEV_RENDERER_ORIGIN = "http://127.0.0.1:5173";
const USE_LOCAL_RENDERER = app.isPackaged || ISOLATED_TEST_RUNTIME;

const MAIN_TEXT = {
  en: { open: "Open Daytrace", pause: "Pause tracking", resume: "Resume tracking", quit: "Quit", tooltip: "Daytrace — local day history", startupTitle: "Daytrace could not start", startupMessage: "The local window could not be opened. Details were written to startup.log." },
  ru: { open: "Открыть Daytrace", pause: "Приостановить отслеживание", resume: "Возобновить отслеживание", quit: "Выйти", tooltip: "Daytrace — локальная история дня", startupTitle: "Daytrace не запустился", startupMessage: "Не удалось открыть локальное окно. Подробности записаны в startup.log." },
};

const NATIVE_THEME_COLORS = {
  light: { background: "#fbfaf7", symbols: "#292823" },
  dark: { background: "#11140f", symbols: "#edf0e8" },
};

const trackerRecovery = createRecoveryBackoff({
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  stableAfterMs: 60_000,
  onRetry: ({ attempt, reason }) => {
    if (isQuitting || !store?.settings?.trackingEnabled) return;
    startupLog(`tracker-recovery-attempt attempt=${attempt} reason=${reason}`);
    startTracker();
  },
});
const rendererRecovery = createRecoveryBackoff({
  baseDelayMs: 750,
  maxDelayMs: 8_000,
  stableAfterMs: 60_000,
  maxAttempts: 3,
  onRetry: ({ attempt, reason }) => {
    if (isQuitting) return;
    startupLog(`renderer-recovery-attempt attempt=${attempt} reason=${reason}`);
    void openWindow(rendererRecoveryShowWindow).catch((error) => {
      startupLog("renderer-recovery-failed", error);
      const failedWindow = mainWindow;
      mainWindow = null;
      if (failedWindow && !failedWindow.isDestroyed()) {
        try { failedWindow.destroy(); } catch { }
      }
      const retry = rendererRecovery.schedule("window-recreate-failed");
      if (retry.exhausted) dialog.showErrorBox(mainText().startupTitle, mainText().startupMessage);
    });
  },
});
const browserCompanionRecovery = createRecoveryBackoff({
  baseDelayMs: 2_000,
  maxDelayMs: 5 * 60_000,
  stableAfterMs: 5 * 60_000,
  onRetry: ({ attempt, reason }) => {
    if (isQuitting || !store?.settings?.browserCompanionEnabled) return;
    startupLog(`browser-companion-recovery-attempt attempt=${attempt} reason=${reason}`);
    void syncBrowserCompanion();
  },
});

function currentNativeThemeColors() {
  return nativeTheme.shouldUseDarkColors ? NATIVE_THEME_COLORS.dark : NATIVE_THEME_COLORS.light;
}

function updateNativeThemeShell() {
  const colors = currentNativeThemeColors();
  for (const window of [mainWindow, semanticWindow]) {
    if (!window || window.isDestroyed()) continue;
    window.setBackgroundColor(colors.background);
    if (typeof window.setTitleBarOverlay === "function") {
      try { window.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbols, height: 38 }); } catch { }
    }
  }
  return colors;
}

function applyNativeTheme(value = store?.settings?.theme) {
  const selected = normalizeTheme(value);
  if (nativeTheme.themeSource !== selected) nativeTheme.themeSource = selected;
  return updateNativeThemeShell();
}

function appLanguage() { return String(store?.settings?.language || app.getLocale() || "en").toLowerCase().startsWith("ru") ? "ru" : "en"; }
function mainText() { return MAIN_TEXT[appLanguage()]; }
function accessibilityTrusted() { return accessibilityService?.check() ?? process.platform !== "darwin"; }
function mainAccessibilityTrusted() {
  if (process.platform !== "darwin") return true;
  try { return Boolean(systemPreferences.isTrustedAccessibilityClient(false)); } catch { return false; }
}
function accessibilityChanged(trusted) {
  if (!store || process.platform !== "darwin") return;
  accessibilityRuntime = { ...accessibilityRuntime, phase: trusted ? "trusted" : accessibilityRuntime.phase === "trusted" ? "denied" : accessibilityRuntime.phase, trusted, checkedAt: Date.now() };
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
  return { engine, ...selected, signal, semantic, quality: analysisQuality?.status() || null };
}
function state() {
  const browserStatus = browserCompanion?.status() || { running: false };
  const smartStatus = analysisRuntimeStatus();
  // Detailed sessions are loaded through daytrace:get-day. Sending the whole
  // rolling 48-hour timeline on every heartbeat made the renderer parse and
  // reconcile several megabytes of unchanged data, which caused periodic
  // stalls and temporary overview substitutions.
  const rendererStoreState = compactRendererState(store.state());
  return {
    ...rendererStoreState,
    runtime: {
      platform: process.platform,
      packaged: app.isPackaged,
      trackerStatus,
      accessibilityTrusted: accessibilityTrusted(),
      accessibilityMainTrusted: mainAccessibilityTrusted(),
      accessibilityTarget: process.platform === "darwin" ? MAC_ACCESSIBILITY_TARGET : "",
      accessibilityProbe: process.platform === "darwin" ? { ...accessibilityRuntime } : null,
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
function broadcastState(change = null) {
  // Anonymous input/click samples only update counters and must never force a
  // full 48-hour dashboard rebuild. Foreground boundaries remain responsive;
  // ordinary heartbeats refresh the visible duration at a calm cadence.
  if (change?.kind === "input" || change?.kind === "click") return;
  const delay = ["foreground", "idle", "resume"].includes(change?.kind) ? 1_500 : change?.kind === "heartbeat" ? 30_000 : 150;
  const deadline = Date.now() + delay;
  if (broadcastTimer && broadcastDeadline <= deadline) return;
  clearTimeout(broadcastTimer);
  broadcastDeadline = deadline;
  broadcastTimer = setTimeout(() => { broadcastTimer = null; broadcastDeadline = 0; sendState(); }, delay);
  broadcastTimer.unref();
}

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
  if (process.platform === "darwin") {
    const preferred = app.isPackaged
      ? path.join(path.dirname(path.dirname(process.execPath)), "Helpers", `${MAC_COLLECTOR_NAME}.app`, "Contents", "MacOS", MAC_COLLECTOR_NAME)
      : path.join(__dirname, "..", "native", "macos-tracker", "build", `${MAC_COLLECTOR_NAME}.app`, "Contents", "MacOS", MAC_COLLECTOR_NAME);
    const legacy = app.isPackaged ? path.join(path.dirname(process.execPath), "daytrace-tracker") : path.join(__dirname, "..", "native", "macos-tracker", "build", "daytrace-tracker");
    return fs.existsSync(preferred) ? preferred : legacy;
  }
  return null;
}
function probeTrackerAccessibility(prompt = false) {
  if (process.platform !== "darwin") return Promise.resolve(true);
  return macAccessibilityProbe?.probe(Boolean(prompt)) ?? Promise.resolve(false);
}
function clearTrackerReadyTimer() {
  clearTimeout(trackerReadyTimer);
  trackerReadyTimer = null;
}
function scheduleTrackerRestart(reason) {
  if (isQuitting || !store?.settings?.trackingEnabled) return;
  trackerStatus = "recovering";
  const retry = trackerRecovery.schedule(reason);
  if (retry.scheduled) startupLog(`tracker-recovery-scheduled attempt=${retry.attempt} delayMs=${retry.delayMs} reason=${retry.reason}`);
  sendState();
}
function trackerStderr(chunk) {
  const now = Date.now();
  if (now - trackerStderrWindowAt >= 60_000) {
    if (trackerStderrSuppressed) startupLog(`tracker-stderr-suppressed count=${trackerStderrSuppressed}`);
    trackerStderrWindowAt = now;
    trackerStderrSuppressed = 0;
    startupLog(`tracker-stderr ${String(chunk).replace(/\s+/g, " ").trim().slice(0, 500)}`);
  } else trackerStderrSuppressed += 1;
}
function startTracker() {
  if (tracker || trackerStarting || !store?.settings.trackingEnabled) return;
  trackerRecovery.cancel({ reset: false });
  trackerStarting = true;
  try {
    const executable = trackerPath();
    if (!executable || !fs.existsSync(executable)) { trackerStatus = "unavailable"; startupLog(`tracker-unavailable path=${executable || "none"}`); sendState(); return; }
    trackerStatus = "starting";
    const child = process.platform === "darwin"
      ? spawnMacCollectorBundle({
        executablePath: executable,
        collectTitles: store.settings.collectWindowTitles,
        collectInput: store.settings.collectInputCounts,
        log: startupLog,
      })
      : spawn(executable, [], {
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
    trackerRecovery.markStarted();
    clearTrackerReadyTimer();
    trackerReadyTimer = setTimeout(() => {
      if (tracker !== child || trackerStatus !== "starting") return;
      tracker = null;
      trackerStatus = "error";
      startupLog("tracker-ready-timeout");
      try { child.kill(); } catch { }
      scheduleTrackerRestart("ready-timeout");
    }, TRACKER_READY_TIMEOUT_MS);
    trackerReadyTimer.unref();
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        if (Buffer.byteLength(line, "utf8") > 4_096) return;
        const event = JSON.parse(line);
        if (tracker === child && trackerStatus === "starting") {
          clearTrackerReadyTimer();
          trackerStatus = "running";
          accessibilityService?.mark(true);
          sendState();
        }
        store.append(event);
      } catch { }
    });
    child.once("error", (error) => {
      if (tracker !== child) return;
      clearTrackerReadyTimer();
      trackerStatus = "error"; tracker = null; startupLog("tracker-error", error);
      scheduleTrackerRestart("process-error");
    });
    child.once("exit", (code) => {
      if (tracker !== child) return;
      clearTrackerReadyTimer();
      tracker = null;
      if (!isQuitting && store.settings.trackingEnabled) {
        trackerStatus = code === 77 ? "permission-required" : "error";
        if (code === 77) { accessibilityService?.mark(false); accessibilityService?.watch(); }
        else scheduleTrackerRestart(`exit-${Number.isInteger(code) ? code : "unknown"}`);
      }
      sendState();
    });
    child.stderr.on("data", trackerStderr);
  } catch (error) {
    clearTrackerReadyTimer();
    tracker = null; trackerStatus = "error"; startupLog("tracker-spawn-failed", error);
    scheduleTrackerRestart("spawn-failed");
  }
  finally { trackerStarting = false; }
  sendState();
}
function stopTracker(status = "paused") {
  const child = tracker;
  tracker = null;
  trackerStarting = false;
  clearTrackerReadyTimer();
  trackerRecovery.cancel();
  if (child) child.kill();
  trackerStatus = status;
  sendState();
}
function restartTracker() {
  const shouldRun = Boolean(store?.settings.trackingEnabled);
  stopTracker(shouldRun ? "starting" : "paused");
  if (shouldRun) setTimeout(startTracker, 250).unref();
}
function scheduleTrackerAfterSystemResume(reason) {
  clearTimeout(systemResumeTimer);
  systemResumeTimer = setTimeout(() => {
    systemResumeTimer = null;
    if (isQuitting || !store?.settings?.trackingEnabled) return;
    startupLog(`system-active reason=${reason}`);
    if (process.platform === "darwin") {
      void accessibilityService?.refresh(false).then((trusted) => {
        if (trusted) restartTracker();
        else {
          trackerStatus = "permission-required";
          accessibilityService?.watch();
          sendState();
        }
      });
    } else restartTracker();
  }, 750);
  systemResumeTimer.unref();
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

function recoverMainRenderer(window, reason) {
  if (isQuitting || SMOKE_TEST || !window || window.isDestroyed()) return;
  const showWindow = window.isVisible();
  startupLog(`renderer-recovery-scheduled reason=${reason} visible=${showWindow}`);
  if (mainWindow === window) mainWindow = null;
  try { window.destroy(); } catch { }
  if (!showWindow && !RUNTIME_RECOVERY_SMOKE) return;
  rendererRecoveryShowWindow = showWindow;
  const retry = rendererRecovery.schedule(reason);
  if (retry.exhausted) dialog.showErrorBox(mainText().startupTitle, mainText().startupMessage);
}

async function createSemanticHostWindow() {
  const themeColors = currentNativeThemeColors();
  const window = new BrowserWindow({
    width: 360, height: 240, show: false, backgroundColor: themeColors.background,
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
    const theme = normalizeTheme(store?.settings?.theme);
    if (!USE_LOCAL_RENDERER) await window.loadURL(`${DEV_RENDERER_ORIGIN}?semanticHost=1&theme=${encodeURIComponent(theme)}`);
    else await window.loadFile(RENDERER_FILE, { query: { semanticHost: "1", theme } });
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
  const themeColors = currentNativeThemeColors();
  let runtimeReady = false;
  const window = new BrowserWindow({
    width: 1488, height: 1058, minWidth: 1080, minHeight: 720, backgroundColor: themeColors.background, title: "Daytrace",
    titleBarStyle: "hidden", titleBarOverlay: { color: themeColors.background, symbolColor: themeColors.symbols, height: 38 }, show: false,
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
    if (runtimeReady) recoverMainRenderer(window, `renderer-${details.reason}`);
  });
  window.on("minimize", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("close", (event) => { if (!isQuitting) { event.preventDefault(); hideWindow(window); } });
  window.on("focus", () => {
    if (process.platform !== "darwin") return;
    void accessibilityService?.refresh(false).then((trusted) => { if (trusted) startTracker(); else accessibilityService?.watch(); sendState(); });
  });
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  const theme = normalizeTheme(store?.settings?.theme);
  if (!USE_LOCAL_RENDERER) await window.loadURL(`${DEV_RENDERER_ORIGIN}?theme=${encodeURIComponent(theme)}`);
  else await window.loadFile(RENDERER_FILE, { query: { theme } });
  const renderer = await window.webContents.executeJavaScript("new Promise((resolve) => { const deadline = Date.now() + 10000; const check = () => { const root = document.getElementById('root'); if (window.__daytraceAppReady && root?.childElementCount > 0 && root?.innerText.trim().length > 0) resolve({ children: root.childElementCount, text: root.innerText.trim().length }); else if (Date.now() >= deadline) resolve({ children: 0, text: 0 }); else setTimeout(check, 25); }; check(); })");
  if (renderer.children < 1 || renderer.text < 1) throw new Error("Renderer loaded without visible content");
  const bridgeReady = await window.webContents.executeJavaScript("window.daytrace?.getState().then((value) => Boolean(value?.settings && value?.runtime)).catch(() => false)");
  if (!bridgeReady) throw new Error("Renderer could not reach the local Daytrace service");
  runtimeReady = true;
  rendererRecovery.markStarted();
  if (SMOKE_TEST) {
    const themeBridgeReady = await window.webContents.executeJavaScript("window.daytrace?.setTheme('dark').then((value) => value?.settings?.theme === 'dark').catch(() => false)");
    if (!themeBridgeReady || nativeTheme.themeSource !== "dark") throw new Error("Renderer could not persist the native dark theme");
    await window.webContents.executeJavaScript("window.daytrace?.setTheme('system')");
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

async function runNavigationPerformanceSmoke() {
  const result = await mainWindow.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (selector, timeout = 10000) => {
      const deadline = performance.now() + timeout;
      while (!document.querySelector(selector) && performance.now() < deadline) await sleep(10);
      return document.querySelector(selector);
    };
    await waitFor('.history-page:not(.history-page-loading)');
    const initialDate = document.querySelector('.date-copy h1')?.textContent?.trim() || '';
    document.querySelector('button[title="Previous day"], button[title="Предыдущий день"]')?.click();
    const dayDeadline = performance.now() + 10000;
    while (performance.now() < dayDeadline) {
      const nextDate = document.querySelector('.date-copy h1')?.textContent?.trim() || '';
      if (nextDate && nextDate !== initialDate && document.querySelector('.history-page:not(.history-page-loading)')) break;
      await sleep(10);
    }
    const initialSummary = document.querySelector('.summary-answer')?.textContent?.trim() || '';
    const initialActivities = document.querySelectorAll('.activity').length;
    const initialSessions = document.querySelectorAll('.timeline-session').length;
    document.querySelector('.main-nav button[aria-label="Settings"], .main-nav button[aria-label="Настройки"]')?.click();
    await waitFor('.subpage.narrow-page');
    await sleep(100);
    const longTasks = [];
    const observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { }
    const startedAt = performance.now();
    document.querySelector('.main-nav button[aria-label="Day overview"], .main-nav button[aria-label="Обзор дня"]')?.click();
    const summaries = [];
    let readyAt = null;
    for (let index = 0; index < 90; index += 1) {
      if (readyAt === null && document.querySelector('.history-page:not(.history-page-loading)')) readyAt = performance.now();
      const summary = document.querySelector('.summary-answer')?.textContent?.trim() || '';
      if (summary && summaries.at(-1) !== summary) summaries.push(summary);
      await sleep(16);
    }
    observer.disconnect();
    const rendererState = await window.daytrace.getState();
    return {
      navigationMs: Math.round((readyAt || performance.now()) - startedAt),
      initialSummary,
      summaries,
      initialActivities,
      initialSessions,
      finalActivities: document.querySelectorAll('.activity').length,
      finalSessions: document.querySelectorAll('.timeline-session').length,
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
      stateBytes: new TextEncoder().encode(JSON.stringify(rendererState)).length,
      stateSessions: rendererState.sessions?.length || 0,
    };
  })()`);
  const stableSummary = result.initialSummary && result.summaries.length === 1 && result.summaries[0] === result.initialSummary;
  if (!stableSummary || result.navigationMs > 1_000 || result.maxLongTaskMs > 500 || result.initialActivities > 120 || result.finalActivities > 120 || result.stateBytes > 250_000 || result.stateSessions !== 0) {
    throw new Error(`Navigation performance regression: ${JSON.stringify(result)}`);
  }
  startupLog(`navigation-performance-smoke-passed ${JSON.stringify(result)}`);
  return result;
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
    try { await browserCompanion.start(); browserCompanionRecovery.cancel(); }
    catch (error) {
      startupLog("browser-companion-start-failed", error);
      browserCompanionRecovery.schedule("start-failed");
    }
  } else {
    browserCompanionRecovery.cancel();
    browserCompanion.stop();
  }
  sendState();
}

async function runSmartAnalysis(force = false) {
  const engine = normalizeAnalysisEngine(store?.settings?.analysisEngine);
  if (engine === "builtin") return { status: "disabled", rules: [] };
  if (!force && powerMonitor.getSystemIdleTime() < 300) return { status: "waiting-for-idle", rules: [] };
  if (!force && typeof powerMonitor.isOnBatteryPower === "function" && powerMonitor.isOnBatteryPower()) return { status: "waiting-for-power", rules: [] };
  if (engine === "semantic") return requestSemanticAnalysis(force);
  if (!smartAnalysis) return { status: "unavailable", rules: [] };
  try {
    const analysis = smartAnalysis.analyze(store);
    sendState();
    const result = await analysis;
    analysisQuality?.schedule(50);
    sendState();
    return result;
  } catch (error) {
    startupLog("smart-analysis-failed", error);
    sendState();
    throw error;
  }
}

function requestSemanticAnalysis(force = false) {
  if (!semanticAnalysis?.status().installed) return { status: "model-required" };
  if (semanticAnalysis.status().running) return { status: "busy" };
  const prepared = semanticAnalysis.prepare(store, force);
  if (prepared.status !== "ready") {
    sendState();
    return prepared;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
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
  smartAnalysisTimer = setInterval(() => void runSmartAnalysis(false).catch(() => {}), AUTO_ANALYSIS_INTERVAL_MS);
  smartAnalysisTimer.unref();
  setTimeout(() => void runSmartAnalysis(false).catch(() => {}), 5 * 60_000).unref();
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

async function runBackgroundPerformanceSmoke() {
  const trackerDeadline = Date.now() + 12_000;
  while (!["running", "permission-required", "unavailable", "error"].includes(trackerStatus) && Date.now() < trackerDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (process.platform === "win32" && trackerStatus !== "running") throw new Error(`Windows collector did not become ready: ${trackerStatus}`);
  if (BrowserWindow.getAllWindows().length !== 0) throw new Error("Background launch created a renderer window");

  app.getAppMetrics();
  const cpuStart = process.cpuUsage();
  const startedAt = Date.now();
  const samples = [];
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const metrics = app.getAppMetrics();
    samples.push({
      cpu: metrics.reduce((total, metric) => total + Math.max(0, Number(metric.cpu?.percentCPUUsage || 0)), 0),
      privateMiB: metrics.reduce((total, metric) => total + Math.max(0, Number(metric.memory?.privateBytes || 0)), 0) / 1024,
      workingMiB: metrics.reduce((total, metric) => total + Math.max(0, Number(metric.memory?.workingSetSize || 0)), 0) / 1024,
      processes: metrics.length,
    });
  }
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const cpu = process.cpuUsage(cpuStart);
  const mainCpuPercent = ((cpu.user + cpu.system) / 1_000) / elapsedMs * 100;
  const averageCpuPercent = samples.reduce((total, sample) => total + sample.cpu, 0) / samples.length;
  const peakPrivateMiB = Math.max(...samples.map((sample) => sample.privateMiB));
  const peakWorkingMiB = Math.max(...samples.map((sample) => sample.workingMiB));
  const peakProcesses = Math.max(...samples.map((sample) => sample.processes));
  const firstPrivateMiB = samples.slice(0, 3).reduce((total, sample) => total + sample.privateMiB, 0) / 3;
  const lastPrivateMiB = samples.slice(-3).reduce((total, sample) => total + sample.privateMiB, 0) / 3;
  const privateGrowthMiB = lastPrivateMiB - firstPrivateMiB;
  const cpuBudget = 5;
  const privateMemoryBudgetMiB = 180;
  const privateGrowthBudgetMiB = 20;
  if (mainCpuPercent > cpuBudget || averageCpuPercent > cpuBudget) throw new Error(`Background CPU budget exceeded: main=${mainCpuPercent.toFixed(2)} average=${averageCpuPercent.toFixed(2)}`);
  if (peakPrivateMiB > privateMemoryBudgetMiB) throw new Error(`Background private-memory budget exceeded: ${peakPrivateMiB.toFixed(1)} MiB`);
  if (privateGrowthMiB > privateGrowthBudgetMiB) throw new Error(`Background private-memory growth budget exceeded: ${privateGrowthMiB.toFixed(1)} MiB`);
  startupLog(`background-performance-smoke-passed durationMs=${elapsedMs} mainCpuPercent=${mainCpuPercent.toFixed(3)} averageCpuPercent=${averageCpuPercent.toFixed(3)} peakPrivateMiB=${peakPrivateMiB.toFixed(1)} privateGrowthMiB=${privateGrowthMiB.toFixed(1)} peakWorkingMiB=${peakWorkingMiB.toFixed(1)} peakProcesses=${peakProcesses} trackerStatus=${trackerStatus}`);
}

async function waitForRuntime(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not recover within ${timeoutMs} ms`);
}

async function runRuntimeRecoverySmoke() {
  let trackerRecovered = process.platform !== "win32";
  if (process.platform === "win32") {
    await waitForRuntime(() => trackerStatus === "running" && tracker, 12_000, "Windows collector startup");
    const previousTracker = tracker;
    previousTracker.kill();
    await waitForRuntime(() => trackerStatus === "running" && tracker && tracker !== previousTracker, 15_000, "Windows collector");
    trackerRecovered = true;
  }

  const previousWindow = mainWindow;
  if (!previousWindow || previousWindow.isDestroyed()) throw new Error("Recovery smoke has no renderer to crash");
  previousWindow.webContents.forcefullyCrashRenderer();
  await waitForRuntime(async () => {
    if (!mainWindow || mainWindow === previousWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.webContents.executeJavaScript("Boolean(window.__daytraceAppReady && document.getElementById('root')?.childElementCount)");
  }, 15_000, "Electron renderer");
  startupLog(`runtime-recovery-smoke-passed trackerRecovered=${trackerRecovered} rendererRecovered=true platform=${process.platform}`);
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
    analysisQuality?.schedule(50);
    applyNativeTheme();
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    await syncBrowserCompanion();
    if (store.settings.trackingEnabled || wasTracking) startTracker();
    latestDiagnostics = null;
    return state();
  } catch (error) {
    store = new EventStore(DATA_ROOT, broadcastState, { defaultLanguage: app.getLocale() });
    analysisQuality?.schedule(50);
    applyNativeTheme();
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
  handleIpc("daytrace:set-theme", (theme) => {
    const selected = normalizeTheme(theme);
    store.updateSettings({ theme: selected });
    applyNativeTheme(selected);
    return state();
  });
  handleIpc("daytrace:set-analysis-engine", async (engine) => {
    const normalized = normalizeAnalysisEngine(engine);
    store.updateSettings({ analysisEngine: normalized });
    if (normalized === "signals" && smartAnalysis?.status().installed) await runSmartAnalysis(true);
    return state();
  });
  handleIpc("daytrace:set-retention", (hours) => { store.updateSettings({ retentionHours: hours }); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:set-autostart", (enabled) => {
    if (!app.isPackaged || !["win32", "darwin"].includes(process.platform)) return state();
    app.setLoginItemSettings(loginItemSettings(Boolean(enabled)));
    store.updateSettings({ autoStartEnabled: currentAutoStart() });
    return state();
  });
  handleIpc("daytrace:request-accessibility", async () => {
    store.updateSettings({ accessibilityOnboardingDismissed: true });
    sendState();
    const trusted = process.platform === "darwin" ? await accessibilityService.request() : true;
    if (trusted) startTracker();
    else {
      trackerStatus = "permission-required";
      accessibilityService?.watch();
    }
    sendState();
    return state();
  });
  handleIpc("daytrace:refresh-accessibility", async () => {
    const trusted = process.platform === "darwin" ? await accessibilityService.refresh(false) : true;
    if (trusted) startTracker();
    else {
      trackerStatus = "permission-required";
      accessibilityService?.watch();
    }
    sendState();
    return state();
  });
  handleIpc("daytrace:repair-accessibility", async () => {
    if (process.platform !== "darwin") return state();
    stopTracker("permission-required");
    const reset = await macAccessibilityProbe?.reset();
    if (!reset) return state();
    const trusted = await accessibilityService.request();
    if (trusted) startTracker();
    else {
      trackerStatus = "permission-required";
      accessibilityService.watch();
    }
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
  handleIpc("daytrace:set-intent-rules", (rules) => { store.applyIntentRules(Array.isArray(rules) ? rules : []); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:undo-intent-rules", () => { store.undoIntentRules(); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:set-language", (language) => { store.updateSettings({ language: String(language || "").toLowerCase().startsWith("ru") ? "ru" : "en" }); if (tray) tray.setToolTip(mainText().tooltip); updateTrayMenu(); return state(); });
  handleIpc("daytrace:complete-onboarding", (selection) => {
    const input = selection && typeof selection === "object" ? selection : { language: selection };
    const language = String(input.language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
    const analysisEngine = normalizeAnalysisEngine(input.analysisEngine || store.settings.analysisEngine);
    if (analysisEngine === "signals" && !smartAnalysis?.status().installed) throw new Error("Install the signal pack before selecting it during onboarding");
    if (analysisEngine === "semantic" && !semanticAnalysis?.status().installed) throw new Error("Install the semantic model before selecting it during onboarding");
    const firstCompletion = !store.settings.onboardingComplete;
    store.updateSettings({
      language,
      analysisEngine,
      onboardingComplete: true,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      quickTourComplete: firstCompletion ? false : store.settings.quickTourComplete,
    });
    updateTrayMenu();
    if (analysisEngine === "signals") setTimeout(() => void runSmartAnalysis(true).catch(() => {}), 50).unref();
    return state();
  });
  handleIpc("daytrace:restart-onboarding", () => {
    // Kept as a compatibility endpoint for older renderers. Replaying help is
    // now an in-app, ephemeral tour and must never make onboarding reappear on
    // the next launch.
    return state();
  });
  handleIpc("daytrace:complete-quick-tour", () => {
    store.updateSettings({ quickTourComplete: true });
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
  handleIpc("daytrace:delete-all", () => { store.deleteAll(); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:delete-session", (start, end) => { store.deleteRange(start, end); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:export-skill", (skill) => store.exportSkill(skill));
  handleIpc("daytrace:export-data", (format) => chooseExport(format));
  handleIpc("daytrace:create-backup", (passphrase) => chooseBackup(passphrase));
  handleIpc("daytrace:restore-backup", (passphrase) => chooseRestore(passphrase));
  handleIpc("daytrace:run-diagnostics", () => refreshDiagnostics());
  handleIpc("daytrace:refresh-analysis-quality", async () => { await analysisQuality?.refresh(); return state(); });
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
  handleIpc("daytrace:remove-smart-model", () => { smartAnalysis.remove(); if (store.settings.analysisEngine === "signals") store.updateSettings({ analysisEngine: "builtin" }); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:run-smart-analysis", async () => { await runSmartAnalysis(true); return state(); });
  handleIpc("daytrace:download-semantic-model", async () => {
    await semanticAnalysis.download();
    store.updateSettings({ analysisEngine: "semantic" });
    return state();
  });
  handleIpc("daytrace:remove-semantic-model", () => { semanticAnalysis.remove(); if (store.settings.analysisEngine === "semantic") store.updateSettings({ analysisEngine: "builtin" }); analysisQuality?.schedule(50); return state(); });
  handleIpc("daytrace:begin-semantic-analysis", () => { const result = semanticAnalysis.begin(store); if (result.status !== "ready") releaseSemanticBackgroundWindow(); return result; });
  handleIpc("daytrace:report-semantic-analysis", (token, progress, stage) => semanticAnalysis.report(String(token || ""), progress, stage));
  handleIpc("daytrace:finish-semantic-analysis", (token, decisions) => { semanticAnalysis.complete(String(token || ""), decisions, store); analysisQuality?.schedule(50); const nextState = state(); releaseSemanticBackgroundWindow(); return nextState; });
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
      if (NAVIGATION_PERFORMANCE_SMOKE) {
        store.updateSettings({ language: "en", onboardingComplete: true, onboardingVersion: CURRENT_ONBOARDING_VERSION, quickTourComplete: true, trackingEnabled: true, retentionHours: 48 });
        const previousDay = new Date();
        previousDay.setDate(previousDay.getDate() - 1);
        previousDay.setHours(9, 0, 0, 0);
        const base = previousDay.getTime();
        for (let index = 0; index < 900; index += 1) {
          const at = base + index * 6_000;
          const appName = `Performance App ${index % 24}`;
          const title = `Stable context ${index}`;
          store.append({ at: new Date(at).toISOString(), kind: "foreground", app: appName, title });
          store.append({ at: new Date(at + 3_000).toISOString(), kind: "heartbeat", app: appName, title });
        }
        store.updateSettings({ trackingEnabled: false });
      }
      if (RESET_QUICK_TOUR && store.settings.onboardingComplete) {
        store.updateSettings({ quickTourComplete: false });
        startupLog("quick-tour-reset-for-this-launch");
      }
      applyNativeTheme();
      nativeTheme.on("updated", () => {
        updateNativeThemeShell();
        if (store?.settings?.theme === "system") sendState();
      });
      smartAnalysis = new SmartAnalysisService(DATA_ROOT, { version: app.getVersion(), fetch: (url, options) => net.fetch(url, options) });
      semanticAnalysis = new SemanticModelService(DATA_ROOT, {
        version: app.getVersion(),
        fetch: (url, options) => net.fetch(url, options),
        developmentAssetRoot: app.isPackaged ? "" : path.join(__dirname, "..", "models"),
        onChange: sendState,
      });
      analysisQuality = new AnalysisQualityService(DATA_ROOT, {
        onChange: sendState,
        canRun: () => powerMonitor.getSystemIdleTime() >= 5 * 60 && !powerMonitor.isOnBatteryPower(),
      });
      // The cached aggregate is enough for startup. Recalculate only after the
      // app has settled and the machine is genuinely idle on external power.
      analysisQuality.schedule(60_000);
      browserCompanion = new BrowserCompanionService(
        DATA_ROOT,
        (context) => Boolean(store?.settings.browserCompanionEnabled && store.append(context)),
        { onFailure: (error) => {
          startupLog("browser-companion-runtime-failed", error);
          if (store?.settings?.browserCompanionEnabled) browserCompanionRecovery.schedule("runtime-failed");
        } },
      );
      macAccessibilityProbe = createMacAccessibilityProbe({
        platform: process.platform,
        executablePath: trackerPath,
        onDiagnostic: (diagnostic) => {
          accessibilityRuntime = { ...accessibilityRuntime, ...diagnostic };
          startupLog(`accessibility-probe phase=${diagnostic.phase} trusted=${Boolean(diagnostic.trusted)} code=${diagnostic.code ?? "none"} signal=${diagnostic.signal || "none"} error=${diagnostic.error || "none"} bundle=${diagnostic.bundle || "none"}`);
          sendState();
        },
        log: startupLog,
      });
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
      powerMonitor.on("suspend", () => { startupLog("system-suspended"); stopTracker("suspended"); });
      powerMonitor.on("lock-screen", () => { startupLog("system-locked"); stopTracker("suspended"); });
      powerMonitor.on("resume", () => scheduleTrackerAfterSystemResume("resume"));
      powerMonitor.on("unlock-screen", () => scheduleTrackerAfterSystemResume("unlock"));
      const launchedInBackground = process.argv.includes("--background") || app.getLoginItemSettings().wasOpenedAtLogin || app.getLoginItemSettings().wasOpenedAsHidden;
      if (RUNTIME_RECOVERY_SMOKE) await openWindow(false);
      else if (!launchedInBackground) await openWindow();
      else setTimeout(startTracker, 400).unref();
      if (BACKGROUND_PERFORMANCE_SMOKE) {
        await runBackgroundPerformanceSmoke();
        isQuitting = true; app.exit(0); return;
      }
      if (RUNTIME_RECOVERY_SMOKE) {
        await runRuntimeRecoverySmoke();
        isQuitting = true; app.exit(0); return;
      }
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
      if (NAVIGATION_PERFORMANCE_SMOKE) {
        await runNavigationPerformanceSmoke();
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
    clearTimeout(broadcastTimer);
    clearTimeout(releaseTimer);
    clearTimeout(updateTimer);
    clearTimeout(systemResumeTimer);
    clearInterval(smartAnalysisTimer);
    updateAbortController?.abort();
    rendererRecovery.cancel();
    browserCompanionRecovery.cancel();
    accessibilityService?.stop();
    macAccessibilityProbe?.stop();
    browserCompanion?.stop();
    semanticAnalysis?.cancel();
    analysisQuality?.stop();
    stopTracker("stopped");
  });
}
