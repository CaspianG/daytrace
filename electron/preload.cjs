const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daytrace", {
  getState: () => ipcRenderer.invoke("daytrace:get-state"),
  ask: (question) => ipcRenderer.invoke("daytrace:ask", question),
  setTracking: (enabled) => ipcRenderer.invoke("daytrace:set-tracking", enabled),
  setSetting: (key, enabled) => ipcRenderer.invoke("daytrace:set-setting", key, enabled),
  setAutoStart: (enabled) => ipcRenderer.invoke("daytrace:set-autostart", enabled),
  requestAccessibility: () => ipcRenderer.invoke("daytrace:request-accessibility"),
  setExclusions: (apps) => ipcRenderer.invoke("daytrace:set-exclusions", apps),
  setIntentRules: (rules) => ipcRenderer.invoke("daytrace:set-intent-rules", rules),
  setLanguage: (language) => ipcRenderer.invoke("daytrace:set-language", language),
  completeOnboarding: (language) => ipcRenderer.invoke("daytrace:complete-onboarding", language),
  deleteAll: () => ipcRenderer.invoke("daytrace:delete-all"),
  deleteSession: (start, end) => ipcRenderer.invoke("daytrace:delete-session", start, end),
  exportSkill: (skill) => ipcRenderer.invoke("daytrace:export-skill", skill),
  revealData: () => ipcRenderer.invoke("daytrace:reveal-data"),
  onStateChanged: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("daytrace:state-changed", wrapped);
    return () => ipcRenderer.removeListener("daytrace:state-changed", wrapped);
  },
});
