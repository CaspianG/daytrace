const { normalizeLanguage, sessionize } = require("./sessionizer.cjs");
const { labelForIntent } = require("./intent-classifier.cjs");
const { buildDayBrief } = require("./activity-insights.cjs");

const APP_ALIASES = [
  { key: "telegram", names: ["Telegram"], pattern: /telegram|телеграм/i },
  { key: "browser", names: ["Google Chrome", "Microsoft Edge", "Firefox", "Brave", "Safari"], pattern: /chrome|хром|edge|firefox|brave|safari|браузер|browser/i },
  { key: "editor", names: ["Visual Studio Code", "Xcode", "Android Studio", "WebStorm", "IntelliJ IDEA", "PyCharm"], pattern: /visual studio code|vscode|vs code|xcode|android studio|webstorm|intellij|pycharm|редактор|код/i },
  { key: "ai", names: ["ChatGPT", "Claude", "Perplexity"], pattern: /chatgpt|claude|perplexity|чатгпт/i },
  { key: "figma", names: ["Figma"], pattern: /figma|фигм/i },
  { key: "mail", names: ["Mail", "Outlook", "Gmail"], pattern: /outlook|gmail|почт|mail/i },
];

function durationText(ms, language = "ru") {
  const lang = normalizeLanguage(language);
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === "en") return !hours ? `${minutes} min` : rest ? `${hours} h ${rest} min` : `${hours} h`;
  return !hours ? `${minutes} мин` : rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

const MONTHS = {
  en: ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  ru: ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};

function dateWindow(date, label, endAtNow = false, now = new Date()) {
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (endAtNow && start.toDateString() === now.toDateString()) end.setTime(now.getTime());
  return { start: start.getTime(), end: end.getTime(), label };
}

function validLocalDate(year, month, day) {
  const date = new Date(Number(year), Number(month), Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) || date.getDate() !== Number(day)) return null;
  return date;
}

