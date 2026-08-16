const { normalizeLanguage, sessionize } = require("./sessionizer.cjs");

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
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === "en") return !hours ? `${minutes} min` : rest ? `${hours} h ${rest} min` : `${hours} h`;
  return !hours ? `${minutes} мин` : rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function questionWindow(question, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const text = String(question || "").toLowerCase();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  let label = lang === "ru" ? "сегодня" : "today";

  if (/(позавчера|day before yesterday)/.test(text)) {
    start.setDate(start.getDate() - 2); end.setDate(end.getDate() - 2);
    label = lang === "ru" ? "позавчера" : "the day before yesterday";
  } else if (/(вчера|yesterday)/.test(text)) {
    start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1);
    label = lang === "ru" ? "вчера" : "yesterday";
  }

  const lastHours = text.match(/(?:последн\w*|last)\s+(\d{1,2})\s*(?:час|hours?|h)/);
  if (lastHours) {
    const hours = Math.min(48, Math.max(1, Number(lastHours[1])));
    return { start: now.getTime() - hours * 3_600_000, end: now.getTime(), label: lang === "ru" ? `последние ${hours} ч` : `last ${hours} h` };
  }

  const explicit = text.match(/(?:с|from)\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|to|–|-)\s*(\d{1,2})(?::(\d{2}))?/);
  if (explicit) {
    start.setHours(Number(explicit[1]), Number(explicit[2] || 0), 0, 0);
    end.setHours(Number(explicit[3]), Number(explicit[4] || 0), 0, 0);
    label += lang === "ru" ? `, ${explicit[1]}:00–${explicit[3]}:00` : `, ${explicit[1]}:00–${explicit[3]}:00`;
  } else if (/(ноч|night)/.test(text)) {
    start.setHours(0, 0, 0, 0); end.setHours(6, 0, 0, 0);
    label += lang === "ru" ? " ночью" : " at night";
  } else if (/(утр|morning)/.test(text)) {
    start.setHours(4, 0, 0, 0); end.setHours(12, 0, 0, 0);
    label += lang === "ru" ? " утром" : " morning";
  } else if (/(дн[её]м|после обеда|afternoon)/.test(text)) {
    start.setHours(12, 0, 0, 0); end.setHours(18, 0, 0, 0);
    label += lang === "ru" ? " днём" : " afternoon";
  } else if (/(вечер|evening)/.test(text)) {
    start.setHours(18, 0, 0, 0); end.setHours(23, 59, 59, 999);
    label += lang === "ru" ? " вечером" : " evening";
  }
  return { start: start.getTime(), end: end.getTime(), label };
}

function interpretQuestion(question, now = new Date(), language = "ru") {
  const text = String(question || "").toLowerCase();
  const requestedApp = APP_ALIASES.find((item) => item.pattern.test(text)) || null;
  let intent = "summary";
  if (/вклад|tabs?/.test(text)) intent = "tabs";
  else if (/переключ|switch/.test(text)) intent = "switches";
  else if (/больше всего|most time|longest|топ/.test(text)) intent = "top";
  else if (/последн\w* делал|latest|last activ/.test(text)) intent = "latest";
  else if (/с чего начал|начал|start(?:ed)? with/.test(text)) intent = "start";
  else if (/сколько времени|как долго|how long|duration/.test(text)) intent = "duration";
  else if (requestedApp) intent = "app";
  return { intent, requestedApp, window: questionWindow(question, now, language) };
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
    ? { summary: "сводка", tabs: "вкладки", switches: "переключения", top: "главная активность", latest: "последняя активность", start: "начало дня", duration: "длительность", app: "приложение" }
    : { summary: "summary", tabs: "tabs", switches: "switches", top: "top activity", latest: "latest activity", start: "start of day", duration: "duration", app: "application" };
  const app = parsed.requestedApp ? ` · ${parsed.requestedApp.names[0]}` : "";
  return `${intents[parsed.intent]}${app} · ${parsed.window.label}`;
}

