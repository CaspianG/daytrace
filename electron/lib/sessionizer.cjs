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

const { isDaytraceEvent, isSystemNoise } = require("./privacy.cjs");
const { INTENT_LABELS, contextKey, inferIntentDetails } = require("./intent-classifier.cjs");
const { annotateSessions } = require("./activity-insights.cjs");

const SIGNAL_TAIL_MS = 75_000;
const MAX_CONTINUOUS_SIGNAL_GAP_MS = 6 * 60_000;

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

function setIntent(activity, intent, confidence, reason, evidence, intentLabels, score) {
  activity.intent = intent;
  activity.intentLabel = intentLabels[intent];
  activity.intentConfidence = confidence;
  activity.intentReason = reason;
  activity.intentEvidence = evidence;
  if (Number.isFinite(Number(score))) activity.intentConfidenceScore = Number(score);
}

const AUTOMATIC_EVIDENCE_REASONS = new Set(["window-title", "service", "application-category"]);

function hasAutomaticEvidence(activity) {
  return activity.intent !== "unknown" && AUTOMATIC_EVIDENCE_REASONS.has(activity.intentReason);
}

function hasTeachableEvidence(activity) {
  return hasAutomaticEvidence(activity) || activity.intentReason === "sequence-context";
}

function learnRepeatedContexts(sessions, intentLabels) {
  const learned = new Map();
  for (const activity of sessions.flatMap((session) => session.activities)) {
    const key = contextKey(activity);
    if (!key || !hasTeachableEvidence(activity)) continue;
    const item = learned.get(key) || { total: 0, intents: new Map() };
    const duration = Math.max(1_000, activity.durationMs);
    item.total += duration;
    item.intents.set(activity.intent, (item.intents.get(activity.intent) || 0) + duration);
    learned.set(key, item);
  }
  let changed = 0;
  for (const activity of sessions.flatMap((session) => session.activities)) {
    if (activity.intent !== "unknown" || activity.intentReason === "custom-rule") continue;
    const key = contextKey(activity);
    const item = key ? learned.get(key) : null;
    if (!item || item.total < 30_000) continue;
    const ranked = [...item.intents.entries()].sort((a, b) => b[1] - a[1]);
    const [intent, duration] = ranked[0] || [];
    if (!intent || duration / item.total < 0.75) continue;
    setIntent(activity, intent, "medium", "repeated-context", activity.title, intentLabels);
    changed += 1;
  }
  return changed;
}

function contextualizeSession(session, intentLabels) {
  let changed = 0;
  for (let index = 0; index < session.activities.length; index += 1) {
    const activity = session.activities[index];
    if (activity.intent !== "unknown") continue;
    const previous = session.activities[index - 1];
    const next = session.activities[index + 1];
    const previousNear = previous && activity.start - previous.end < 3 * 60_000;
    const nextNear = next && next.start - activity.end < 3 * 60_000;
    const previousIntent = previousNear && hasAutomaticEvidence(previous) ? previous.intent : null;
    const nextIntent = nextNear && hasAutomaticEvidence(next) ? next.intent : null;
    if (activity.durationMs <= 2 * 60_000 && previousIntent && nextIntent && previousIntent === nextIntent) {
      setIntent(activity, previousIntent, "medium", "sequence-context", `${previous.app} → ${activity.app} → ${next.app}`, intentLabels);
      changed += 1;
    }
  }
  return changed;
}

function applyStableSessionContext(session, intentLabels) {
  const evidence = session.activities.filter(hasAutomaticEvidence);
  const contextKeys = new Set(evidence.map(contextKey).filter(Boolean));
  if (contextKeys.size < 2) return 0;

  const totals = new Map();
  for (const activity of evidence) totals.set(activity.intent, (totals.get(activity.intent) || 0) + activity.durationMs);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const evidenceDuration = ranked.reduce((sum, [, duration]) => sum + duration, 0);
  const [dominantIntent, dominantDuration] = ranked[0] || [];
  if (!dominantIntent || evidenceDuration < 30_000 || dominantDuration / evidenceDuration < 0.8) return 0;

  let changed = 0;
  for (const activity of session.activities) {
    if (activity.intent !== "unknown" || activity.durationMs > 5 * 60_000) continue;
    setIntent(activity, dominantIntent, "low", "session-context", session.label, intentLabels);
    changed += 1;
  }
  return changed;
}

