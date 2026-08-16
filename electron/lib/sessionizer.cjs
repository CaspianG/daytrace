const FOCUS_LABELS = {
  ru: {
    development: "Разработка",
    planning: "Планирование и подготовка",
    research: "Исследование",
    communication: "Мессенджеры и почта",
    design: "Дизайн",
    browser: "Работа в браузере",
    ai: "Работа с ИИ-ассистентами",
    audio: "Работа со звуком",
    remote: "Удалённая работа",
    files: "Работа с файлами",
    other: "Другая активность",
    mixed: "Смешанная работа",
  },
  en: {
    development: "Development",
    planning: "Planning and preparation",
    research: "Research",
    communication: "Messaging and email",
    design: "Design",
    browser: "Browser activity",
    ai: "AI assistant work",
    audio: "Audio production",
    remote: "Remote work",
    files: "File work",
    other: "Other activity",
    mixed: "Mixed activity",
  },
};

const { isSystemNoise } = require("./privacy.cjs");

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function inferFocusDetails(activity) {
  const app = `${activity.app || ""} ${activity.process || ""}`.toLowerCase();
  const title = String(activity.title || "").toLowerCase();
  const result = (focus, confidence, reason) => ({ focus, confidence, reason });
  if (/(telegram|slack|teams|discord|outlook|thunderbird|gmail|zoom|signal|whatsapp)/.test(app)) return result("communication", "high", "application");
  if (/(figma|photoshop|illustrator|after effects|premiere|canva|sketch)/.test(app)) return result("design", "high", "application");
  if (/(fl64|fl studio|ableton|reaper|cubase|logic pro|pro tools|audition)/.test(app)) return result("audio", "high", "application");
  if (/(chatgpt|claude|perplexity|copilot)/.test(app)) return result("ai", "high", "application");
  if (/(msrdc|remote desktop|parallels|vmware|virtualbox)/.test(app)) return result("remote", "high", "application");
  if (/(visual studio|\bcode\b|terminal|powershell|windowsterminal|\bcmd\b|gitkraken|webstorm|idea64|pycharm|xcode|android studio|docker desktop)/.test(app)) return result("development", "high", "application");
  if (/(notion|trello|asana|linear|calendar|word|excel|sheets)/.test(app)) return result("planning", "high", "application");
  if (/(explorer|проводник|finder)/.test(app)) return result("files", "high", "application");

  const browser = /(chrome|edge|firefox|brave|opera|vivaldi|safari)/.test(app) || activity.context === "browser";
  if (browser) {
    if (/(documentation|документац|stackoverflow|stack overflow|mdn|wikipedia|research|исследован|поиск|search results)/.test(title)) return result("research", "medium", "window-title");
    if (/(github|gitlab|localhost|127\.0\.0\.1|developer|devtools|npm|electron|react|typescript)/.test(title)) return result("development", "medium", "window-title");
    if (/(google docs|документ|sheets|таблиц|calendar|календар)/.test(title)) return result("planning", "medium", "window-title");
    return result("browser", "high", "application");
  }
  return result("other", "low", "unknown");
}

function inferFocus(activity) { return inferFocusDetails(activity).focus; }

function canonicalApp(event, language) {
  const app = String(event.app || event.process || (language === "ru" ? "Приложение" : "Application"));
  if (/^explorer$/i.test(app)) return language === "ru" ? "Проводник" : "File Explorer";
  if (/^telegram(?:desktop)?$/i.test(app)) return "Telegram Desktop";
  return app;
}