function answerQuestion(question, events, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const parsed = interpretQuestion(question, now, lang);
  const sessions = sessionize(events, now.getTime(), lang);
  const relevant = sessions.filter((item) => item.end >= parsed.window.start && item.start <= parsed.window.end);
  const interpretation = interpretationText(parsed, lang);
  if (!relevant.length) {
    return {
      answer: lang === "ru" ? "За этот период локальный журнал не нашёл достаточной активности. Возможно, сбор был приостановлен или приложения исключены." : "The local journal did not find enough activity for this period. Tracking may have been paused or the applications may have been excluded.",
      points: [], sources: [], interpretation, intent: parsed.intent, confidence: "low",
    };
  }

  let activities = relevant.flatMap((session) => session.activities).filter((item) => item.end >= parsed.window.start && item.start <= parsed.window.end);
  if (parsed.requestedApp) activities = activities.filter((item) => parsed.requestedApp.pattern.test(`${item.app} ${item.title || ""}`));
  const appTotals = new Map();
  for (const activity of relevant.flatMap((session) => session.activities)) appTotals.set(activity.app, (appTotals.get(activity.app) || 0) + activityDuration(activity));
  const topApps = [...appTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totals = new Map();
  for (const session of relevant) totals.set(session.label, (totals.get(session.label) || 0) + session.activities.reduce((sum, item) => sum + activityDuration(item), 0));
  const points = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, ms]) => ({ label, duration: durationText(ms, lang) }));
  const titles = [...new Set(activities.map((item) => item.title).filter((title) => title && !/^(active window|активное окно)$/i.test(title)))].slice(0, 3);
  const duration = activities.reduce((sum, item) => sum + activityDuration(item), 0);
  let answer;

  if (parsed.requestedApp && !activities.length) {
    answer = lang === "ru" ? `За выбранный период активность ${parsed.requestedApp.names[0]} не найдена.` : `No ${parsed.requestedApp.names[0]} activity was found in the selected period.`;
  } else if (parsed.intent === "tabs") {
    const maxTabs = Math.max(0, ...activities.map((item) => Number(item.tabCount || 0)));
    answer = lang === "ru" ? `В браузере было ${durationText(duration, lang)} активности. Максимально наблюдалось ${maxTabs || "неизвестное число"} вкладок${titles.length ? `; видимые контексты: ${titles.join(", ")}` : ""}.` : `Browser activity totalled ${durationText(duration, lang)}. Up to ${maxTabs || "an unknown number of"} tabs were observed${titles.length ? `; visible contexts: ${titles.join(", ")}` : ""}.`;
  } else if (parsed.intent === "switches") {
    const transitions = meaningfulTransitions(relevant.flatMap((session) => session.activities));
    answer = lang === "ru" ? `За выбранный период было ${transitions} осмысленных переключений между приложениями или типами работы. Чаще всего использовались ${topApps.slice(0, 3).map(([app]) => app).join(", ")}.` : `${transitions} meaningful switches between applications or work contexts were observed. The most-used apps were ${topApps.slice(0, 3).map(([app]) => app).join(", ")}.`;
  } else if (parsed.intent === "top" && topApps.length) {
    answer = lang === "ru" ? `Больше всего времени заняло приложение ${topApps[0][0]}: ${durationText(topApps[0][1], lang)}. Главный тип активности — ${points[0].label.toLowerCase()} (${points[0].duration}).` : `${topApps[0][0]} took the most time: ${durationText(topApps[0][1], lang)}. The leading activity was ${points[0].label.toLowerCase()} (${points[0].duration}).`;
  } else if (parsed.intent === "latest") {
    const latest = [...activities].sort((a, b) => b.end - a.end)[0];
    answer = lang === "ru" ? `Последняя зафиксированная активность — ${latest.app}${latest.title ? `: ${latest.title}` : ""}.` : `The latest recorded activity was ${latest.app}${latest.title ? `: ${latest.title}` : ""}.`;
  } else if (parsed.intent === "start") {
    const first = [...activities].sort((a, b) => a.start - b.start)[0];
    answer = lang === "ru" ? `День начался с ${first.app}${first.title ? `: ${first.title}` : ""}.` : `The day started with ${first.app}${first.title ? `: ${first.title}` : ""}.`;
  } else if (parsed.requestedApp) {
    const privacy = parsed.requestedApp.key === "telegram" ? (lang === "ru" ? " содержимое сообщений не записывается." : " message contents are never recorded.") : "";
    answer = lang === "ru" ? `В ${parsed.requestedApp.names[0]} было ${durationText(duration, lang)} активности${titles.length ? `; контексты: ${titles.join(", ")}` : ""}.${privacy}` : `${parsed.requestedApp.names[0]} activity totalled ${durationText(duration, lang)}${titles.length ? `; contexts: ${titles.join(", ")}` : ""}.${privacy}`;
  } else {
    const labels = points.map((item) => item.label.toLowerCase());
    const phrase = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${lang === "ru" ? "и" : "and"} ${labels.at(-1)}` : labels[0];
    answer = lang === "ru" ? `В выбранный период вы в основном занимались ${phrase}. Больше всего времени было в ${topApps[0]?.[0] || "приложениях"}.` : `During the selected period, you mainly worked on ${phrase}. Most time was spent in ${topApps[0]?.[0] || "applications"}.`;
  }

  return {
    answer, points, interpretation, intent: parsed.intent, confidence: activities.length >= 3 ? "high" : "medium",
    sources: [...relevant].sort((a, b) => b.end - a.end).slice(0, 6).map((session) => ({ id: session.id, label: session.label, start: session.start, end: session.end, duration: durationText(session.durationMs, lang), apps: [...new Set(session.activities.map((item) => item.app))] })),
  };
}

function suggestSkills(events, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const groups = new Map();
  for (const session of sessionize(events, now.getTime(), lang)) {
    const apps = [...new Set(session.activities.map((item) => item.app))].slice(0, 4);
    const key = `${session.focus}:${apps.join(">").toLowerCase()}`;
    const item = groups.get(key) || { key, focus: session.focus, label: session.label, apps, count: 0, durationMs: 0 };
    item.count += 1; item.durationMs += session.durationMs; groups.set(key, item);
  }
  return [...groups.values()].filter((item) => item.count >= 2 || item.durationMs >= 45 * 60_000).sort((a, b) => b.durationMs - a.durationMs).slice(0, 6).map((item) => ({
    id: Buffer.from(item.key).toString("base64url").slice(0, 18), title: `${item.label}: ${item.apps.join(" → ")}`,
    description: lang === "ru" ? `Повторяющийся локальный поток: ${item.count} сессии, ${durationText(item.durationMs, lang)}.` : `Repeated local workflow: ${item.count} sessions, ${durationText(item.durationMs, lang)}.`,
    apps: item.apps, count: item.count, duration: durationText(item.durationMs, lang),
  }));
}

module.exports = { answerQuestion, durationText, interpretQuestion, meaningfulTransitions, questionWindow, suggestSkills };
