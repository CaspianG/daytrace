const GENERIC_TITLES = /^(?:active window|application|new tab|home|browser|активное окно|приложение|новая вкладка)$/i;

const COMPLETED_PATTERNS = /(?:^|[^\p{L}\p{N}_])(?:done|completed|finished|fixed|resolved|merged|published|deployed|sent|shipped|closed|готово|готов|заверш(?:ено|ил|ена)|исправ(?:лено|ил)|решено|слито|опубликовано|отправлено|закрыто)(?=$|[^\p{L}\p{N}_])/iu;
const OPEN_PATTERNS = /(?:^|[^\p{L}\p{N}_])(?:todo|draft|pending|review|in progress|follow[- ]?up|question|issue|blocked|waiting|черновик|ожидает|проверить|на проверке|в процессе|вопрос|проблема|заблокирован|доделать)(?=$|[^\p{L}\p{N}_])/iu;

const COPY = {
  en: {
    generic: "Observed activity",
    narrativeEmpty: "No active-window activity was observed for this day.",
    narrative: "{time} of observed active time across {apps} applications. Main contexts: {themes}.",
  },
  ru: {
    generic: "Наблюдаемая активность",
    narrativeEmpty: "За этот день активность окон не наблюдалась.",
    narrative: "{time} наблюдаемого активного времени в {apps} приложениях. Главные контексты: {themes}.",
  },
};

function languageOf(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function clean(value, limit = 160) {
  return String(value || "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function confidenceScore(confidence, reason = "") {
  if (reason === "custom-rule") return 1;
  if (reason === "conflicting-title-signals") return 0.2;
  if (reason === "insufficient-evidence" || reason === "needs-context") return 0.25;
  if (confidence === "high") return 0.9;
  if (confidence === "medium") return 0.7;
  return 0.4;
}

function observedLabel(activity, language = "en") {
  const lang = languageOf(language);
  const app = clean(activity?.app || activity?.process, 120);
  const title = clean(activity?.title, 160);
  if (title && !GENERIC_TITLES.test(title) && title.toLowerCase() !== app.toLowerCase()) return title;
  if (app) return app;
  return COPY[lang].generic;
}

function evidenceFor(activity, language = "en") {
  const evidence = [];
  const app = clean(activity?.app || activity?.process, 120);
  const title = clean(activity?.title, 160);
  const inferred = clean(activity?.intentEvidence, 120);
  if (app) evidence.push({ kind: "application", value: app });
  if (title && !GENERIC_TITLES.test(title)) evidence.push({ kind: "window-title", value: title });
  if (activity?.domain) evidence.push({ kind: "domain", value: clean(activity.domain, 160) });
  if (inferred && !evidence.some((item) => item.value.toLowerCase() === inferred.toLowerCase())) {
    evidence.push({ kind: "classification-signal", value: inferred });
  }
  if (!evidence.length) evidence.push({ kind: "activity", value: observedLabel(activity, language) });
  return evidence.slice(0, 4);
}

function annotateSessions(sessions, language = "en") {
  for (const session of sessions || []) {
    for (const activity of session.activities || []) {
      activity.observedLabel = observedLabel(activity, language);
      activity.intentConfidenceScore = Number.isFinite(Number(activity.intentConfidenceScore))
        ? Math.max(0, Math.min(1, Number(activity.intentConfidenceScore)))
        : confidenceScore(activity.intentConfidence, activity.intentReason);
      activity.intentEvidenceItems = evidenceFor(activity, language);
      activity.needsReview = activity.intent === "unknown" || activity.intentConfidenceScore < 0.55;
    }
    session.needsReview = (session.activities || []).some((activity) => activity.needsReview);
  }
  return sessions;
}

function activityId(activity) {
  const basis = `${Number(activity?.start || 0)}|${clean(activity?.app, 80)}|${clean(activity?.title, 120)}`;
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `review-${(hash >>> 0).toString(16)}`;
}

function buildReviewQueue(sessions, language = "en", limit = 80) {
  return (sessions || [])
    .flatMap((session) => session.activities || [])
    .filter((activity) => activity.intent === "unknown" || Number(activity.intentConfidenceScore ?? confidenceScore(activity.intentConfidence, activity.intentReason)) < 0.55)
    .sort((a, b) => Number(b.start || 0) - Number(a.start || 0))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 80)))
    .map((activity) => ({
      id: activityId(activity),
      start: activity.start,
      end: activity.end,
      durationMs: activity.durationMs,
      app: clean(activity.app, 120),
      title: clean(activity.title, 160),
      observedLabel: observedLabel(activity, language),
      intent: activity.intent,
      confidence: activity.intentConfidence,
      confidenceScore: Number(activity.intentConfidenceScore ?? confidenceScore(activity.intentConfidence, activity.intentReason)),
      reason: activity.intentReason,
      evidence: evidenceFor(activity, language),
    }));
}

