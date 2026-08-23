const HOST = "com.daytrace.browser";
const BROWSER = /Edg\//.test(navigator.userAgent) ? "Microsoft Edge" : navigator.brave ? "Brave" : /Vivaldi/i.test(navigator.userAgent) ? "Vivaldi" : /OPR\//i.test(navigator.userAgent) ? "Opera" : "Google Chrome";
let lastPayload = "";
let sendTimer = null;

function clean(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeLocation(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return {
      domain: clean(url.hostname, 180),
      url: `${url.protocol}//${url.host}${url.pathname}`.slice(0, 500),
    };
  } catch {
    return null;
  }
}

function setBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? "✓" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#708d68" : "#a95b47" });
}

async function sendActiveTab(force = false) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.incognito) return;
    const location = safeLocation(tab.url);
    if (!location) return;
    const message = {
      type: "context",
      at: new Date().toISOString(),
      browser: BROWSER,
      title: clean(tab.title, 300),
      domain: location.domain,
      url: location.url,
      private: false
    };
    const contextKey = `${message.browser}|${message.domain}|${message.url}|${message.title}`;
    if (!force && contextKey === lastPayload) return;
    chrome.runtime.sendNativeMessage(HOST, message, (response) => {
      const failed = Boolean(chrome.runtime.lastError);
      const accepted = !failed && Boolean(response?.ok);
      if (accepted) lastPayload = contextKey;
      setBadge(accepted);
    });
  } catch {
    setBadge(false);
  }
}

function queueActiveTab(force = false) {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => void sendActiveTab(force), 250);
}

chrome.tabs.onActivated.addListener(() => queueActiveTab());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === "complete" || changeInfo.title || changeInfo.url)) queueActiveTab();
});
chrome.windows.onFocusChanged.addListener((windowId) => { if (windowId !== chrome.windows.WINDOW_ID_NONE) queueActiveTab(); });
chrome.runtime.onStartup.addListener(() => queueActiveTab(true));
chrome.runtime.onInstalled.addListener(() => queueActiveTab(true));
chrome.action.onClicked.addListener(() => queueActiveTab(true));
queueActiveTab(true);