function explicitDateWindows(text, now, language) {
  const lang = normalizeLanguage(language);
  const matches = [];
  const claimed = [];
  const add = (date, source, index) => {
    if (!date || claimed.some(([from, to]) => index >= from && index < to)) return;
    matches.push({ date, source, index });
    claimed.push([index, index + source.length]);
  };
  for (const match of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    add(validLocalDate(match[1], Number(match[2]) - 1, match[3]), match[0], match.index);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?\b/g)) {
    const year = match[3] || now.getFullYear();
    add(validLocalDate(year, Number(match[2]) - 1, match[1]), match[0], match.index);
  }
  const monthPattern = [...MONTHS.en, ...MONTHS.ru].join("|");
  const named = new RegExp(`\\b(?:(\\d{1,2})\\s+(${monthPattern})[a-zа-яё]*|(${monthPattern})[a-zа-яё]*\\s+(\\d{1,2}))(?:[,\\s]+(20\\d{2}))?`, "giu");
  for (const match of text.matchAll(named)) {
    const day = Number(match[1] || match[4]);
    const token = String(match[2] || match[3] || "").toLowerCase();
    let month = MONTHS.en.findIndex((item) => token.startsWith(item));
    if (month < 0) month = MONTHS.ru.findIndex((item) => token.startsWith(item));
    const year = Number(match[5] || now.getFullYear());
    add(validLocalDate(year, month, day), match[0], match.index);
  }
  return matches.sort((a, b) => a.index - b.index).map((item) => dateWindow(item.date, new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium" }).format(item.date)));
}

function weekWindow(now, offset, language) {
  const lang = normalizeLanguage(language);
  const start = new Date(now);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  const label = offset === 0 ? (lang === "ru" ? "эта неделя" : "this week") : (lang === "ru" ? "прошлая неделя" : "last week");
  return { start: start.getTime(), end: end.getTime(), label };
}

function monthWindow(now, offset, language) {
  const lang = normalizeLanguage(language);
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  end.setMilliseconds(-1);
  const label = offset === 0 ? (lang === "ru" ? "этот месяц" : "this month") : (lang === "ru" ? "прошлый месяц" : "last month");
  return { start: start.getTime(), end: end.getTime(), label };
}

function questionWindow(question, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const text = String(question || "").toLowerCase();
  const explicitDates = explicitDateWindows(text, now, lang);
  let selected = explicitDates[0] || dateWindow(now, lang === "ru" ? "сегодня" : "today", true, now);
  let comparison = null;

  if (/(?:эт[а-яё]*|текущ[а-яё]*)\s+недел|this week/.test(text)) selected = weekWindow(now, 0, lang);
  else if (/прошл[а-яё]*\s+недел|last week|previous week/.test(text)) selected = weekWindow(now, -1, lang);
  else if (/(?:эт[а-яё]*|текущ[а-яё]*)\s+месяц|this month/.test(text)) selected = monthWindow(now, 0, lang);
  else if (/прошл[а-яё]*\s+месяц|last month|previous month/.test(text)) selected = monthWindow(now, -1, lang);
  else if (/(позавчера|day before yesterday)/.test(text)) {
    const date = new Date(now); date.setDate(date.getDate() - 2);
    selected = dateWindow(date, lang === "ru" ? "позавчера" : "the day before yesterday");
  } else if (/(вчера|yesterday)/.test(text)) {
    const date = new Date(now); date.setDate(date.getDate() - 1);
    selected = dateWindow(date, lang === "ru" ? "вчера" : "yesterday");
  }

  const lastHours = text.match(/(?:последн\w*|last)\s+(\d{1,4})\s*(?:час|hours?|h)/);
  if (lastHours) {
    const hours = Math.min(365 * 24, Math.max(1, Number(lastHours[1])));
    return { start: now.getTime() - hours * 3_600_000, end: now.getTime(), label: lang === "ru" ? `последние ${hours} ч` : `last ${hours} h` };
  }
  const lastDays = text.match(/(?:последн\w*|last)\s+(\d{1,3})\s*(?:дн|days?)/);
  if (lastDays) {
    const days = Math.min(365, Math.max(1, Number(lastDays[1])));
    selected = { start: now.getTime() - days * 86_400_000, end: now.getTime(), label: lang === "ru" ? `последние ${days} дн.` : `last ${days} days` };
  }

  const comparing = /(?:сравн|compare|\bvs\.?\b|versus)/.test(text);
  if (comparing) {
    if (explicitDates.length >= 2) comparison = explicitDates[1];
    else if (/(?:эт[а-яё]*|текущ[а-яё]*)\s+недел|this week/.test(text) && /прошл[а-яё]*\s+недел|(?:^|\s)с\s+прошл[а-яё]*(?:\s|$)|last week|previous week/.test(text)) {
      selected = weekWindow(now, 0, lang);
      comparison = weekWindow(now, -1, lang);
    } else if (/(?:эт[а-яё]*|текущ[а-яё]*)\s+месяц|this month/.test(text) && /прошл[а-яё]*\s+месяц|(?:^|\s)с\s+прошл[а-яё]*(?:\s|$)|last month|previous month/.test(text)) {
      selected = monthWindow(now, 0, lang);
      comparison = monthWindow(now, -1, lang);
    } else if (/сегодня|today/.test(text) && /вчера|yesterday/.test(text)) {
      selected = dateWindow(now, lang === "ru" ? "сегодня" : "today", true, now);
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      comparison = dateWindow(yesterday, lang === "ru" ? "вчера" : "yesterday");
    }
  }

  const explicit = text.match(/(?:с|from)\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|to|–|-)\s*(\d{1,2})(?::(\d{2}))?/);
  if (explicit) {
    const start = new Date(selected.start);
    const end = new Date(selected.start);
    start.setHours(Number(explicit[1]), Number(explicit[2] || 0), 0, 0);
    end.setHours(Number(explicit[3]), Number(explicit[4] || 0), 0, 0);
    selected = { start: start.getTime(), end: end.getTime(), label: `${selected.label}, ${explicit[1]}:00–${explicit[3]}:00`, comparison };
  } else if (/(ноч|night)/.test(text)) {
    const start = new Date(selected.start); const end = new Date(selected.start);
    start.setHours(0, 0, 0, 0); end.setHours(6, 0, 0, 0);
    selected = { start: start.getTime(), end: end.getTime(), label: `${selected.label}${lang === "ru" ? " ночью" : " at night"}` };
  } else if (/(утр|morning)/.test(text)) {
    const start = new Date(selected.start); const end = new Date(selected.start);
    start.setHours(4, 0, 0, 0); end.setHours(12, 0, 0, 0);
    selected = { start: start.getTime(), end: end.getTime(), label: `${selected.label}${lang === "ru" ? " утром" : " morning"}` };
  } else if (/(дн[её]м|после обеда|afternoon)/.test(text)) {
    const start = new Date(selected.start); const end = new Date(selected.start);
    start.setHours(12, 0, 0, 0); end.setHours(18, 0, 0, 0);
    selected = { start: start.getTime(), end: end.getTime(), label: `${selected.label}${lang === "ru" ? " днём" : " afternoon"}` };
  } else if (/(вечер|evening)/.test(text)) {
    const start = new Date(selected.start); const end = new Date(selected.start);
    start.setHours(18, 0, 0, 0); end.setHours(23, 59, 59, 999);
    selected = { start: start.getTime(), end: end.getTime(), label: `${selected.label}${lang === "ru" ? " вечером" : " evening"}` };
  }
  if (comparison) selected.comparison = comparison;
  return selected;
}