function sessionize(events, now = Date.now(), language = "ru", intentRules = []) {
  const lang = normalizeLanguage(language);
  const labels = FOCUS_LABELS[lang];
  const intentLabels = INTENT_LABELS[lang];
  const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at));
  const activities = [];
  let active = null;

  function closeActive(at) {
    if (!active) return;
    const hardEnd = Math.min(at, active.lastSignal + SIGNAL_TAIL_MS);
    const end = Math.max(active.start, hardEnd);
    activities.push({
      ...active,
      end,
      durationMs: end - active.start,
      title: safeTitle(active.title, active.app, lang),
    });
    active = null;
  }

  function startActive(event, at) {
    const app = canonicalApp(event, lang);
    active = {
      start: at,
      lastSignal: at,
      app,
      process: event.process || "",
      title: safeTitle(event.title || "", app, lang),
      context: event.context || "other",
      domain: event.domain || "",
      urlPath: event.urlPath || "",
      source: event.source || "native-collector",
      tabCount: Number(event.tabCount || 0),
      clicks: 0,
      inputs: 0,
    };
  }

  for (const event of sorted) {
    const at = new Date(event.at).getTime();
    if (!Number.isFinite(at)) continue;
    if (isSystemNoise(event) || isDaytraceEvent(event)) continue;

    // A suspended machine, an idle night, or a collector restart must never
    // reconnect the old interval when the same window is used again. Current
    // trackers also emit explicit idle/resume boundaries; this gap guard keeps
    // legacy journals and crash/restart cases safe.
    if (event.kind === "idle") {
      closeActive(at);
      continue;
    }
    if (active && at - active.lastSignal > MAX_CONTINUOUS_SIGNAL_GAP_MS) closeActive(at);

    if (event.kind === "foreground" || event.kind === "resume") {
      const nextApp = canonicalApp(event, lang);
      const nextTitle = safeTitle(event.title || "", nextApp, lang);
      if (active && active.app === nextApp && nextTitle === active.title) {
        active.lastSignal = at;
        if (Number(event.tabCount || 0) > active.tabCount) active.tabCount = Number(event.tabCount);
        if (event.domain) active.domain = event.domain;
        if (event.urlPath) active.urlPath = event.urlPath;
        if (event.source === "browser-companion") active.source = event.source;
        continue;
      }
      closeActive(at);
      startActive(event, at);
      continue;
    }
    if (!active && ["heartbeat", "click", "input"].includes(event.kind)) startActive(event, at);
    if (!active) continue;
    if (event.app && canonicalApp(event, lang) !== active.app) continue;
    active.lastSignal = at;
    if (event.context) active.context = event.context;
    if (event.domain) active.domain = event.domain;
    if (event.urlPath) active.urlPath = event.urlPath;
    if (event.source === "browser-companion") active.source = event.source;
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
    const intentClassification = inferIntentDetails(activity, intentRules);
    setIntent(activity, intentClassification.intent, intentClassification.confidence, intentClassification.reason, intentClassification.evidence, intentLabels, intentClassification.score);
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
  // Resolve ambiguous general-purpose apps without reading their contents.
  // Manual corrections never seed neighboring activities. Only strong
  // automatic evidence can bridge a short activity or teach the exact same
  // app/title context, preventing one game correction from recoloring a day.
  for (const session of sessions) contextualizeSession(session, intentLabels);
  learnRepeatedContexts(sessions, intentLabels);
  for (const session of sessions) applyStableSessionContext(session, intentLabels);
  for (const session of sessions) {
    const totals = new Map();
    const intentTotals = new Map();
    for (const activity of session.activities) totals.set(activity.focus, (totals.get(activity.focus) || 0) + activity.durationMs);
    for (const activity of session.activities) intentTotals.set(activity.intent, (intentTotals.get(activity.intent) || 0) + activity.durationMs);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const [topFocus, topDuration] = ranked[0] || ["other", 0];
    const topShare = session.durationMs > 0 ? topDuration / session.durationMs : 0;
    session.focus = ranked.length > 1 && topShare < 0.65 ? "mixed" : topFocus;
    session.label = labels[session.focus];
    session.focusBreakdown = ranked.map(([itemFocus, durationMs]) => ({ focus: itemFocus, label: labels[itemFocus], durationMs }));
    session.confidence = session.lowConfidenceActivities / Math.max(1, session.activities.length) > 0.4 ? "low" : "high";
    const rankedIntents = [...intentTotals.entries()].sort((a, b) => b[1] - a[1]);
    const [topIntent, topIntentDuration] = rankedIntents[0] || ["unknown", 0];
    const topIntentShare = session.durationMs > 0 ? topIntentDuration / session.durationMs : 0;
    session.intent = rankedIntents.length > 1 && topIntentShare < 0.65 ? "mixed" : topIntent;
    session.intentLabel = intentLabels[session.intent];
    session.intentBreakdown = rankedIntents.map(([intent, durationMs]) => ({ intent, label: intentLabels[intent], durationMs }));
    session.intentConfidence = session.activities.some((activity) => activity.intentConfidence === "low") ? "low" : "high";
  }
  return annotateSessions(sessions, lang);
}

module.exports = { FOCUS_LABELS, inferFocus, inferFocusDetails, normalizeLanguage, sessionize };