function formatCompactDuration(ms, language) {
  const lang = languageOf(language);
  const minutes = Math.max(0, Math.round(Number(ms || 0) / 60_000));
  if (minutes < 60) return lang === "ru" ? `${minutes} мин` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return lang === "ru" ? `${hours} ч${rest ? ` ${rest} мин` : ""}` : `${hours} h${rest ? ` ${rest} min` : ""}`;
}

function normalizedThemeKey(activity, language) {
  const label = observedLabel(activity, language)
    .replace(/\s+[—|-]\s+(?:Google Chrome|Microsoft Edge|Mozilla Firefox|Safari|Telegram Desktop)$/i, "")
    .replace(/^\(\d+\)\s*/, "")
    .trim();
  return `${clean(activity.app, 80).toLowerCase()}|${label.toLowerCase()}`;
}

function buildDayBrief(sessions, language = "en") {
  const lang = languageOf(language);
  const activities = (sessions || []).flatMap((session) => session.activities || []).sort((a, b) => a.start - b.start);
  const totalMs = activities.reduce((sum, item) => sum + Math.max(0, Number(item.durationMs || 0)), 0);
  const appCount = new Set(activities.map((item) => clean(item.app, 120)).filter(Boolean)).size;
  const themeMap = new Map();
  for (const activity of activities) {
    const key = normalizedThemeKey(activity, lang);
    const item = themeMap.get(key) || {
      label: observedLabel(activity, lang),
      app: clean(activity.app, 120),
      durationMs: 0,
      intent: activity.intent || "unknown",
      confidenceScore: Number(activity.intentConfidenceScore ?? confidenceScore(activity.intentConfidence, activity.intentReason)),
    };
    item.durationMs += Math.max(0, Number(activity.durationMs || 0));
    item.confidenceScore = Math.max(item.confidenceScore, confidenceScore(activity.intentConfidence, activity.intentReason));
    themeMap.set(key, item);
  }
  const themes = [...themeMap.values()].sort((a, b) => b.durationMs - a.durationMs).slice(0, 6);
  const completed = [];
  const openLoops = [];
  for (const activity of activities) {
    const label = observedLabel(activity, lang);
    if (COMPLETED_PATTERNS.test(label) && !completed.includes(label)) completed.push(label);
    if (OPEN_PATTERNS.test(label) && !openLoops.includes(label)) openLoops.push(label);
  }

  const interruptions = [];
  for (let index = 1; index < activities.length; index += 1) {
    const previous = activities[index - 1];
    const current = activities[index];
    const gapMs = Math.max(0, Number(current.start || 0) - Number(previous.end || 0));
    if (gapMs < 10 * 60_000) continue;
    const beforeKey = normalizedThemeKey(previous, lang);
    const returned = activities.slice(index, index + 4).find((candidate) => normalizedThemeKey(candidate, lang) === beforeKey);
    interruptions.push({
      start: previous.end,
      end: current.start,
      durationMs: gapMs,
      before: observedLabel(previous, lang),
      after: observedLabel(current, lang),
      returned: returned ? observedLabel(returned, lang) : "",
    });
  }

  const themeText = themes.slice(0, 3).map((item) => item.label).join(", ");
  const narrative = activities.length
    ? COPY[lang].narrative
      .replace("{time}", formatCompactDuration(totalMs, lang))
      .replace("{apps}", String(appCount))
      .replace("{themes}", themeText || COPY[lang].generic)
    : COPY[lang].narrativeEmpty;
  return {
    totalMs,
    appCount,
    themes,
    completed: completed.slice(0, 6),
    openLoops: openLoops.slice(0, 6),
    interruptions: interruptions.slice(-8).reverse(),
    lowConfidenceCount: activities.filter((activity) => activity.intent === "unknown" || Number(activity.intentConfidenceScore ?? confidenceScore(activity.intentConfidence, activity.intentReason)) < 0.55).length,
    narrative,
  };
}

module.exports = {
  annotateSessions,
  buildDayBrief,
  buildReviewQueue,
  confidenceScore,
  evidenceFor,
  observedLabel,
};