function interpretQuestion(question, now = new Date(), language = "ru") {
  const text = String(question || "").toLowerCase();
  const requestedApp = APP_ALIASES.find((item) => item.pattern.test(text)) || null;
  const intentRequests = [
    { key: "learning", pattern: /(?:сколько|как долго|когда|чем|что).*(?:учил|учился|изучал|обучал)|(?:how (?:much|long)|when|what).*(?:learn|stud|course)/i },
    { key: "entertainment", pattern: /(?:сколько|как долго|когда|чем|что).*(?:развлек|играл|смотрел|отдыхал)|(?:how (?:much|long)|when|what).*(?:entertain|gaming|played|watched|leisure)/i },
    { key: "personal", pattern: /(?:сколько|как долго|когда|чем|что).*(?:личн|своими делами)|(?:how (?:much|long)|when|what).*(?:personal|private errands)/i },
    { key: "work", pattern: /(?:сколько|как долго|когда|над чем|чем).*(?:работал|работа)|(?:how (?:much|long)|when|what).*(?:work(?:ed|ing)? on|work time)/i },
  ];
  const requestedIntent = intentRequests.find((item) => item.pattern.test(text))?.key || null;
  let intent = "summary";
  if (/(?:сравн|compare|\bvs\.?\b|versus)/.test(text) && questionWindow(question, now, language).comparison) intent = "comparison";
  else if (/вклад|tabs?/.test(text)) intent = "tabs";
  else if (/переключ|switch/.test(text)) intent = "switches";
  else if (/больше всего|most time|longest|топ/.test(text)) intent = "top";
  else if (/последн\w* делал|latest|last activ/.test(text)) intent = "latest";
  else if (/с чего начал|начал|start(?:ed)? with/.test(text)) intent = "start";
  else if (/сколько времени|как долго|how long|duration/.test(text)) intent = "duration";
  else if (requestedApp) intent = "app";
  return { intent, requestedApp, requestedIntent, window: questionWindow(question, now, language) };
}

function activityDuration(activity) {
  return Math.max(1_000, Number(activity.durationMs || 0));
}

function meaningfulTransitions(activities) {
  const ordered = [...activities].sort((a, b) => a.start - b.start);
  let count = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const appChanged = previous.app !== current.app;
    const contextChanged = previous.context && current.context && previous.context !== current.context;
    if (appChanged || contextChanged) count += 1;
  }
  return count;
}

function interpretationText(parsed, language) {
  const lang = normalizeLanguage(language);
  const intents = lang === "ru"
    ? { summary: "сводка", comparison: "сравнение", tabs: "вкладки", switches: "переключения", top: "главная активность", latest: "последняя активность", start: "начало дня", duration: "длительность", app: "приложение" }
    : { summary: "summary", comparison: "comparison", tabs: "tabs", switches: "switches", top: "top activity", latest: "latest activity", start: "start of day", duration: "duration", app: "application" };
  const app = parsed.requestedApp ? ` · ${parsed.requestedApp.names[0]}` : "";
  const purpose = parsed.requestedIntent ? ` · ${labelForIntent(parsed.requestedIntent, lang)}` : "";
  return `${intents[parsed.intent]}${app}${purpose} · ${parsed.window.label}`;
}