function safeTitle(title, app, language = "ru") {
  const cleaned = String(title || "").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return normalizeLanguage(language) === "ru" ? "Активное окно" : "Active window";
  const appEscaped = String(app || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleaned
    .replace(new RegExp(`\\s*[—-]\\s*${appEscaped}$`, "i"), "")
    .replace(/\s*[—-]\s*(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera|Telegram Desktop)$/i, "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s+\(\d{5,}\)$/, "")
    .replace(/^(telegramdesktop|google chrome|microsoft edge)$/i, "")
    .slice(0, 140);
}

function sessionize(events, now = Date.now(), language = "ru") {
  const lang = normalizeLanguage(language);
  const labels = FOCUS_LABELS[lang];
  const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at));
  const activities = [];
  let active = null;

  function closeActive(at) {
    if (!active) return;
    const hardEnd = Math.min(at, active.lastSignal + 75_000);
    const end = Math.max(active.start, hardEnd);
    activities.push({
      ...active,
      end,
      durationMs: end - active.start,
      title: safeTitle(active.title, active.app, lang),
    });
    active = null;
  }

  for (const event of sorted) {
    const at = new Date(event.at).getTime();
    if (!Number.isFinite(at)) continue;
    if (isSystemNoise(event) || /^daytrace(?:\.tracker)?$/i.test(String(event.process || ""))) continue;
    if (event.kind === "foreground") {
      const nextApp = canonicalApp(event, lang);
      const nextTitle = safeTitle(event.title || "", nextApp, lang);
      if (active && active.app === nextApp && nextTitle === active.title) {
        active.lastSignal = at;
        if (Number(event.tabCount || 0) > active.tabCount) active.tabCount = Number(event.tabCount);
        continue;
      }
      closeActive(at);
      active = {
        start: at,
        lastSignal: at,
        app: nextApp,
        process: event.process || "",
        title: nextTitle,
        context: event.context || "other",
        tabCount: Number(event.tabCount || 0),
        clicks: 0,
        inputs: 0,
      };
      continue;
    }
    if (!active) continue;
    if (event.app && canonicalApp(event, lang) !== active.app) continue;
    active.lastSignal = at;
    if (event.context) active.context = event.context;
    if (Number(event.tabCount || 0) > 0) active.tabCount = Number(event.tabCount);
    if (event.kind === "click") active.clicks += Number(event.count || 1);
    if (event.kind === "input") active.inputs += Number(event.count || 1);
  }
  closeActive(now);

  const merged = [];
  for (const activity of activities.filter((item) => item.durationMs >= 1_000)) {
    const previous = merged.at(-1);
    if (previous && previous.app === activity.app && previous.title === activity.title && activity.start - previous.end < 120_000) {
      previous.end = activity.end;
      previous.durationMs += activity.durationMs;
      previous.clicks += activity.clicks;
      previous.inputs += activity.inputs;
    } else {
      merged.push(activity);
    }
  }

  const sessions = [];
  for (const activity of merged) {
    const classification = inferFocusDetails(activity);
    const focus = classification.focus;
    activity.focus = focus;
    activity.focusLabel = labels[focus];
    activity.focusConfidence = classification.confidence;
    activity.focusReason = classification.reason;
    const previous = sessions.at(-1);
    const gap = previous ? activity.start - previous.end : Infinity;
    if (previous && gap < 8 * 60_000 && activity.start - previous.start < 45 * 60_000) {
      previous.activities.push(activity);
      previous.end = activity.end;
      previous.durationMs += activity.durationMs;
      if (classification.confidence === "low") previous.lowConfidenceActivities += 1;
    } else {
      sessions.push({
        id: `${activity.start}-${sessions.length}`,
        start: activity.start,
        end: activity.end,
        durationMs: activity.durationMs,
        focus,
        label: labels[focus],
        confidence: classification.confidence,
        lowConfidenceActivities: classification.confidence === "low" ? 1 : 0,
        activities: [activity],
      });
    }
  }
  for (const session of sessions) {
    const totals = new Map();
    for (const activity of session.activities) totals.set(activity.focus, (totals.get(activity.focus) || 0) + activity.durationMs);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const [topFocus, topDuration] = ranked[0] || ["other", 0];
    const topShare = session.durationMs > 0 ? topDuration / session.durationMs : 0;
    session.focus = ranked.length > 1 && topShare < 0.65 ? "mixed" : topFocus;
    session.label = labels[session.focus];
    session.focusBreakdown = ranked.map(([itemFocus, durationMs]) => ({ focus: itemFocus, label: labels[itemFocus], durationMs }));
    session.confidence = session.lowConfidenceActivities / Math.max(1, session.activities.length) > 0.4 ? "low" : "high";
  }
  return sessions;
}

module.exports = { FOCUS_LABELS, inferFocus, inferFocusDetails, normalizeLanguage, sessionize };
