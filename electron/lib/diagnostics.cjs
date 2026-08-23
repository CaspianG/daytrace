const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { shouldRecord } = require("./privacy.cjs");

function platformCapabilities(platform = process.platform, packaged = false) {
  return {
    activeWindowTitles: platform === "win32" || platform === "darwin",
    aggregateInput: platform === "win32" || platform === "darwin",
    idleBoundaries: platform === "win32" || platform === "darwin",
    browserTabCount: platform === "win32",
    browserCompanion: platform === "win32" || platform === "darwin",
    autoStart: packaged && (platform === "win32" || platform === "darwin"),
    encryptedBackup: true,
    smartAnalysis: true,
  };
}

function result(id, status, detail = "") {
  return { id, status, detail: String(detail || "").slice(0, 240) };
}

function writableCheck(root) {
  const file = path.join(root, `.diagnostic-${crypto.randomBytes(5).toString("hex")}`);
  try {
    fs.writeFileSync(file, "local", { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.rmSync(file, { force: true });
    return true;
  } catch {
    try { fs.rmSync(file, { force: true }); } catch { }
    return false;
  }
}

function runDiagnostics({ store, platform = process.platform, packaged = false, trackerStatus = "stopped", trackerExecutable = "", accessibilityTrusted = true, autoStartEnabled = false, browserStatus = {}, smartStatus = {} }) {
  const capabilities = platformCapabilities(platform, packaged);
  const settings = store.settings;
  const now = Date.now();
  const recent = store.loadEventsRange(now - 30 * 60_000, now + 1);
  const recentForeground = [...recent].reverse().find((event) => event.kind === "foreground" || event.kind === "heartbeat");
  const latestIdle = [...recent].reverse().find((event) => event.kind === "idle");
  const privacySettings = { ...settings, trackingEnabled: true, excludePrivateWindows: true, excludedApps: [] };
  const privateBlocked = [
    { app: "Google Chrome", title: "New Incognito Tab" },
    { app: "Safari", title: "Private Browsing" },
    { app: "Microsoft Edge", title: "ordinary", private: true },
  ].every((event) => shouldRecord(event, privacySettings) === false);
  const trackerExists = capabilities.activeWindowTitles && trackerExecutable ? fs.existsSync(trackerExecutable) : false;
  const checks = [
    result("storage", writableCheck(store.root) ? "pass" : "fail", store.root),
    result("tracker", !capabilities.activeWindowTitles ? "not-applicable" : trackerStatus === "running" ? "pass" : trackerStatus === "permission-required" ? "warn" : "fail", trackerStatus),
    result("collector", !capabilities.activeWindowTitles ? "not-applicable" : trackerExists ? "pass" : "fail", trackerExists ? path.basename(trackerExecutable) : "missing"),
    result("accessibility", platform !== "darwin" ? "not-applicable" : accessibilityTrusted ? "pass" : "fail"),
    result("titles", !settings.collectWindowTitles ? "not-applicable" : recentForeground?.title ? "pass" : "warn", recentForeground?.at || ""),
    result("idle", !capabilities.idleBoundaries ? "not-applicable" : latestIdle ? "pass" : "warn", latestIdle?.at || "collector-supported"),
    result("private", privateBlocked ? "pass" : "fail"),
    result("autostart", !capabilities.autoStart ? "not-applicable" : settings.autoStartEnabled === autoStartEnabled ? "pass" : "warn", autoStartEnabled ? "enabled" : "disabled"),
    result("browser", !settings.browserCompanionEnabled ? "not-applicable" : browserStatus.running && browserStatus.lastContextAt ? "pass" : browserStatus.running ? "warn" : "fail", browserStatus.lastContextAt || ""),
    result("smart", !settings.smartAnalysisEnabled ? "not-applicable" : smartStatus.installed && !smartStatus.error ? "pass" : smartStatus.installed ? "warn" : "fail", smartStatus.version || smartStatus.error || ""),
  ];
  const failed = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return { checkedAt: now, status: failed ? "fail" : warnings ? "warn" : "pass", failed, warnings, capabilities, checks };
}

module.exports = { platformCapabilities, runDiagnostics };