function answerQuestion(question, events, now = new Date(), language = "ru", intentRules = [], options = {}) {
  const lang = normalizeLanguage(language);
  const parsed = interpretQuestion(question, now, lang);
  const sessions = sessionize(events, now.getTime(), lang, intentRules);
  const relevant = sessions.filter((item) => item.end >= parsed.window.start && item.start <= parsed.window.end);
  const interpretation = interpretationText(parsed, lang);
  if (!relevant.length && parsed.intent !== "comparison") {
    return {
      answer: lang === "ru" ? "За этот период локальный журнал не нашёл достаточной активности. Возможно, сбор был приостановлен или приложения исключены." : "The local journal did not find enough activity for this period. Tracking may have been paused or the applications may have been excluded.",
      points: [], sources: [], interpretation, intent: parsed.intent, confidence: "low",
    };
  }

  const allActivities = relevant.flatMap((session) => session.activities).filter((item) => item.end >= parsed.window.start && item.start <= parsed.window.end);
  let activities = allActivities;
  if (parsed.requestedApp) activities = activities.filter((item) => parsed.requestedApp.pattern.test(`${item.app} ${item.title || ""}`));
  if (parsed.requestedIntent) activities = activities.filter((item) => item.intent === parsed.requestedIntent);
  const appTotals = new Map();
  for (const activity of activities) appTotals.set(activity.app, (appTotals.get(activity.app) || 0) + activityDuration(activity));
  const topApps = [...appTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totals = new Map();
  for (const activity of activities) {
    const label = activity.intentLabel || (lang === "ru" ? "Неоднозначная цель" : "Ambiguous purpose");
    totals.set(label, (totals.get(label) || 0) + activityDuration(activity));
  }
  const points = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, ms]) => ({ label, duration: durationText(ms, lang) }));
  const titles = [...new Set(activities.map((item) => item.title).filter((title) => title && !/^(active window|активное окно)$/i.test(title)))].slice(0, 3);
  const duration = activities.reduce((sum, item) => sum + activityDuration(item), 0);
  const brief = buildDayBrief(relevant, lang);
  let answer;

  if (parsed.intent === "comparison") {
    const comparison = parsed.window.comparison;
    const comparisonSessions = sessionize(options.comparisonEvents || [], comparison?.end || now.getTime(), lang, intentRules);
    const comparisonActivities = comparisonSessions.flatMap((session) => session.activities || []);
    const comparisonDuration = comparisonActivities.reduce((sum, item) => sum + activityDuration(item), 0);
    const difference = duration - comparisonDuration;
    const percent = comparisonDuration > 0 ? Math.round((difference / comparisonDuration) * 100) : null;
    const primaryTop = buildDayBrief(relevant, lang).themes[0]?.label;
    const comparisonTop = buildDayBrief(comparisonSessions, lang).themes[0]?.label;
    if (lang === "ru") {
      answer = `${parsed.window.label}: ${durationText(duration, lang)}; ${comparison?.label || "сравниваемый период"}: ${durationText(comparisonDuration, lang)}. ${difference === 0 ? "Активное время совпало." : `Разница — ${durationText(Math.abs(difference), lang)} ${difference > 0 ? "больше" : "меньше"}${percent === null ? "" : ` (${Math.abs(percent)}%)`}.`}${primaryTop ? ` Главный контекст: ${primaryTop}${comparisonTop ? `; ранее — ${comparisonTop}` : ""}.` : ""}`;
    } else {
      answer = `${parsed.window.label}: ${durationText(duration, lang)}; ${comparison?.label || "comparison period"}: ${durationText(comparisonDuration, lang)}. ${difference === 0 ? "Observed active time was equal." : `The difference was ${durationText(Math.abs(difference), lang)} ${difference > 0 ? "more" : "less"}${percent === null ? "" : ` (${Math.abs(percent)}%)`}.`}${primaryTop ? ` Main context: ${primaryTop}${comparisonTop ? `; previously: ${comparisonTop}` : ""}.` : ""}`;
    }
  } else if ((parsed.requestedApp || parsed.requestedIntent) && !activities.length) {
    const target = parsed.requestedApp?.names[0] || labelForIntent(parsed.requestedIntent, lang).toLowerCase();
    answer = lang === "ru" ? `За выбранный период подтверждённая активность «${target}» не найдена. Неоднозначные записи сохраняют явную метку «неоднозначная цель», а не подгоняются под ответ.` : `No confirmed “${target}” activity was found in the selected period. Ambiguous records keep an explicit “ambiguous purpose” label instead of being forced into the answer.`;
  } else if (parsed.intent === "tabs") {
    const maxTabs = Math.max(0, ...activities.map((item) => Number(item.tabCount || 0)));
    answer = lang === "ru" ? `В браузере было ${durationText(duration, lang)} активности. Максимально наблюдалось ${maxTabs || "неизвестное число"} вкладок${titles.length ? `; видимые контексты: ${titles.join(", ")}` : ""}.` : `Browser activity totalled ${durationText(duration, lang)}. Up to ${maxTabs || "an unknown number of"} tabs were observed${titles.length ? `; visible contexts: ${titles.join(", ")}` : ""}.`;
  } else if (parsed.intent === "switches") {
    const transitions = meaningfulTransitions(relevant.flatMap((session) => session.activities));
    answer = lang === "ru" ? `За выбранный период было ${transitions} осмысленных переключений между приложениями или типами работы. Чаще всего использовались ${topApps.slice(0, 3).map(([app]) => app).join(", ")}.` : `${transitions} meaningful switches between applications or work contexts were observed. The most-used apps were ${topApps.slice(0, 3).map(([app]) => app).join(", ")}.`;
  } else if (parsed.intent === "top" && topApps.length) {
    answer = lang === "ru" ? `Больше всего времени заняло приложение ${topApps[0][0]}: ${durationText(topApps[0][1], lang)}. Главная предполагаемая цель — ${points[0].label.toLowerCase()} (${points[0].duration}).` : `${topApps[0][0]} took the most time: ${durationText(topApps[0][1], lang)}. The leading inferred purpose was ${points[0].label.toLowerCase()} (${points[0].duration}).`;
  } else if (parsed.intent === "latest") {
    const latest = [...activities].sort((a, b) => b.end - a.end)[0];
    answer = lang === "ru" ? `Последняя зафиксированная активность — ${latest.app}${latest.title ? `: ${latest.title}` : ""}.` : `The latest recorded activity was ${latest.app}${latest.title ? `: ${latest.title}` : ""}.`;
  } else if (parsed.intent === "start") {
    const first = [...activities].sort((a, b) => a.start - b.start)[0];
    answer = lang === "ru" ? `День начался с ${first.app}${first.title ? `: ${first.title}` : ""}.` : `The day started with ${first.app}${first.title ? `: ${first.title}` : ""}.`;
  } else if (parsed.requestedApp) {
    const privacy = parsed.requestedApp.key === "telegram" ? (lang === "ru" ? " содержимое сообщений не записывается." : " message contents are never recorded.") : "";
    const purposeTotals = new Map();
    for (const activity of activities) purposeTotals.set(activity.intentLabel, (purposeTotals.get(activity.intentLabel) || 0) + activityDuration(activity));
    const purposes = [...purposeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, ms]) => `${label.toLowerCase()} — ${durationText(ms, lang)}`).join(", ");
    answer = lang === "ru" ? `В ${parsed.requestedApp.names[0]} было ${durationText(duration, lang)} активности. По доступным локальным сигналам: ${purposes}${titles.length ? `; контексты: ${titles.join(", ")}` : ""}.${privacy}` : `${parsed.requestedApp.names[0]} activity totalled ${durationText(duration, lang)}. From the available local signals: ${purposes}${titles.length ? `; contexts: ${titles.join(", ")}` : ""}.${privacy}`;
  } else if (parsed.requestedIntent) {
    const purpose = labelForIntent(parsed.requestedIntent, lang);
    answer = lang === "ru" ? `${purpose}: ${durationText(duration, lang)} подтверждённой активности. Больше всего времени — ${topApps.slice(0, 3).map(([app, ms]) => `${app} (${durationText(ms, lang)})`).join(", ")}${titles.length ? `; контексты: ${titles.join(", ")}` : ""}.` : `${purpose}: ${durationText(duration, lang)} of confirmed activity. Most time was spent in ${topApps.slice(0, 3).map(([app, ms]) => `${app} (${durationText(ms, lang)})`).join(", ")}${titles.length ? `; contexts: ${titles.join(", ")}` : ""}.`;
  } else {
    const themes = brief.themes.slice(0, 3).map((item) => item.label);
    const inferred = points.filter((item) => !/^(?:unknown purpose|ambiguous purpose|цель не определена|неоднозначная цель)$/i.test(item.label)).map((item) => item.label.toLowerCase());
    const purpose = inferred.length ? (lang === "ru" ? ` Предполагаемые цели: ${inferred.join(", ")}.` : ` Inferred purposes: ${inferred.join(", ")}.`) : "";
    answer = lang === "ru" ? `Наблюдаемые контексты: ${themes.join(", ") || topApps[0]?.[0] || "активные приложения"}. Активное время — ${durationText(duration, lang)}.${purpose}` : `Observed contexts: ${themes.join(", ") || topApps[0]?.[0] || "active applications"}. Active time: ${durationText(duration, lang)}.${purpose}`;
  }

  return {
    answer, points, brief, interpretation, intent: parsed.intent, confidence: !activities.length ? "low" : activities.length >= 3 ? "high" : "medium",
    sources: [...relevant].sort((a, b) => b.end - a.end).filter((session) => session.activities.some((activity) => activities.includes(activity))).slice(0, 6).map((session) => {
      const matched = session.activities.filter((activity) => activities.includes(activity));
      return { id: session.id, label: parsed.requestedIntent ? labelForIntent(parsed.requestedIntent, lang) : session.intentLabel || session.label, start: Math.min(...matched.map((item) => item.start)), end: Math.max(...matched.map((item) => item.end)), duration: durationText(matched.reduce((sum, item) => sum + activityDuration(item), 0), lang), apps: [...new Set(matched.map((item) => item.app))] };
    }),
  };
}

