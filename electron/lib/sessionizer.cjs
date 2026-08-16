const FOCUS_LABELS = {
  ru: {
    development: "Разработка",
    planning: "Планирование и подготовка",
    research: "Исследование",
    communication: "Коммуникация и уточнения",
    design: "Дизайн",
    files: "Работа с файлами",
    other: "Рабочая активность",
  },
  en: {
    development: "Development",
    planning: "Planning and preparation",
    research: "Research",
    communication: "Communication and follow-up",
    design: "Design",
    files: "File work",
    other: "Work activity",
  },
};

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function inferFocus(activity) {
  const text = `${activity.app} ${activity.title}`.toLowerCase();
  if (/(telegram|slack|teams|discord|outlook|mail|gmail|zoom)/.test(text)) return "communication";
  if (/(figma|photoshop|illustrator|after effects|premiere|canva)/.test(text)) return "design";
  if (/(code|visual studio|terminal|powershell|cmd|github|gitlab|gitkraken|webstorm|idea|pycharm|xcode|android studio)/.test(text)) return "development";
  if (/(notion|trello|asana|linear|calendar|документ|docs|sheets|word|excel)/.test(text)) return "planning";
  if (/(documentation|документац|stackoverflow|stack overflow|mdn|wikipedia|github issue|search|поиск|chatgpt|claude|perplexity)/.test(text)) return "research";
  if (/(chrome|edge|firefox|brave|opera)/.test(text)) return "research";
  if (/(explorer|проводник|finder)/.test(text)) return "files";
  return "other";
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
    const end = Math.max(active.start + 5_000, hardEnd);
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
    if (event.kind === "foreground") {
      const nextApp = event.app || event.process || (lang === "ru" ? "Приложение" : "Application");
      const nextTitle = safeTitle(event.title || "", nextApp, lang);
      if (active && active.app === nextApp && at - active.start < 2_000 && (!nextTitle || nextTitle === active.title)) {
        active.lastSignal = at;
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
    if (event.app && event.app !== active.app) continue;
    active.lastSignal = at;
    if (event.context) active.context = event.context;
    if (Number(event.tabCount || 0) > 0) active.tabCount = Number(event.tabCount);
    if (event.kind === "click") active.clicks += Number(event.count || 1);
    if (event.kind === "input") active.inputs += Number(event.count || 1);
  }
  closeActive(now);

  const merged = [];
  for (const activity of activities.filter((item) => item.durationMs >= 5_000)) {
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
    const focus = inferFocus(activity);
    const previous = sessions.at(-1);
    const gap = previous ? activity.start - previous.end : Infinity;
    if (previous && gap < 8 * 60_000 && (previous.focus === focus || gap < 90_000)) {
      previous.activities.push(activity);
      previous.end = activity.end;
      previous.durationMs += activity.durationMs;
      if (previous.focus === "other" && focus !== "other") previous.focus = focus;
      previous.label = labels[previous.focus];
    } else {
      sessions.push({
        id: `${activity.start}-${sessions.length}`,
        start: activity.start,
        end: activity.end,
        durationMs: activity.durationMs,
        focus,
        label: labels[focus],
        activities: [activity],
      });
    }
  }
  return sessions;
}

module.exports = { FOCUS_LABELS, inferFocus, normalizeLanguage, sessionize };
