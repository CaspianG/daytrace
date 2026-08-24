const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daytrace", {
  getState: () => ipcRenderer.invoke("daytrace:get-state"),
  getDay: (day) => ipcRenderer.invoke("daytrace:get-day", day),
  ask: (question) => ipcRenderer.invoke("daytrace:ask", question),
  setTracking: (enabled) => ipcRenderer.invoke("daytrace:set-tracking", enabled),
  setSetting: (key, enabled) => ipcRenderer.invoke("daytrace:set-setting", key, enabled),
  setRetention: (hours) => ipcRenderer.invoke("daytrace:set-retention", hours),
  setAutoStart: (enabled) => ipcRenderer.invoke("daytrace:set-autostart", enabled),
  requestAccessibility: () => ipcRenderer.invoke("daytrace:request-accessibility"),
  refreshAccessibility: () => ipcRenderer.invoke("daytrace:refresh-accessibility"),
  dismissAccessibilityOnboarding: () => ipcRenderer.invoke("daytrace:dismiss-accessibility-onboarding"),
  relaunch: () => ipcRenderer.invoke("daytrace:relaunch"),
  setExclusions: (apps) => ipcRenderer.invoke("daytrace:set-exclusions", apps),
  previewIntentRules: (rules) => ipcRenderer.invoke("daytrace:preview-intent-rules", rules),
  setIntentRules: (rules) => ipcRenderer.invoke("daytrace:set-intent-rules", rules),
  undoIntentRules: () => ipcRenderer.invoke("daytrace:undo-intent-rules"),
  setLanguage: (language) => ipcRenderer.invoke("daytrace:set-language", language),
  completeOnboarding: (language) => ipcRenderer.invoke("daytrace:complete-onboarding", language),
  deleteAll: () => ipcRenderer.invoke("daytrace:delete-all"),
  deleteSession: (start, end) => ipcRenderer.invoke("daytrace:delete-session", start, end),
  exportSkill: (skill) => ipcRenderer.invoke("daytrace:export-skill", skill),
  exportData: (format) => ipcRenderer.invoke("daytrace:export-data", format),
  createBackup: (passphrase) => ipcRenderer.invoke("daytrace:create-backup", passphrase),
  restoreBackup: (passphrase) => ipcRenderer.invoke("daytrace:restore-backup", passphrase),
  runDiagnostics: () => ipcRenderer.invoke("daytrace:run-diagnostics"),
  installBrowserHost: () => ipcRenderer.invoke("daytrace:install-browser-host"),
  revealBrowserExtension: () => ipcRenderer.invoke("daytrace:reveal-browser-extension"),
  setAnalysisEngine: (engine) => ipcRenderer.invoke("daytrace:set-analysis-engine", engine),
  downloadSmartModel: () => ipcRenderer.invoke("daytrace:download-smart-model"),
  installSmartModel: () => ipcRenderer.invoke("daytrace:install-smart-model"),
  removeSmartModel: () => ipcRenderer.invoke("daytrace:remove-smart-model"),
  runSmartAnalysis: () => ipcRenderer.invoke("daytrace:run-smart-analysis"),
  downloadSemanticModel: () => ipcRenderer.invoke("daytrace:download-semantic-model"),
  removeSemanticModel: () => ipcRenderer.invoke("daytrace:remove-semantic-model"),
  beginSemanticAnalysis: () => ipcRenderer.invoke("daytrace:begin-semantic-analysis"),
  reportSemanticAnalysis: (token, progress, stage) => ipcRenderer.invoke("daytrace:report-semantic-analysis", token, progress, stage),
  finishSemanticAnalysis: (token, decisions) => ipcRenderer.invoke("daytrace:finish-semantic-analysis", token, decisions),
  failSemanticAnalysis: (token, error) => ipcRenderer.invoke("daytrace:fail-semantic-analysis", token, error),
  revealData: () => ipcRenderer.invoke("daytrace:reveal-data"),
  checkUpdates: () => ipcRenderer.invoke("daytrace:check-updates"),
  installUpdate: () => ipcRenderer.invoke("daytrace:install-update"),
  onStateChanged: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("daytrace:state-changed", wrapped);
    return () => ipcRenderer.removeListener("daytrace:state-changed", wrapped);
  },
  onSemanticAnalysisRequested: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on("daytrace:semantic-analysis-requested", wrapped);
    return () => ipcRenderer.removeListener("daytrace:semantic-analysis-requested", wrapped);
  },
});