function suggestSkillsFromSessions(sessions, language = "ru") {
  const lang = normalizeLanguage(language);
  const groups = new Map();
  for (const session of sessions) {
    const apps = [...new Set(session.activities.map((item) => item.app))].slice(0, 4);
    const key = `${session.intent}:${session.focus}:${apps.join(">").toLowerCase()}`;
    const item = groups.get(key) || { key, focus: session.focus, label: `${session.intentLabel}: ${session.label}`, apps, count: 0, durationMs: 0 };
    item.count += 1; item.durationMs += session.durationMs; groups.set(key, item);
  }
  return [...groups.values()].filter((item) => item.count >= 2 || item.durationMs >= 45 * 60_000).sort((a, b) => b.durationMs - a.durationMs).slice(0, 6).map((item) => ({
    id: Buffer.from(item.key).toString("base64url").slice(0, 18), title: `${item.label}: ${item.apps.join(" → ")}`,
    description: lang === "ru" ? `Повторяющийся локальный поток: ${item.count} сессии, ${durationText(item.durationMs, lang)}.` : `Repeated local workflow: ${item.count} sessions, ${durationText(item.durationMs, lang)}.`,
    apps: item.apps, count: item.count, duration: durationText(item.durationMs, lang),
  }));
}

function suggestSkills(events, now = new Date(), language = "ru", intentRules = []) {
  const lang = normalizeLanguage(language);
  return suggestSkillsFromSessions(sessionize(events, now.getTime(), lang, intentRules), lang);
}

module.exports = { answerQuestion, durationText, interpretQuestion, meaningfulTransitions, questionWindow, suggestSkills, suggestSkillsFromSessions };
