const { normalizeLanguage, sessionize } = require("./sessionizer.cjs");

function durationText(ms, language = "ru") {
  const lang = normalizeLanguage(language);
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === "en") {
    if (!hours) return `${minutes} min`;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  if (!hours) return `${minutes} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function questionWindow(question, now = new Date()) {
  const text = String(question || "").toLowerCase();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (/(утр|morning)/.test(text)) {
    start.setHours(4, 0, 0, 0);
    end.setHours(12, 0, 0, 0);
  } else if (/(дн[её]м|после обеда|afternoon)/.test(text)) {
    start.setHours(12, 0, 0, 0);
    end.setHours(18, 0, 0, 0);
  } else if (/(вечер|evening)/.test(text)) {
    start.setHours(18, 0, 0, 0);
  } else if (/(вчера|yesterday)/.test(text)) {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  return { start: start.getTime(), end: end.getTime() };
}

function answerQuestion(question, events, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const sessions = sessionize(events, now.getTime(), lang);
  const window = questionWindow(question, now);
  const relevant = sessions.filter((item) => item.end >= window.start && item.start <= window.end);
  if (!relevant.length) {
    return {
      answer: lang === "ru"
        ? "За этот период локальный журнал не нашёл достаточной активности. Возможно, сбор был приостановлен или приложения исключены."
        : "The local journal did not find enough activity for this period. Tracking may have been paused or the applications may have been excluded.",
      points: [],
      sources: [],
    };
  }

  const totals = new Map();
  for (const session of relevant) totals.set(session.label, (totals.get(session.label) || 0) + session.durationMs);
  const points = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, ms]) => ({ label, duration: durationText(ms, lang) }));
  const labels = points.map((item) => item.label.toLowerCase());
  const conjunction = lang === "ru" ? "и" : "and";
  const phrase = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${conjunction} ${labels.at(-1)}` : labels[0];
  return {
    answer: lang === "ru"
      ? `В выбранный период вы в основном занимались ${phrase}. Журнал собран только из локальных событий приложений и переключений окон.`
      : `During the selected period, you mainly worked on ${phrase}. The journal is built only from local application events and window switches.`,
    points,
    sources: relevant.slice(0, 6).map((session) => ({
      id: session.id,
      label: session.label,
      start: session.start,
      end: session.end,
      duration: durationText(session.durationMs, lang),
      apps: [...new Set(session.activities.map((item) => item.app))],
    })),
  };
}

function suggestSkills(events, now = new Date(), language = "ru") {
  const lang = normalizeLanguage(language);
  const sessions = sessionize(events, now.getTime(), lang);
  const groups = new Map();
  for (const session of sessions) {
    const apps = [...new Set(session.activities.map((item) => item.app))].slice(0, 4);
    const key = `${session.focus}:${apps.join(">").toLowerCase()}`;
    const item = groups.get(key) || { key, focus: session.focus, label: session.label, apps, count: 0, durationMs: 0 };
    item.count += 1;
    item.durationMs += session.durationMs;
    groups.set(key, item);
  }
  return [...groups.values()]
    .filter((item) => item.count >= 2 || item.durationMs >= 45 * 60_000)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 6)
    .map((item) => ({
      id: Buffer.from(item.key).toString("base64url").slice(0, 18),
      title: `${item.label}: ${item.apps.join(" → ")}`,
      description: lang === "ru"
        ? `Повторяющийся локальный поток: ${item.count} сессии, ${durationText(item.durationMs, lang)}.`
        : `Repeated local workflow: ${item.count} sessions, ${durationText(item.durationMs, lang)}.`,
      apps: item.apps,
      count: item.count,
      duration: durationText(item.durationMs, lang),
    }));
}

module.exports = { answerQuestion, durationText, questionWindow, suggestSkills };
