const PRIVATE_WINDOW_PATTERNS = [
  /incognito/i,
  /inprivate/i,
  /private browsing/i,
  /private window/i,
  /приватн(?:ый|ое|ая)/i,
  /инкогнито/i,
  /частный доступ/i,
];

const SYSTEM_PROCESS_PATTERNS = /^(pickerhost|shellexperiencehost|startmenuexperiencehost|searchhost|searchapp|textinputhost|lockapp|taskhostw|applicationframehost)$/i;
const SYSTEM_TITLE_PATTERNS = /^(notification overflow window|task switching|new notification|окно переполнения области уведомлений|переключение задач|новое уведомление)$/i;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isPrivateWindow(event) {
  const app = normalize(event.app || event.process);
  const browser = /(chrome|msedge|edge|firefox|brave|opera|vivaldi)/.test(app);
  if (!browser) return false;
  return PRIVATE_WINDOW_PATTERNS.some((pattern) => pattern.test(event.title || ""));
}

function isExcludedApp(event, excludedApps = []) {
  const haystack = `${normalize(event.app)} ${normalize(event.process)} ${normalize(event.exe)}`;
  return excludedApps.some((name) => haystack.includes(normalize(name)));
}

function isSystemNoise(event) {
  const process = normalize(event.process);
  const title = normalize(event.title);
  return SYSTEM_PROCESS_PATTERNS.test(process) || SYSTEM_TITLE_PATTERNS.test(title);
}

function shouldRecord(event, settings) {
  if (!settings.trackingEnabled) return false;
  if (/^daytrace(?:\.tracker)?$/i.test(normalize(event.process))) return false;
  if (isSystemNoise(event)) return false;
  if (settings.excludePrivateWindows && isPrivateWindow(event)) return false;
  if (isExcludedApp(event, settings.excludedApps)) return false;
  return true;
}

module.exports = { isPrivateWindow, isExcludedApp, isSystemNoise, shouldRecord };
