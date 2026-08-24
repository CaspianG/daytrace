import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowRight, ArrowsLeftRight, Brain, Browsers, CalendarBlank, CaretLeft, CaretRight, ChartBar, Check, CheckCircle, Clock, Compass, Database, Desktop, DownloadSimple, Eye, EyeSlash, FileCsv, FolderOpen, Gear, Globe, Info, Key, LockKey, MagnifyingGlass, Moon, Pause, Play, Plus, PuzzlePiece, Robot, ShieldCheck, Sparkle, Sun, Timer, Trash, UploadSimple, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { SiFigma, SiGooglechrome, SiGmail, SiTelegram } from "react-icons/si";
import { FaEdge } from "react-icons/fa6";
import { VscVscode } from "react-icons/vsc";
import sageBranch from "./assets/sage-branch.png";
import { formatDay, formatDuration, formatTime, normalizeLanguage, text, translations } from "./i18n.js";
import { runSemanticAnalysis } from "./semantic-analysis-client.js";
import { applyDocumentTheme, effectiveTheme, normalizeTheme, observeSystemTheme, transitionDocumentTheme } from "./theme.js";

const NAVIGATION = [
  { id: "history", icon: Clock },
  { id: "ask", icon: MagnifyingGlass },
  { id: "settings", icon: Gear },
  { id: "exclusions", icon: ShieldCheck, separated: true },
];

const APP_ICONS = [
  [/visual studio|\bcode\b/i, VscVscode, "#168bd2"],
  [/chrome/i, SiGooglechrome, "#e25b3d"],
  [/edge/i, FaEdge, "#0a9c83"],
  [/telegram/i, SiTelegram, "#249bd7"],
  [/figma/i, SiFigma, "#292929"],
  [/gmail|mail/i, SiGmail, "#d94c3f"],
];

const FOCUS_LABELS = {
  en: { planning: "Planning and preparation", development: "Development", communication: "Messaging and email", design: "Design", research: "Research", browser: "Browser activity", ai: "AI assistant work", audio: "Audio production", remote: "Remote work", files: "File work", other: "Other activity", mixed: "Mixed activity", break: "Break" },
  ru: { planning: "Планирование и подготовка", development: "Разработка", communication: "Мессенджеры и почта", design: "Дизайн", research: "Исследование", browser: "Работа в браузере", ai: "Работа с ИИ-ассистентами", audio: "Работа со звуком", remote: "Удалённая работа", files: "Работа с файлами", other: "Другая активность", mixed: "Смешанная работа", break: "Перерыв" },
};

const INTENT_LABELS = {
  en: { work: "Work", learning: "Learning", personal: "Personal", entertainment: "Entertainment", unknown: "Ambiguous purpose", mixed: "Mixed purpose" },
  ru: { work: "Работа", learning: "Обучение", personal: "Личное", entertainment: "Развлечения", unknown: "Неоднозначная цель", mixed: "Смешанная цель" },
};

const RETENTION_OPTIONS = [48, 7 * 24, 30 * 24, 90 * 24, 365 * 24];
const CURRENT_ONBOARDING_VERSION = 2;
const CONTEXT_SENSITIVE_APPS = /(?:chrome|edge|firefox|brave|opera|vivaldi|safari|browser|telegram|whatsapp|signal|discord|viber|messenger|chatgpt|claude|perplexity|copilot)/i;
const DEMO_ANALYSIS_QUALITY = {
  benchmark: {
    dataset: "Daytrace semantic RU/EN visible-title set",
    datasetVersion: "2026-08-24",
    engines: {
      builtin: { benchmark: { labelable: 48, covered: 27, correct: 25, precision: 25 / 27, coverage: 27 / 48, accuracy: 25 / 48 } },
      signals: { benchmark: { labelable: 48, covered: 28, correct: 26, precision: 26 / 28, coverage: 28 / 48, accuracy: 26 / 48 } },
      semantic: { benchmark: { labelable: 48, covered: 37, correct: 35, precision: 35 / 37, coverage: 37 / 48, accuracy: 35 / 48 } },
    },
  },
  personal: {
    generatedAt: Date.now(), contextCount: 42, labelledContextCount: 8, labelledOccurrences: 27,
    engines: {
      builtin: { ruleCount: 0, history: { contexts: 42, covered: 19, coverage: 19 / 42 }, personal: { labelled: 8, covered: 5, correct: 4, precision: .8, coverage: .625, accuracy: .5 } },
      signals: { ruleCount: 4, history: { contexts: 42, covered: 23, coverage: 23 / 42 }, personal: { labelled: 8, covered: 6, correct: 5, precision: 5 / 6, coverage: .75, accuracy: .625 } },
      semantic: { ruleCount: 9, history: { contexts: 42, covered: 29, coverage: 29 / 42 }, personal: { labelled: 8, covered: 7, correct: 6, precision: 6 / 7, coverage: .875, accuracy: .75 } },
    },
  },
  running: false,
  error: "",
};

function startOfToday(hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function demoLanguage() {
  const query = new URLSearchParams(window.location.search).get("lang");
  return normalizeLanguage(query || navigator.language);
}

function demoState(language = demoLanguage(), onboardingComplete = new URLSearchParams(window.location.search).get("onboarding") !== "1") {
  const lang = normalizeLanguage(language);
  const t = translations[lang];
  const params = new URLSearchParams(window.location.search);
  const updatePreview = params.get("update");
  const macPermissionPreview = params.get("capture") === "mac-permission";
  const desktopPreview = params.get("capture") === "desktop" || macPermissionPreview;
  const previewEngine = desktopPreview && ["builtin", "signals", "semantic"].includes(params.get("analysisEngine")) ? params.get("analysisEngine") : "builtin";
  const reviewPreview = params.get("review") === "1";
  const updateStatus = ["available", "downloading", "ready", "installing", "restarting", "installer-opened", "windows-installer-opened", "error"].includes(updatePreview) ? updatePreview : "up-to-date";
  const apps = ["Visual Studio Code", "Google Chrome", "Telegram Desktop", "Visual Studio Code", "Visual Studio Code", "Google Chrome", "Figma", "Telegram Desktop", "Gmail"];
  const focuses = ["development", "planning", "communication", "development", "development", "research", "design", "communication", "communication"];
  const intents = ["work", "work", "work", "work", "work", "learning", "work", "personal", "work"];
  const times = [[9, 5, 9, 30], [9, 30, 9, 45], [9, 45, 10, 0], [10, 0, 10, 15], [10, 15, 10, 45], [10, 45, 11, 15], [11, 15, 11, 30], [11, 30, 11, 50], [11, 50, 12, 5]];
  const activities = times.map(([sh, sm, eh, em], index) => ({
    start: startOfToday(sh, sm), end: startOfToday(eh, em), durationMs: startOfToday(eh, em) - startOfToday(sh, sm),
    app: apps[index], title: t.demo.titles[index], observedLabel: t.demo.titles[index], focus: focuses[index], focusLabel: FOCUS_LABELS[lang][focuses[index]], intent: intents[index], intentLabel: INTENT_LABELS[lang][intents[index]], intentConfidence: index === 7 ? "high" : "medium", intentConfidenceScore: index === 7 ? 0.9 : 0.72, intentReason: index === 7 ? "custom-rule" : "window-title", intentEvidenceItems: [{ kind: "window-title", value: t.demo.titles[index] }], context: apps[index].includes("Chrome") ? "browser" : apps[index].includes("Telegram") ? "messaging" : "other",
    tabCount: apps[index].includes("Chrome") ? (index === 1 ? 7 : 11) : 0, clicks: 4, inputs: 18,
  }));
  const makeSession = (id, from, to, focus, intent) => ({ id, start: activities[from].start, end: activities[to].end, durationMs: activities[to].end - activities[from].start, focus, label: FOCUS_LABELS[lang][focus], intent, intentLabel: INTENT_LABELS[lang][intent], activities: activities.slice(from, to + 1) });
  const reviewQueue = reviewPreview ? activities.slice(0, 6).map((activity, index) => ({
    id: `demo-review-${index}`, scope: CONTEXT_SENSITIVE_APPS.test(activity.app) ? "context" : "application", start: activity.start, end: activity.end,
    firstSeenAt: activity.start - index * 45 * 60_000, lastSeenAt: activity.end, durationMs: (index + 1) * 12 * 60_000, occurrenceCount: index + 2,
    app: activity.app, title: activity.title, observedLabel: activity.observedLabel, intent: "unknown", confidence: "low", confidenceScore: .28 + index * .03,
  })) : [];
  return {
    settings: { trackingEnabled: true, retentionHours: 48, excludePrivateWindows: true, collectWindowTitles: true, collectInputCounts: true, collectBrowserTabCount: true, analysisEngine: previewEngine, smartAnalysisEnabled: previewEngine !== "builtin", browserCompanionEnabled: false, autoStartEnabled: false, theme: normalizeTheme(params.get("theme")), excludedApps: ["1Password", "Bitwarden", "KeePass"], intentRules: [{ id: "demo-friends", match: lang === "ru" ? "Друзья" : "Friends", intent: "personal" }], intentRulesUndo: [], language: lang, onboardingComplete, onboardingVersion: onboardingComplete ? CURRENT_ONBOARDING_VERSION : Number(params.get("onboardingVersion") || 0), quickTourComplete: params.get("tour") !== "1", accessibilityOnboardingDismissed: false, reviewLearningExplained: false, reviewReminderSnoozedUntil: null, reviewReminderLastCount: 0 },
    runtime: { platform: macPermissionPreview ? "darwin" : updatePreview || desktopPreview ? "win32" : "browser", trackerStatus: macPermissionPreview ? "permission-required" : "running", accessibilityTrusted: !macPermissionPreview, accessibilityMainTrusted: true, accessibilityTarget: "Daytrace Collector", autoStartSupported: desktopPreview, autoStartEnabled: false, capabilities: { browserTabCount: Boolean(updatePreview || desktopPreview), browserCompanion: Boolean(updatePreview || desktopPreview), smartAnalysis: true, encryptedBackup: true }, browserCompanion: { running: desktopPreview }, smartAnalysis: { engine: previewEngine, installed: true, running: false, version: "built-in", signal: { installed: false, running: false, sizeBytes: 6391, updateAvailable: false, lastResult: { status: "never", candidates: 0, refined: 0, changed: 0 } }, semantic: { installed: false, running: false, downloading: false, progress: 0, sizeBytes: 49821594, version: "1.0.0", languages: ["ru", "en"], quality: { benchmark: { labelable: 48, precision: 35 / 37, coverage: 37 / 48 }, holdout: { precision: 20 / 22, coverage: 22 / 32 } }, lastResult: { status: "never", candidates: 0, refined: 0, changed: 0 } }, quality: DEMO_ANALYSIS_QUALITY }, diagnostics: null, update: { status: updateStatus, currentVersion: "0.5.10", latestVersion: updatePreview ? "0.6.0" : "0.5.10", checkedAt: Date.now(), progress: updateStatus === "downloading" ? 64 : ["ready", "installing", "restarting"].includes(updateStatus) ? 100 : 0 } },
    sessions: [
      makeSession("demo-1", 0, 2, "mixed", "work"), makeSession("demo-2", 3, 6, "mixed", "work"), makeSession("demo-3", 7, 8, "communication", "mixed"),
      { id: "demo-break", start: startOfToday(12, 5), end: startOfToday(12, 20), durationMs: 15 * 60_000, focus: "break", label: FOCUS_LABELS[lang].break, intent: "unknown", intentLabel: INTENT_LABELS[lang].unknown, activities: [] },
    ],
    brief: { totalMs: 3 * 60 * 60_000, appCount: 5, narrative: t.demo.brief, themes: activities.slice(0, 3).map((activity) => ({ label: activity.title, app: activity.app, durationMs: activity.durationMs })), completed: [t.demo.completed], openLoops: [t.demo.openLoop], interruptions: [], lowConfidenceCount: 0 },
    reviewQueue, reviewBacklog: { uniqueCount: reviewQueue.length, occurrenceCount: reviewQueue.reduce((total, item) => total + item.occurrenceCount, 0), durationMs: reviewQueue.reduce((total, item) => total + item.durationMs, 0), thresholdReached: reviewQueue.length >= 5, notificationDue: reviewQueue.length >= 5, firstExplanation: true, snoozedUntil: null }, eventCount: 128, retentionCutoff: Date.now() - 48 * 60 * 60_000, historyStartedAt: startOfToday(9, 5), availableDays: [dateKey(Date.now())], dataPath: t.demo.dataPath,
    skills: [
      { id: "morning-dev", title: t.demo.skills[0][0], description: t.demo.skills[0][1], apps: ["Visual Studio Code", "Google Chrome", "Telegram Desktop"], count: 3, duration: t.demo.skills[0][2] },
      { id: "requirements-sync", title: t.demo.skills[1][0], description: t.demo.skills[1][1], apps: ["Telegram Desktop", "Figma", "Gmail"], count: 2, duration: t.demo.skills[1][2] },
    ],
  };
}

function startOfLocalDay(value) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function addLocalDays(value, amount) {
  const day = new Date(startOfLocalDay(value));
  day.setDate(day.getDate() + amount);
  return day.getTime();
}

function dateKey(value) {
  const day = new Date(value);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function formatRetention(hours, t) {
  return t.settings.retentionDurations[String(hours)] || text(t.settings.retentionCustom, { days: Math.round(hours / 24) });
}

function daySessions(sessions, selectedDay, language = "en") {
  const start = startOfLocalDay(selectedDay);
  const end = start + 24 * 60 * 60_000;
  const observed = sessions
    .filter((session) => session.end > start && session.start < end)
    .map((session) => ({
      ...session,
      activities: [...session.activities]
        .filter((activity) => activity.end > start && activity.start < end)
        .sort((a, b) => b.end - a.end),
    }))
    .sort((a, b) => a.start - b.start);
  const withBreaks = [];
  for (const session of observed) {
    const previous = withBreaks.filter((item) => item.focus !== "break").at(-1);
    const gapStart = previous ? Math.max(start, previous.end) : null;
    const gapEnd = Math.min(end, session.start);
    if (gapStart !== null && gapEnd - gapStart >= 5 * 60_000) {
      withBreaks.push({ id: `break-${gapStart}-${gapEnd}`, start: gapStart, end: gapEnd, durationMs: gapEnd - gapStart, focus: "break", label: FOCUS_LABELS[normalizeLanguage(language)].break, activities: [], synthetic: true });
    }
    withBreaks.push(session);
  }
  return withBreaks.sort((a, b) => b.end - a.end);
}

function buildOverview(sessions, selectedDay) {
  const dayStart = startOfLocalDay(selectedDay);
  const dayEnd = dayStart + 24 * 60 * 60_000;
  const activities = sessions.flatMap((session) => session.activities.map((activity) => ({
    ...activity,
    focus: activity.focus || session.focus,
    label: activity.focusLabel || session.label,
    intent: activity.intent || session.intent || "unknown",
    intentLabel: activity.intentLabel || session.intentLabel || INTENT_LABELS.en.unknown,
  })));
  const focus = new Map();
  const intents = new Map();
  const apps = new Map();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, durationMs: 0, apps: new Map(), intents: new Map() }));
  let activeMs = 0;
  let maxTabs = 0;
  for (const activity of activities) {
    const start = Math.max(dayStart, activity.start);
    const end = Math.min(dayEnd, activity.end);
    const duration = Math.max(0, end - start);
    activeMs += duration;
    focus.set(activity.focus, { focus: activity.focus, label: activity.label, durationMs: (focus.get(activity.focus)?.durationMs || 0) + duration });
    intents.set(activity.intent, { intent: activity.intent, label: activity.intentLabel, durationMs: (intents.get(activity.intent)?.durationMs || 0) + duration });
    apps.set(activity.app, (apps.get(activity.app) || 0) + duration);
    maxTabs = Math.max(maxTabs, Number(activity.tabCount || 0));
    let cursor = start;
    while (cursor < end) {
      const nextHour = new Date(cursor);
      nextHour.setMinutes(60, 0, 0);
      const sliceEnd = Math.min(end, nextHour.getTime());
      const bucket = hours[new Date(cursor).getHours()];
      const sliceDuration = sliceEnd - cursor;
      bucket.durationMs += sliceDuration;
      bucket.apps.set(activity.app, (bucket.apps.get(activity.app) || 0) + sliceDuration);
      bucket.intents.set(activity.intent, {
        intent: activity.intent,
        label: activity.intentLabel,
        durationMs: (bucket.intents.get(activity.intent)?.durationMs || 0) + sliceDuration,
      });
      cursor = sliceEnd;
    }
  }
  const focusTotals = [...focus.values()].sort((a, b) => b.durationMs - a.durationMs);
  const intentTotals = [...intents.values()].sort((a, b) => b.durationMs - a.durationMs);
  const appTotals = [...apps.entries()].map(([app, durationMs]) => ({ app, durationMs })).sort((a, b) => b.durationMs - a.durationMs);
  const usedHours = hours.filter((item) => item.durationMs > 0);
  const firstHour = usedHours.length ? Math.max(0, usedHours[0].hour - 1) : 8;
  const lastHour = usedHours.length ? Math.min(23, usedHours.at(-1).hour + 1) : 18;
  return {
    activeMs,
    appCount: apps.size,
    switchCount: [...activities].sort((a, b) => a.start - b.start).reduce((count, activity, index, ordered) => {
      if (!index) return count;
      const previous = ordered[index - 1];
      return count + ((previous.app !== activity.app || (previous.context && activity.context && previous.context !== activity.context)) ? 1 : 0);
    }, 0),
    maxTabs,
    focusTotals,
    intentTotals,
    appTotals,
    hours: hours.slice(firstHour, lastHour + 1).map((item) => ({
      hour: item.hour,
      durationMs: item.durationMs,
      appTotals: [...item.apps.entries()].map(([app, durationMs]) => ({ app, durationMs })).sort((a, b) => b.durationMs - a.durationMs),
      intentTotals: [...item.intents.values()].sort((a, b) => b.durationMs - a.durationMs),
    })),
    topFocus: focusTotals[0],
    topIntent: intentTotals[0],
    topApp: appTotals[0],
  };
}

function AppIcon({ app, size = 31 }) {
  const matched = APP_ICONS.find(([pattern]) => pattern.test(app));
  if (!matched) return <div className="generic-app-icon" style={{ width: size, height: size }}>{app.slice(0, 1).toUpperCase()}</div>;
  const Icon = matched[1];
  return <Icon size={size} color={matched[2]} title={app} />;
}

function useDaytrace() {
  const [state, setState] = useState(() => demoState());
  const [isDesktop, setIsDesktop] = useState(() => ["desktop", "mac-permission"].includes(new URLSearchParams(window.location.search).get("capture")));
  const [hydrated, setHydrated] = useState(() => !window.daytrace);
  useEffect(() => {
    if (!window.daytrace) return undefined;
    setIsDesktop(true);
    window.daytrace.getState().then(setState).catch(() => {}).finally(() => setHydrated(true));
    const removeStateListener = window.daytrace.onStateChanged((nextState) => { setState(nextState); setHydrated(true); });
    const removeSemanticListener = window.daytrace.onSemanticAnalysisRequested?.(() => {
      runSemanticAnalysis(window.daytrace)
        .then((nextState) => { if (nextState?.settings) setState(nextState); })
        .catch(() => window.daytrace.getState().then(setState).catch(() => {}));
    });
    return () => { removeStateListener?.(); removeSemanticListener?.(); };
  }, []);
  const language = normalizeLanguage(state.settings.language);
  const actions = {
    async loadDay(day) {
      if (window.daytrace) return window.daytrace.getDay(day);
      const start = startOfLocalDay(day);
      const end = addLocalDays(start, 1);
      return { day: start, sessions: state.sessions.filter((session) => session.end > start && session.start < end), brief: state.brief, reviewQueue: state.reviewQueue || [] };
    },
    async setTracking(enabled) { if (window.daytrace) setState(await window.daytrace.setTracking(enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, trackingEnabled: enabled } })); },
    async setSetting(key, enabled) { if (window.daytrace) setState(await window.daytrace.setSetting(key, enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, [key]: enabled } })); },
    async setTheme(theme) {
      const next = normalizeTheme(theme);
      setState((current) => ({ ...current, settings: { ...current.settings, theme: next } }));
      if (!window.daytrace) return undefined;
      try {
        const nextState = await window.daytrace.setTheme(next);
        setState(nextState);
        return nextState;
      } catch (error) {
        window.daytrace.getState().then(setState).catch(() => {});
        throw error;
      }
    },
    async setRetention(hours) {
      if (window.daytrace) setState(await window.daytrace.setRetention(hours));
      else setState((current) => ({ ...current, settings: { ...current.settings, retentionHours: hours }, retentionCutoff: Date.now() - hours * 60 * 60_000 }));
    },
    async setAutoStart(enabled) { if (window.daytrace) setState(await window.daytrace.setAutoStart(enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, autoStartEnabled: enabled }, runtime: { ...current.runtime, autoStartEnabled: enabled } })); },
    async requestAccessibility() { if (window.daytrace) setState(await window.daytrace.requestAccessibility()); },
    async refreshAccessibility() { if (window.daytrace) setState(await window.daytrace.refreshAccessibility()); },
    async dismissAccessibilityOnboarding() { if (window.daytrace) setState(await window.daytrace.dismissAccessibilityOnboarding()); else setState((current) => ({ ...current, settings: { ...current.settings, accessibilityOnboardingDismissed: true } })); },
    relaunch() { return window.daytrace?.relaunch(); },
    async setExclusions(apps) { if (window.daytrace) setState(await window.daytrace.setExclusions(apps)); else setState((current) => ({ ...current, settings: { ...current.settings, excludedApps: apps } })); },
    async previewIntentRules(rules) {
      if (window.daytrace) return window.daytrace.previewIntentRules(rules);
      return { affectedActivities: 1, affectedDurationMs: 20 * 60_000, affectedDays: 1, samples: [], nextRules: rules };
    },
    async setIntentRules(rules) {
      if (window.daytrace) setState(await window.daytrace.setIntentRules(rules));
      else setState((current) => ({ ...current, settings: { ...current.settings, intentRulesUndo: current.settings.intentRules, intentRules: rules, intentRulesChangedAt: Date.now() } }));
    },
    async undoIntentRules() {
      if (window.daytrace) setState(await window.daytrace.undoIntentRules());
      else setState((current) => ({ ...current, settings: { ...current.settings, intentRules: current.settings.intentRulesUndo || [], intentRulesUndo: current.settings.intentRules || [] } }));
    },
    async setLanguage(nextLanguage) { const next = normalizeLanguage(nextLanguage); if (window.daytrace) setState(await window.daytrace.setLanguage(next)); else setState((current) => { const nextState = demoState(next, true); return { ...nextState, settings: { ...nextState.settings, theme: current.settings.theme } }; }); },
    async completeOnboarding(nextLanguage, analysisEngine = "builtin") {
      const selection = { language: normalizeLanguage(nextLanguage), analysisEngine };
      if (window.daytrace) setState(await window.daytrace.completeOnboarding(selection));
      else setState((current) => {
        const completed = demoState(selection.language, true);
        return { ...completed, settings: { ...completed.settings, theme: current.settings.theme, analysisEngine, smartAnalysisEnabled: analysisEngine !== "builtin", quickTourComplete: false }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine: analysisEngine } } };
      });
    },
    async restartOnboarding() { if (window.daytrace) setState(await window.daytrace.restartOnboarding()); else setState((current) => ({ ...current, settings: { ...current.settings, onboardingVersion: CURRENT_ONBOARDING_VERSION - 1 } })); },
    async completeQuickTour() { if (window.daytrace) setState(await window.daytrace.completeQuickTour()); else setState((current) => ({ ...current, settings: { ...current.settings, quickTourComplete: true } })); },
    async acknowledgeReviewGuidance(action) {
      if (window.daytrace) setState(await window.daytrace.acknowledgeReviewGuidance(action));
      else setState((current) => ({ ...current, settings: { ...current.settings, reviewLearningExplained: true, reviewReminderSnoozedUntil: Date.now() + (action === "later" ? 7 : 1) * 24 * 60 * 60_000, reviewReminderLastCount: current.reviewBacklog?.uniqueCount || 0 }, reviewBacklog: { ...current.reviewBacklog, notificationDue: false, firstExplanation: false } }));
    },
    async deleteAll() { if (window.daytrace) setState(await window.daytrace.deleteAll()); else setState((current) => ({ ...current, sessions: [], eventCount: 0, historyStartedAt: null, availableDays: [] })); },
    async deleteSession(session) { if (window.daytrace) setState(await window.daytrace.deleteSession(session.start, session.end)); else setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) })); },
    async ask(question) {
      if (window.daytrace) return window.daytrace.ask(question);
      const t = translations[language];
      const sources = state.sessions.map((session) => ({ ...session, label: session.intentLabel, duration: formatDuration(session.durationMs, language), apps: [...new Set(session.activities.map((item) => item.app))] }));
      return { answer: text(t.summary.default, { intent: INTENT_LABELS[language].work.toLocaleLowerCase(t.locale), app: "Visual Studio Code" }), interpretation: t.ask.demoInterpretation, points: state.sessions.filter((session) => session.activities.length).map((session) => ({ label: session.intentLabel, duration: formatDuration(session.durationMs, language) })), sources };
    },
    async exportSkill(skill) { if (window.daytrace) return window.daytrace.exportSkill(skill); return text(translations[language].skills.draft, { title: skill.title }); },
    async exportData(format) { if (window.daytrace) return window.daytrace.exportData(format); return `Daytrace-export.${format}`; },
    async createBackup(passphrase) { if (window.daytrace) return window.daytrace.createBackup(passphrase); return passphrase ? "Daytrace-backup.daytrace" : ""; },
    async restoreBackup(passphrase) { if (window.daytrace) setState(await window.daytrace.restoreBackup(passphrase)); },
    async runDiagnostics() {
      if (window.daytrace) {
        const diagnostics = await window.daytrace.runDiagnostics();
        setState((current) => ({ ...current, runtime: { ...current.runtime, diagnostics } }));
        return diagnostics;
      }
      const diagnostics = { status: "warn", checkedAt: Date.now(), checks: [
        ["storage", "pass"], ["tracker", "pass"], ["collector", "pass"], ["accessibility", "not-applicable"], ["titles", "pass"],
        ["idle", "pass"], ["private", "pass"], ["autostart", "pass"], ["browser", "warn"], ["smart", "not-applicable"],
      ].map(([id, status]) => ({ id, status, detail: "" })) };
      setState((current) => ({ ...current, runtime: { ...current.runtime, diagnostics } }));
      return diagnostics;
    },
    async refreshAnalysisQuality() {
      if (window.daytrace) setState(await window.daytrace.refreshAnalysisQuality());
      else setState((current) => ({ ...current, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, quality: { ...DEMO_ANALYSIS_QUALITY, personal: { ...DEMO_ANALYSIS_QUALITY.personal, generatedAt: Date.now() } } } } }));
    },
    async installBrowserHost() { if (window.daytrace) setState(await window.daytrace.installBrowserHost()); else setState((current) => ({ ...current, settings: { ...current.settings, browserCompanionEnabled: true }, runtime: { ...current.runtime, browserCompanion: { running: true } } })); },
    revealBrowserExtension() { return window.daytrace?.revealBrowserExtension(); },
    async setAnalysisEngine(engine) { if (window.daytrace) setState(await window.daytrace.setAnalysisEngine(engine)); else setState((current) => ({ ...current, settings: { ...current.settings, analysisEngine: engine, smartAnalysisEnabled: engine !== "builtin" }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine } } })); },
    async downloadSmartModel() { if (window.daytrace) setState(await window.daytrace.downloadSmartModel()); else setState((current) => ({ ...current, settings: { ...current.settings, analysisEngine: "signals", smartAnalysisEnabled: true }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine: "signals", installed: true, signal: { ...current.runtime.smartAnalysis.signal, installed: true, version: "1.1.0", updateAvailable: false } } } })); },
    async installSmartModel() { if (window.daytrace) setState(await window.daytrace.installSmartModel()); },
    async removeSmartModel() { if (window.daytrace) setState(await window.daytrace.removeSmartModel()); else setState((current) => ({ ...current, settings: { ...current.settings, analysisEngine: current.settings.analysisEngine === "signals" ? "builtin" : current.settings.analysisEngine, smartAnalysisEnabled: current.settings.analysisEngine !== "signals" && current.settings.analysisEngine !== "builtin" }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine: current.settings.analysisEngine === "signals" ? "builtin" : current.settings.analysisEngine, signal: { ...current.runtime.smartAnalysis.signal, installed: false } } } })); },
    async runSmartAnalysis() { if (window.daytrace) setState(await window.daytrace.runSmartAnalysis()); },
    async downloadSemanticModel() {
      if (window.daytrace) {
        setState(await window.daytrace.downloadSemanticModel());
        const nextState = await runSemanticAnalysis(window.daytrace);
        if (nextState?.settings) setState(nextState);
      } else setState((current) => ({ ...current, settings: { ...current.settings, analysisEngine: "semantic", smartAnalysisEnabled: true }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine: "semantic", installed: true, semantic: { ...current.runtime.smartAnalysis.semantic, installed: true, progress: 100, stage: "ready" } } } }));
    },
    async removeSemanticModel() { if (window.daytrace) setState(await window.daytrace.removeSemanticModel()); else setState((current) => ({ ...current, settings: { ...current.settings, analysisEngine: current.settings.analysisEngine === "semantic" ? "builtin" : current.settings.analysisEngine, smartAnalysisEnabled: current.settings.analysisEngine !== "semantic" && current.settings.analysisEngine !== "builtin" }, runtime: { ...current.runtime, smartAnalysis: { ...current.runtime.smartAnalysis, engine: current.settings.analysisEngine === "semantic" ? "builtin" : current.settings.analysisEngine, semantic: { ...current.runtime.smartAnalysis.semantic, installed: false, progress: 0 } } } })); },
    async runSelectedAnalysis() {
      if (!window.daytrace) return undefined;
      if (state.settings.analysisEngine === "semantic") {
        const nextState = await runSemanticAnalysis(window.daytrace);
        if (nextState?.settings) setState(nextState);
        return nextState;
      }
      setState(await window.daytrace.runSmartAnalysis());
      return undefined;
    },
    revealData() { return window.daytrace?.revealData(); },
    async checkUpdates() { if (window.daytrace) setState(await window.daytrace.checkUpdates()); else setState((current) => ({ ...current, runtime: { ...current.runtime, update: { ...current.runtime.update, status: "up-to-date", checkedAt: Date.now() } } })); },
    async installUpdate() { if (window.daytrace) setState(await window.daytrace.installUpdate()); },
  };
  return { state, actions, isDesktop, language, hydrated };
}

function Onboarding({ state, actions, language }) {
  const queryStep = Number(new URLSearchParams(window.location.search).get("tourStep"));
  const [step, setStep] = useState(Number.isInteger(queryStep) && queryStep >= 0 && queryStep <= 2 ? queryStep : 0);
  const [selected, setSelected] = useState(normalizeLanguage(language));
  const [engine, setEngine] = useState(["builtin", "signals", "semantic"].includes(state.settings.analysisEngine) ? state.settings.analysisEngine : "builtin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = translations[selected];
  const runtime = state.runtime?.smartAnalysis || {};
  const signal = runtime.signal || {};
  const semantic = runtime.semantic || {};
  const returning = Boolean(state.settings.onboardingComplete && Number(state.settings.onboardingVersion || 0) > 0);
  const semanticSize = semantic.sizeBytes
    ? `${new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(semantic.sizeBytes / (1024 * 1024))} ${t.settings.megabytes}`
    : t.settings.semanticApproxSize;
  const modes = [
    { id: "builtin", icon: Compass, title: t.settings.analysisBuiltin, description: t.settings.analysisBuiltinText, size: t.settings.analysisNoDownload, installed: true },
    { id: "signals", icon: Robot, title: t.settings.analysisSignals, description: t.settings.analysisSignalsText, size: t.settings.analysisSignalsSize, installed: Boolean(signal.installed) },
    { id: "semantic", icon: Brain, title: t.settings.analysisSemantic, description: t.settings.analysisSemanticText, size: semanticSize, installed: Boolean(semantic.installed), recommended: true },
  ];
  const finish = async (requestedEngine = engine, install = true) => {
    setBusy(true);
    setError("");
    try {
      let finalEngine = requestedEngine;
      if (install && requestedEngine === "signals" && !signal.installed) await actions.downloadSmartModel();
      if (install && requestedEngine === "semantic" && !semantic.installed) await actions.downloadSemanticModel();
      if (!install && !modes.find((mode) => mode.id === requestedEngine)?.installed) finalEngine = "builtin";
      await actions.completeOnboarding(selected, finalEngine);
    } catch {
      setError(t.onboarding.installError);
    } finally { setBusy(false); }
  };
  const next = () => { setError(""); setStep((value) => Math.min(2, value + 1)); };
  const back = () => { setError(""); setStep((value) => Math.max(0, value - 1)); };
  const finishLabel = engine === "semantic" && !semantic.installed
    ? t.onboarding.installSemantic
    : engine === "signals" && !signal.installed ? t.onboarding.installSignals : t.onboarding.start;
  return <main className="onboarding-shell">
    <section className="onboarding-card guided-onboarding-card">
      <header className="onboarding-topline">
        <div className="onboarding-logo"><Compass size={34} weight="fill" /></div>
        <div className="onboarding-progress" aria-label={text(t.onboarding.progress, { current: step + 1, total: 3 })}>
          {[0, 1, 2].map((item) => <span className={item <= step ? "active" : ""} key={item} />)}
        </div>
        <small>{text(t.onboarding.progress, { current: step + 1, total: 3 })}</small>
      </header>
      <div className="onboarding-stage" key={`${step}-${selected}`}>
        {step === 0 && <>
          <span className="eyebrow">{returning ? t.onboarding.returningEyebrow : t.onboarding.eyebrow}</span>
          <h1>{returning ? t.onboarding.returningTitle : t.onboarding.title}</h1>
          <p className="onboarding-subtitle">{returning ? t.onboarding.returningSubtitle : t.onboarding.subtitle}</p>
          <div className="language-grid" role="radiogroup" aria-label={t.onboarding.languageTitle}>
            <button className={selected === "en" ? "selected" : ""} onClick={() => setSelected("en")} role="radio" aria-checked={selected === "en"}><span>EN</span><div><strong>{t.onboarding.english}</strong><small>{t.onboarding.englishDetail}</small></div>{selected === "en" && <Check size={20} weight="bold" />}</button>
            <button className={selected === "ru" ? "selected" : ""} onClick={() => setSelected("ru")} role="radio" aria-checked={selected === "ru"}><span>RU</span><div><strong>{t.onboarding.russian}</strong><small>{t.onboarding.russianDetail}</small></div>{selected === "ru" && <Check size={20} weight="bold" />}</button>
          </div>
          <div className="onboarding-facts">
            <span><EyeSlash size={19} /><strong>{t.onboarding.noScreenshots}</strong></span>
            <span><Key size={19} /><strong>{t.onboarding.noTypedText}</strong></span>
            <span><LockKey size={19} /><strong>{t.onboarding.privateExcluded}</strong></span>
          </div>
          <div className="onboarding-privacy"><LockKey size={25} /><div><strong>{t.onboarding.privacyTitle}</strong><span>{t.onboarding.privacyText}</span></div></div>
        </>}
        {step === 1 && <>
          <span className="eyebrow">{t.onboarding.learnEyebrow}</span>
          <h1>{t.onboarding.learnTitle}</h1>
          <p className="onboarding-subtitle">{t.onboarding.learnSubtitle}</p>
          <div className="onboarding-flow">
            <article><span><Eye size={22} /></span><div><strong>{t.onboarding.observeTitle}</strong><p>{t.onboarding.observeText}</p></div></article>
            <ArrowRight size={18} />
            <article><span><Brain size={22} /></span><div><strong>{t.onboarding.inferTitle}</strong><p>{t.onboarding.inferText}</p></div></article>
            <ArrowRight size={18} />
            <article><span><Sparkle size={22} /></span><div><strong>{t.onboarding.rememberTitle}</strong><p>{t.onboarding.rememberText}</p></div></article>
          </div>
          <div className="onboarding-learning-note"><CheckCircle size={23} /><div><strong>{t.onboarding.onceTitle}</strong><span>{t.onboarding.onceText}</span></div></div>
        </>}
        {step === 2 && <>
          <span className="eyebrow">{t.onboarding.modelEyebrow}</span>
          <h1>{t.onboarding.modelTitle}</h1>
          <p className="onboarding-subtitle">{t.onboarding.modelSubtitle}</p>
          <div className="onboarding-model-grid" role="radiogroup" aria-label={t.settings.analysisMode}>
            {modes.map((mode) => { const Icon = mode.icon; return <button type="button" className={`onboarding-model-card ${engine === mode.id ? "selected" : ""}`} key={mode.id} onClick={() => setEngine(mode.id)} role="radio" aria-checked={engine === mode.id} disabled={busy}><span className="analysis-mode-icon"><Icon size={20} /></span><span><strong>{mode.title}</strong>{mode.recommended && <em>{t.onboarding.recommended}</em>}<small>{mode.description}</small><b>{mode.size}</b><EngineQualityInline engine={mode.id} quality={runtime.quality} t={t} compact /></span>{mode.installed && <CheckCircle size={19} />}</button>; })}
          </div>
          <QualityLegend quality={runtime.quality} t={t} personal />
          <div className="onboarding-llm-note"><Info size={20} /><div><strong>{t.onboarding.llmTitle}</strong><span>{t.onboarding.llmText}</span></div></div>
          {(busy && (semantic.downloading || engine === "semantic")) && <div className="onboarding-download"><span><strong>{t.onboarding.downloading}</strong><small>{text(t.onboarding.downloadProgress, { progress: Math.round(Number(semantic.progress || 0)) })}</small></span><div><i style={{ width: `${Math.max(3, Number(semantic.progress || 0))}%` }} /></div></div>}
          {error && <div className="onboarding-error" role="alert"><WarningCircle size={19} /><span>{error}</span><button onClick={() => finish("builtin", false)}>{t.onboarding.continueBuiltin}</button></div>}
        </>}
      </div>
      <footer className="onboarding-actions">
        <button className="onboarding-skip" disabled={busy} onClick={() => finish(state.settings.analysisEngine || "builtin", false)}>{t.onboarding.skip}</button>
        <span />
        {step > 0 && <button className="onboarding-back" disabled={busy} onClick={back}><CaretLeft size={18} />{t.onboarding.back}</button>}
        {step < 2
          ? <button className="onboarding-continue compact" onClick={next}>{t.onboarding.next}<ArrowRight size={19} /></button>
          : <button className="onboarding-continue compact" disabled={busy} onClick={() => finish()}>{busy ? <ArrowClockwise className="spin" size={18} /> : <DownloadSimple size={18} />}{busy ? t.onboarding.preparing : finishLabel}</button>}
      </footer>
    </section>
  </main>;
}

function MacPermissionOnboarding({ actions, onContinue, runtime, t }) {
  const [requesting, setRequesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const request = async () => {
    setRequesting(true);
    try { await actions.requestAccessibility(); }
    finally { setRequesting(false); }
  };
  const refresh = async () => {
    setChecking(true);
    try { await actions.refreshAccessibility(); }
    finally { setChecking(false); }
  };
  return <main className="onboarding-shell permission-onboarding-shell">
    <section className="onboarding-card permission-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="mac-permission-title">
      <button className="permission-close" onClick={onContinue} title={t.onboarding.permissionLater} aria-label={t.onboarding.permissionLater}><X size={21} /></button>
      <div className="onboarding-logo"><ShieldCheck size={34} weight="fill" /></div>
      <span className="eyebrow">{t.onboarding.permissionEyebrow}</span>
      <h1 id="mac-permission-title">{t.onboarding.permissionTitle}</h1>
      <p className="onboarding-subtitle">{t.onboarding.permissionSubtitle}</p>
      <ol className="permission-steps">
        <li><span>1</span>{t.onboarding.permissionStepOne}</li>
        <li><span>2</span>{t.onboarding.permissionStepTwo}</li>
        <li><span>3</span>{t.onboarding.permissionStepThree}</li>
      </ol>
      {runtime?.macInstall?.issue && <div className="permission-copy-warning"><strong>{t.onboarding.permissionCopyTitle}</strong><span>{text(t.settings.accessibilityInstallIssues[runtime.macInstall.issue] || t.settings.accessibilityInstallIssues["unknown-location"], { name: runtime.macInstall.appName, path: runtime.macInstall.bundlePath || "—" })}</span></div>}
      <div className="permission-repair"><strong>{runtime?.accessibilityMainTrusted ? t.onboarding.permissionWrongTargetTitle : t.onboarding.permissionRepairTitle}</strong><span>{runtime?.accessibilityMainTrusted ? t.onboarding.permissionWrongTargetText : t.onboarding.permissionRepairText}</span></div>
      <div className="onboarding-privacy"><LockKey size={25} /><div><strong>{t.settings.deviceOnly}</strong><span>{t.onboarding.permissionPrivacy}</span></div></div>
      <button className="onboarding-continue" onClick={request} disabled={requesting}>{requesting ? t.onboarding.permissionWaiting : t.onboarding.permissionGrant}<ArrowRight size={19} /></button>
      <button className="permission-check" onClick={refresh} disabled={checking}>{checking ? t.onboarding.permissionChecking : t.onboarding.permissionCheck}<ArrowClockwise size={18} /></button>
      <button className="permission-restart" onClick={actions.relaunch}>{t.onboarding.permissionRestart}</button>
      <button className="permission-later" onClick={onContinue}>{t.onboarding.permissionLater}</button>
    </section>
  </main>;
}

function SidebarUpdateStatus({ update, actions, setPage, t }) {
  const status = update.status;
  const visible = ["checking", "available", "downloading", "ready", "installing", "restarting", "installer-opened", "windows-installer-opened", "error"].includes(status);
  if (!visible) return null;
  const progress = Math.max(0, Math.min(100, Number(update.progress || 0)));
  const labels = {
    checking: t.status.updateChecking,
    available: text(t.status.update, { version: update.latestVersion }),
    downloading: text(t.status.updateDownloading, { progress }),
    ready: t.status.updateReady,
    installing: t.status.updateInstalling,
    restarting: t.status.updateRestarting,
    "installer-opened": t.status.updateMacOpened,
    "windows-installer-opened": t.status.updateWindowsOpened,
    error: t.status.updateFailed,
  };
  const busy = ["checking", "downloading", "installing", "restarting"].includes(status);
  const Icon = status === "error" ? X : ["ready", "installer-opened", "windows-installer-opened"].includes(status) ? Check : status === "available" || status === "downloading" ? DownloadSimple : ArrowClockwise;
  const activate = () => status === "available" ? actions.installUpdate() : setPage("settings");
  return <button className={`sidebar-update-status ${status}`} onClick={activate} title={labels[status]} aria-label={labels[status]}>
    <Icon size={19} weight="bold" className={busy && status !== "downloading" ? "spin" : ""} />
    <span>{labels[status]}</span>
    {status === "downloading" && <em>{progress}%</em>}
    {status === "downloading" && <i style={{ width: `${Math.max(3, progress)}%` }} />}
  </button>;
}

function commitThemeChange(nextTheme, event, onChange) {
  transitionDocumentTheme(nextTheme, {
    clientX: event?.clientX,
    clientY: event?.clientY,
    onCommit: (selected) => {
      const result = onChange(selected);
      result?.catch?.(() => {});
    },
  });
}

function ThemeQuickToggle({ theme, actions, t }) {
  const selected = normalizeTheme(theme);
  const effective = effectiveTheme(selected);
  const next = effective === "dark" ? "light" : "dark";
  const Icon = effective === "dark" ? Moon : Sun;
  return <button className="sidebar-theme-toggle" onClick={(event) => commitThemeChange(next, event, actions.setTheme)} title={text(t.settings.themeSwitch, { theme: t.settings.themeOptions[next] })} aria-label={text(t.settings.themeSwitch, { theme: t.settings.themeOptions[next] })}>
    <span className="theme-toggle-icon"><Icon size={18} weight="fill" /></span>
    <span><strong>{t.settings.themeOptions[selected]}</strong><small>{t.settings.themeQuick}</small></span>
  </button>;
}

function ThemeSelector({ theme, onChange, disabled, t }) {
  const selected = normalizeTheme(theme);
  const options = [
    { id: "system", icon: Desktop },
    { id: "light", icon: Sun },
    { id: "dark", icon: Moon },
  ];
  return <div className="appearance-setting"><div className="appearance-copy"><Sparkle size={21} /><span><strong>{t.settings.theme}</strong><small>{t.settings.themeText}</small></span></div><div className="theme-options" role="group" aria-label={t.settings.theme}>{options.map(({ id, icon: Icon }) => <button key={id} className={selected === id ? "active" : ""} aria-pressed={selected === id} disabled={disabled} onClick={(event) => commitThemeChange(id, event, onChange)}><Icon size={20} weight={selected === id ? "fill" : "regular"} /><span><strong>{t.settings.themeOptions[id]}</strong><small>{t.settings.themeDescriptions[id]}</small></span>{selected === id && <Check size={15} weight="bold" />}</button>)}</div></div>;
}

function ReviewCoach({ state, onReview, onModel, onLater, language, t }) {
  const backlog = state.reviewBacklog || {};
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!backlog.notificationDue) { setVisible(false); return undefined; }
    const timer = setTimeout(() => setVisible(true), 650);
    return () => clearTimeout(timer);
  }, [backlog.notificationDue, backlog.uniqueCount, backlog.occurrenceCount]);
  if (!visible || !backlog.notificationDue) return null;
  const firstExplanation = Boolean(backlog.firstExplanation);
  return <aside className="review-coach" role="status" aria-live="polite">
    <button className="review-coach-close" onClick={onLater} aria-label={t.reviewCoach.later}><X size={16} /></button>
    <div className="review-coach-icon"><Sparkle size={23} weight="fill" /></div>
    <div className="review-coach-copy">
      <span className="eyebrow">{t.reviewCoach.eyebrow}</span>
      <h2>{text(t.reviewCoach.title, { count: backlog.uniqueCount })}</h2>
      <p>{text(t.reviewCoach.text, { occurrences: backlog.occurrenceCount, duration: formatDuration(backlog.durationMs || 0, language) })}</p>
      {firstExplanation && <div className="review-coach-learning"><CheckCircle size={18} /><span><strong>{t.reviewCoach.onceTitle}</strong>{t.reviewCoach.onceText}</span></div>}
      <div className="review-coach-actions"><button onClick={onReview}><CheckCircle size={17} />{t.reviewCoach.review}</button><button onClick={onModel}><Brain size={17} />{t.reviewCoach.model}</button><button onClick={onLater}>{t.reviewCoach.later}</button></div>
    </div>
  </aside>;
}

function AppLoading({ language }) {
  const copy = translations[normalizeLanguage(language)].quickTour;
  return <main className="app-loading" aria-live="polite"><div className="app-loading-mark"><Compass size={34} weight="fill" /><span /></div><strong>{copy.loadingTitle}</strong><small>{copy.loadingText}</small></main>;
}

function QuickTour({ onClose, onNavigate, t }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const steps = [
    { selector: '[data-tour="overview"]', page: "history", icon: ChartBar, ...t.quickTour.steps[0] },
    { selector: '[data-tour="ask"]', page: "history", icon: MagnifyingGlass, ...t.quickTour.steps[1] },
    { selector: '[data-tour="purpose"]', page: "history", icon: Sparkle, ...t.quickTour.steps[2] },
    { selector: '[data-tour="analysis"]', page: "settings", focus: "smart", icon: Brain, ...t.quickTour.steps[3] },
    { selector: '[data-tour="local-status"]', page: "settings", icon: LockKey, ...t.quickTour.steps[4] },
  ];
  const step = steps[index];
  useEffect(() => {
    let resizeObserver;
    const update = () => {
      const target = document.querySelector(step.selector);
      if (!target) { setRect(null); return; }
      const next = target.getBoundingClientRect();
      if (next.width < 2 || next.height < 2) { setRect(null); return; }
      setRect({ left: next.left, top: next.top, width: next.width, height: next.height, right: next.right, bottom: next.bottom });
    };
    onNavigate(step.page, step.focus || "");
    const revealTimer = setTimeout(() => {
      const target = document.querySelector(step.selector);
      if (target && !target.closest(".sidebar")) target.scrollIntoView({ block: step.selector === '[data-tour="overview"]' ? "start" : "center", behavior: "smooth" });
      update();
      if (target && typeof ResizeObserver !== "undefined") { resizeObserver = new ResizeObserver(update); resizeObserver.observe(target); }
    }, 140);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => { clearTimeout(revealTimer); resizeObserver?.disconnect(); window.removeEventListener("resize", update); document.removeEventListener("scroll", update, true); };
  }, [index]);
  useEffect(() => {
    const keyboard = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((current) => Math.min(steps.length - 1, current + 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [onClose]);
  const Icon = step.icon;
  const spotlight = rect ? { left: Math.max(8, rect.left - 7), top: Math.max(8, rect.top - 7), width: Math.max(42, rect.width + 14), height: Math.max(42, rect.height + 14) } : null;
  const canPlaceRight = rect && rect.right + 405 < window.innerWidth;
  const cardStyle = canPlaceRight ? { left: rect.right + 22, top: Math.max(24, Math.min(window.innerHeight - 420, rect.top - 10)) } : undefined;
  return <div className={`quick-tour-layer ${rect ? "" : "no-target"}`} role="dialog" aria-modal="true" aria-labelledby="quick-tour-title">
    {spotlight && <div className="quick-tour-spotlight" style={spotlight} />}
    <section className={`quick-tour-card ${canPlaceRight ? "beside" : "corner"}`} style={cardStyle}>
      <header><span>{t.quickTour.eyebrow}</span><small>{text(t.quickTour.counter, { current: index + 1, total: steps.length })}</small><button onClick={onClose} aria-label={t.quickTour.close}><X size={18} /></button></header>
      <div className="quick-tour-visual" key={index}><Sparkle className="quick-tour-spark one" size={19} weight="fill" /><span><Icon size={31} weight="duotone" /></span><Sparkle className="quick-tour-spark two" size={14} weight="fill" /></div>
      <div className="quick-tour-copy" key={`copy-${index}`}><h2 id="quick-tour-title">{step.title}</h2><p>{step.text}</p><div><Info size={16} /><span>{step.hint}</span></div></div>
      <div className="quick-tour-progress" aria-hidden="true">{steps.map((item, itemIndex) => <span key={item.title} className={itemIndex <= index ? "active" : ""} />)}</div>
      <footer><button className="quick-tour-skip" onClick={onClose}>{t.quickTour.close}</button><span />{index > 0 && <button className="quick-tour-back" onClick={() => setIndex(index - 1)}><CaretLeft size={16} />{t.quickTour.previous}</button>}<button className="quick-tour-next" onClick={() => index === steps.length - 1 ? onClose() : setIndex(index + 1)}>{index === steps.length - 1 ? t.quickTour.finish : t.quickTour.next}<ArrowRight size={16} /></button></footer>
    </section>
  </div>;
}

function Sidebar({ page, setPage, state, actions, language, t, onStartTour }) {
  const historyStartedAt = state.historyStartedAt ? new Date(state.historyStartedAt) : null;
  const historyStart = historyStartedAt && Number.isFinite(historyStartedAt.getTime())
    ? text(t.status.historyStart, { time: new Intl.DateTimeFormat(t.locale, { dateStyle: "short", timeStyle: "short" }).format(historyStartedAt) })
    : t.status.historyEmpty;
  const update = state.runtime?.update || {};
  const reviewCount = state.reviewBacklog?.notificationDue ? Number(state.reviewBacklog.uniqueCount || 0) : 0;
  return <aside className="sidebar">
    <div className="brand-mark"><Compass size={29} weight="fill" /></div>
    <nav className="main-nav" aria-label={language === "ru" ? "Разделы" : "Sections"}>{NAVIGATION.map(({ id, icon: Icon, separated }) => <button key={id} data-tour={id === "settings" ? "settings-nav" : undefined} className={`${page === id ? "active" : ""} ${separated ? "separated" : ""}`} onClick={() => setPage(id)} aria-label={t.nav[id]} title={t.nav[id]}><Icon size={25} weight={page === id ? "fill" : "regular"} /><span>{t.nav[id]}</span>{id === "settings" && reviewCount > 0 && <em className="nav-review-count" aria-label={text(t.reviewCoach.navCount, { count: reviewCount })}>{reviewCount}</em>}</button>)}</nav>
    <button className="sidebar-tour-button" onClick={onStartTour} title={t.quickTour.replay}><Info size={19} /><span>{t.quickTour.replay}</span></button>
    <ThemeQuickToggle theme={state.settings.theme} actions={actions} t={t} />
    <div className="sidebar-status" data-tour="local-status"><div className="status-row"><span className={`status-dot ${state.settings.trackingEnabled ? "on" : "off"}`} /><span>{state.settings.trackingEnabled ? t.common.local : t.status.paused}</span></div><div className="status-row muted"><Database size={18} /><span>{text(t.status.retention, { period: formatRetention(state.settings.retentionHours, t) })}</span></div><div className="expiry">{historyStart}</div></div>
    <SidebarUpdateStatus update={update} actions={actions} setPage={setPage} t={t} />
    <button className={`tracking-button ${state.settings.trackingEnabled ? "pause" : "resume"}`} onClick={() => actions.setTracking(!state.settings.trackingEnabled)}>{state.settings.trackingEnabled ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}{state.settings.trackingEnabled ? t.status.pause : t.status.resume}</button>
  </aside>;
}

function QuestionBar({ onAsk, t, initial = "" }) {
  const [question, setQuestion] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQuestion(initial); }, [initial]);
  async function submit(event) { event?.preventDefault(); const value = question.trim() || t.question.fallback; setBusy(true); try { await onAsk(value); } finally { setBusy(false); } }
  return <form className="question-bar" data-tour="ask" onSubmit={submit}><MagnifyingGlass size={26} /><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t.question.placeholder} aria-label={t.question.label} /><button type="submit" disabled={busy}>{busy ? t.question.searching : t.question.ask}</button></form>;
}

function OverviewMetrics({ stats, language, t, capabilities = {} }) {
  const cards = [
    { icon: Timer, value: stats.activeMs ? formatDuration(stats.activeMs, language) : "—", label: t.overview.activeTime, hint: t.overview.activeTimeHint },
    { icon: ChartBar, value: stats.appCount || "—", label: t.overview.apps, hint: t.overview.appsHint },
    { icon: ArrowsLeftRight, value: stats.switchCount || "—", label: t.overview.switches, hint: t.overview.switchesHint },
    ...(capabilities.browserTabCount === false ? [] : [{ icon: Browsers, value: stats.maxTabs || "—", label: t.overview.tabs, hint: stats.maxTabs ? t.overview.tabsHint : t.overview.noTabs }]),
  ];
  return <section className="overview-metrics">{cards.map(({ icon: Icon, value, label, hint }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={19} /></div><strong>{value}</strong><span>{label}</span><small>{hint}</small></article>)}</section>;
}

function RankedBars({ title, subtitle, items, max, renderLabel, renderValue }) {
  return <section className="chart-card"><header><div><h3>{title}</h3><p>{subtitle}</p></div></header><div className="ranked-bars">{items.slice(0, 5).map((item) => <div className="ranked-row" key={renderLabel(item)}><div className="ranked-label"><span>{renderLabel(item)}</span><strong>{renderValue(item)}</strong></div><div className="ranked-track"><span style={{ width: `${Math.max(4, (item.durationMs / Math.max(1, max)) * 100)}%` }} /></div></div>)}</div></section>;
}

function DateCalendar({ selectedDay, minDay, maxDay, availableDays, language, onSelect, onClose, t }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const month = new Date(selectedDay);
    month.setDate(1);
    month.setHours(0, 0, 0, 0);
    return month.getTime();
  });
  const available = useMemo(() => new Set(availableDays || []), [availableDays]);
  const month = new Date(visibleMonth);
  const gridStart = new Date(visibleMonth);
  const mondayOffset = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart.getTime(), index));
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2026, 5, 1 + index);
    return new Intl.DateTimeFormat(t.locale, { weekday: "narrow" }).format(day);
  });
  const monthLabel = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" }).format(month).replace(/^./, (letter) => letter.toUpperCase());
  const previousMonth = new Date(visibleMonth);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const nextMonth = new Date(visibleMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const canPreviousMonth = addLocalDays(new Date(visibleMonth).setDate(0), 0) >= minDay;
  const canNextMonth = nextMonth.getTime() <= maxDay;
  return <div className="calendar-popover" role="dialog" aria-label={t.calendar.title}>
    <header><button onClick={() => setVisibleMonth(previousMonth.getTime())} disabled={!canPreviousMonth} title={t.calendar.previousMonth}><CaretLeft size={17} /></button><strong>{monthLabel}</strong><button onClick={() => setVisibleMonth(nextMonth.getTime())} disabled={!canNextMonth} title={t.calendar.nextMonth}><CaretRight size={17} /></button></header>
    <div className="calendar-weekdays">{weekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}</div>
    <div className="calendar-grid">{days.map((day) => {
      const value = new Date(day);
      const outside = value.getMonth() !== month.getMonth();
      const disabled = day < minDay || day > maxDay;
      const selected = day === selectedDay;
      const today = day === startOfLocalDay(Date.now());
      return <button key={day} className={`${outside ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""} ${available.has(dateKey(day)) ? "has-data" : ""}`} disabled={disabled} aria-pressed={selected} aria-label={new Intl.DateTimeFormat(t.locale, { dateStyle: "full" }).format(value)} onClick={() => { onSelect(day); onClose(); }}><span>{value.getDate()}</span></button>;
    })}</div>
    <footer><span>{t.calendar.dataHint}</span><button onClick={() => { onSelect(startOfLocalDay(Date.now())); onClose(); }}>{t.overview.backToday}</button></footer>
  </div>;
}

function DateNavigation({ selectedDay, minDay, maxDay, availableDays, language, onSelect, t }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === "Escape" || (event.type === "pointerdown" && !root.current?.contains(event.target))) setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const previousDay = addLocalDays(selectedDay, -1);
  const nextDay = addLocalDays(selectedDay, 1);
  const canPrevious = addLocalDays(previousDay, 1) > minDay;
  const canNext = nextDay <= maxDay;
  const compactDate = selectedDay === maxDay ? t.common.today : new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short" }).format(new Date(selectedDay));
  return <nav className="day-nav" aria-label={t.nav.history} ref={root}>
    <button onClick={() => onSelect(previousDay)} disabled={!canPrevious} title={t.overview.previousDay}><CaretLeft size={18} /></button>
    <button className="date-picker-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><CalendarBlank size={17} /><span>{compactDate}</span></button>
    <button onClick={() => onSelect(nextDay)} disabled={!canNext} title={t.overview.nextDay}><CaretRight size={18} /></button>
    {open && <DateCalendar selectedDay={selectedDay} minDay={minDay} maxDay={maxDay} availableDays={availableDays} language={language} onSelect={onSelect} onClose={() => setOpen(false)} t={t} />}
  </nav>;
}

function ActivityRhythm({ stats, language, t }) {
  const [selectedHour, setSelectedHour] = useState(null);
  const max = Math.max(1, ...stats.hours.map((item) => item.durationMs));
  const details = stats.hours.find((item) => item.hour === selectedHour);
  return <section className="chart-card rhythm-card"><header><div><h3>{t.overview.rhythmTitle}</h3><p>{t.overview.rhythmSubtitle}</p></div><span>{t.overview.rhythmAction}</span></header><div className="rhythm-chart">{stats.hours.map((item) => {
    const label = `${String(item.hour).padStart(2, "0")}:00`;
    return <button type="button" className={`rhythm-hour ${selectedHour === item.hour ? "selected" : ""}`} key={item.hour} title={text(t.overview.rhythmHourTitle, { time: label, duration: item.durationMs ? formatDuration(item.durationMs, language) : t.overview.noActivity })} aria-pressed={selectedHour === item.hour} onClick={() => setSelectedHour((current) => current === item.hour ? null : item.hour)}><div><span style={{ height: `${Math.max(item.durationMs ? 8 : 2, (item.durationMs / max) * 100)}%` }} /></div><small>{String(item.hour).padStart(2, "0")}</small></button>;
  })}</div>{details && <div className="rhythm-detail"><div className="rhythm-detail-heading"><Clock size={18} /><span><strong>{String(details.hour).padStart(2, "0")}:00–{String((details.hour + 1) % 24).padStart(2, "0")}:00</strong><small>{details.durationMs ? text(t.overview.activeInHour, { duration: formatDuration(details.durationMs, language) }) : t.overview.noActivity}</small></span></div>{details.durationMs > 0 && <><div className="rhythm-apps">{details.appTotals.slice(0, 3).map((item) => <span key={item.app}><AppIcon app={item.app} size={18} /><strong>{item.app}</strong><small>{formatDuration(item.durationMs, language)}</small></span>)}</div>{details.intentTotals[0] && <p>{text(t.overview.hourPurpose, { purpose: details.intentTotals[0].label })}</p>}</>}</div>}</section>;
}

function DayOverview({ stats, language, t, capabilities }) {
  const intentMax = Math.max(1, ...stats.intentTotals.map((item) => item.durationMs));
  const appMax = Math.max(1, ...stats.appTotals.map((item) => item.durationMs));
  return <div className="day-overview" data-tour="overview"><OverviewMetrics stats={stats} language={language} t={t} capabilities={capabilities} /><div className="overview-charts"><RankedBars title={t.overview.intentTitle} subtitle={t.overview.intentSubtitle} items={stats.intentTotals} max={intentMax} renderLabel={(item) => item.label} renderValue={(item) => formatDuration(item.durationMs, language)} /><RankedBars title={t.overview.appsTitle} subtitle={t.overview.appsSubtitle} items={stats.appTotals} max={appMax} renderLabel={(item) => item.app} renderValue={(item) => formatDuration(item.durationMs, language)} /></div><ActivityRhythm stats={stats} language={language} t={t} /></div>;
}

function IntentPicker({ activity, onClassify, t }) {
  const score = Math.round(Math.max(0, Math.min(1, Number(activity.intentConfidenceScore ?? (activity.intentConfidence === "high" ? .9 : activity.intentConfidence === "medium" ? .7 : .3)))) * 100);
  const reason = t.intent.reasons[activity.intentReason] || t.intent.reasons.insufficient;
  const evidence = activity.intentEvidenceItems || [];
  return <div className="intent-control"><label className={`intent-badge ${activity.intentConfidence || "low"}`} title={`${t.intent.classify}: ${reason}`}><Sparkle size={13} /><select value={activity.intent || "unknown"} onChange={(event) => onClassify(activity, event.target.value)} aria-label={t.intent.classify}>{Object.entries(t.intent.labels).filter(([key]) => key !== "mixed").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><details className="intent-evidence"><summary title={t.intent.why} aria-label={t.intent.why}><Info size={14} /></summary><div><strong>{text(t.intent.confidence, { percent: score })}</strong><p>{reason}</p>{evidence.map((item, index) => <span key={`${item.kind}-${index}`}><small>{t.intent.evidenceKinds[item.kind] || t.intent.evidenceKinds.activity}</small>{item.value}</span>)}<em>{t.intent.factPurposeNote}</em></div></details></div>;
}

function Session({ session, onDelete, onClassify, language, t }) {
  const isBreak = session.focus === "break";
  return <section className={`timeline-session ${isBreak ? "break-session" : ""}`}><span className="timeline-node" /><header className="session-header"><div className="session-chip"><strong>{formatTime(session.start, language)} – {formatTime(session.end, language)}</strong><span>•</span><span>{isBreak ? session.label : `${t.session.intent}: ${(session.intentLabel || t.intent.unknown).toLocaleLowerCase(t.locale)}`}</span></div><span className="session-line" /><strong className="duration">{formatDuration(session.durationMs, language)}</strong>{!isBreak && <button className="icon-button delete-session" onClick={() => onDelete(session)} title={t.session.delete}><Trash size={17} /></button>}</header><div className="activity-list">{session.activities.map((activity, index) => <div className="activity" key={`${activity.start}-${index}`}><time>{formatTime(activity.start, language)} – {formatTime(activity.end, language)}</time><AppIcon app={activity.app} /><div className="activity-copy"><strong>{activity.app}</strong><div className="observed-fact"><Eye size={14} /><span><small>{t.intent.fact}</small>{activity.observedLabel || activity.title || t.common.activeWindow}</span></div><div className="activity-meta"><IntentPicker activity={activity} onClassify={onClassify} t={t} /><small>{activity.focusLabel || session.label}</small>{activity.tabCount > 0 && <small><Browsers size={13} /> {text(t.overview.tabsCount, { count: activity.tabCount })}</small>}{Number(activity.inputs || 0) + Number(activity.clicks || 0) > 0 && <small><ArrowsLeftRight size={13} /> {text(t.overview.inputCount, { count: Number(activity.inputs || 0) + Number(activity.clicks || 0) })}</small>}</div></div></div>)}</div></section>;
}

function Summary({ result, sessions, stats, brief, language, t }) {
  const sessionPoints = stats.intentTotals.map((item) => ({ label: item.label, duration: formatDuration(item.durationMs, language), detail: t.summary.intentDetails[item.intent] || t.summary.grouped }));
  const points = result?.points?.length ? result.points.map((point) => ({ ...sessionPoints.find((item) => item.label === point.label), ...point })) : sessionPoints;
  const dayBrief = result?.brief || brief;
  const answer = result?.answer || dayBrief?.narrative || (sessions.length ? text(t.summary.default, { intent: stats.topIntent?.label.toLocaleLowerCase(t.locale), app: stats.topApp?.app }) : t.summary.empty);
  return <aside className="summary-panel"><img className="sage-branch" src={sageBranch} alt="" /><h2>{t.summary.title}</h2><span className="summary-time">{text(t.summary.generated, { time: formatTime(Date.now(), language) })}</span><p className="summary-answer">{answer}</p>{dayBrief?.themes?.length > 0 && <div className="brief-section"><strong>{t.summary.themes}</strong>{dayBrief.themes.slice(0, 3).map((theme) => <div key={`${theme.app}-${theme.label}`}><span>{theme.label}</span><small>{formatDuration(theme.durationMs, language)}</small></div>)}</div>}{(dayBrief?.completed?.length > 0 || dayBrief?.openLoops?.length > 0) && <div className="brief-columns"><div><strong><CheckCircle size={15} /> {t.summary.completed}</strong>{dayBrief.completed.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div><div><strong><Timer size={15} /> {t.summary.openLoops}</strong>{dayBrief.openLoops.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div></div>}{dayBrief?.interruptions?.length > 0 && <div className="brief-interruptions"><strong>{t.summary.interruptions}</strong>{dayBrief.interruptions.slice(0, 2).map((item) => <span key={`${item.start}-${item.end}`}>{text(t.summary.interruptionItem, { duration: formatDuration(item.durationMs, language), context: item.returned || item.after })}</span>)}</div>}<div className="summary-points">{points.slice(0, 3).map((point) => <div className="summary-point" key={point.label}><span className="summary-dot" /><div><strong>{point.label}</strong><small>{point.time ? `${point.time} (${point.duration})` : point.duration}</small>{point.detail && <p>{point.detail}</p>}</div></div>)}</div><div className="privacy-note"><strong>{t.summary.how}</strong><p>{t.summary.explanation}</p><div><LockKey size={16} /> {t.summary.private}</div><div><EyeSlash size={16} /> {t.summary.excluded}</div></div></aside>;
}

function RulePreviewDialog({ preview, busy, onConfirm, onCancel, language, t }) {
  if (!preview) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section className="rule-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="rule-preview-title"><div className="dialog-icon"><Sparkle size={23} /></div><h2 id="rule-preview-title">{t.intent.previewTitle}</h2><p>{text(t.intent.previewText, { count: preview.affectedActivities, duration: formatDuration(preview.affectedDurationMs, language), days: preview.affectedDays })}</p>{preview.samples?.length > 0 && <div className="preview-samples">{preview.samples.slice(0, 4).map((sample) => <div key={`${sample.start}-${sample.app}`}><strong>{sample.app}</strong><span>{sample.title}</span><small>{t.intent.labels[sample.before]} → {t.intent.labels[sample.after]}</small></div>)}</div>}<div className="dialog-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>{t.common.cancel}</button><button className="primary-update-button" onClick={onConfirm} disabled={busy}>{busy ? t.intent.applying : t.intent.applyRule}</button></div></section></div>;
}

function HistoryPage({ state, actions, setPage, selectedDay, language, t }) {
  const [result, setResult] = useState(null);
  const [loadedDay, setLoadedDay] = useState(null);
  const [rulePreview, setRulePreview] = useState(null);
  const [applyingRule, setApplyingRule] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadedDay(null);
    actions.loadDay(selectedDay).then((day) => { if (active) setLoadedDay(day); }).catch(() => { if (active) setLoadedDay({ day: selectedDay, sessions: [] }); });
    return () => { active = false; };
  }, [selectedDay, state.eventCount, state.settings.intentRulesChangedAt]);
  const sessions = useMemo(() => daySessions(loadedDay?.sessions || state.sessions, selectedDay, language), [loadedDay, state.sessions, selectedDay, language]);
  const stats = useMemo(() => buildOverview(sessions, selectedDay), [sessions, selectedDay]);
  useEffect(() => { setResult(null); }, [language, selectedDay]);
  const classify = async (activity, intent) => {
    if (intent === activity.intent) return;
    const app = String(activity.app || activity.process || "").trim();
    const title = String(activity.title || "").trim();
    const contextSensitive = /(?:chrome|edge|firefox|brave|opera|vivaldi|safari|browser|telegram|whatsapp|signal|discord|viber|messenger|chatgpt|claude|perplexity|copilot)/i.test(app);
    const scope = contextSensitive ? "context" : "application";
    const match = scope === "application" || !title ? app : title;
    const sameRule = (rule) => rule.scope === scope
      && String(rule.app || "").toLocaleLowerCase(t.locale) === app.toLocaleLowerCase(t.locale)
      && (scope !== "context" || String(rule.title || "").toLocaleLowerCase(t.locale) === title.toLocaleLowerCase(t.locale));
    const rules = (state.settings.intentRules || []).filter((rule) => !sameRule(rule));
    const nextRules = [...rules, { id: `${Date.now()}`, scope, app, title: scope === "context" ? title : undefined, match, intent }];
    const preview = await actions.previewIntentRules(nextRules);
    setRulePreview({ ...preview, nextRules });
  };
  const confirmRule = async () => {
    if (!rulePreview) return;
    setApplyingRule(true);
    try {
      await actions.setIntentRules(rulePreview.nextRules);
      setLoadedDay(await actions.loadDay(selectedDay));
      setShowUndo(true);
      setRulePreview(null);
    } finally { setApplyingRule(false); }
  };
  const undoRule = async () => {
    await actions.undoIntentRules();
    setLoadedDay(await actions.loadDay(selectedDay));
    setShowUndo(false);
  };
  const removeSession = async (session) => {
    await actions.deleteSession(session);
    setLoadedDay(await actions.loadDay(selectedDay));
  };
  const reviewCount = loadedDay?.reviewQueue?.length || 0;
  return <div className="history-page"><QuestionBar t={t} onAsk={async (question) => setResult(await actions.ask(question))} />{showUndo && <div className="undo-banner"><Check size={17} /><span>{t.intent.ruleApplied}</span><button onClick={undoRule}><ArrowCounterClockwise size={16} /> {t.intent.undo}</button><button className="icon-button" onClick={() => setShowUndo(false)} aria-label={t.common.cancel}><X size={15} /></button></div>}<div className="history-layout"><main className="timeline-column"><DayOverview stats={stats} language={language} t={t} capabilities={state.runtime?.capabilities} />{reviewCount > 0 && <button className="review-banner" onClick={() => setPage("settings", "review")}><WarningCircle size={18} /><span><strong>{text(t.intent.reviewCount, { count: reviewCount })}</strong><small>{t.intent.reviewHint}</small></span><ArrowRight size={17} /></button>}<div className="section-title timeline-title"><h2>{t.history.title}</h2><span>{t.history.newestFirst}</span></div>{sessions.length ? <div className="timeline reverse-timeline" data-tour="purpose">{sessions.map((session) => <Session key={session.id} session={session} onDelete={removeSession} onClassify={classify} language={language} t={t} />)}</div> : <div className="empty-state" data-tour="purpose"><Clock size={34} /><h3>{t.history.emptyTitle}</h3><p>{t.history.emptyText}</p><button onClick={() => setPage("settings")}>{t.history.checkSettings} <ArrowRight size={17} /></button></div>}</main><Summary result={result} sessions={sessions} stats={stats} brief={loadedDay?.brief || state.brief} language={language} t={t} /></div><RulePreviewDialog preview={rulePreview} busy={applyingRule} onConfirm={confirmRule} onCancel={() => setRulePreview(null)} language={language} t={t} /></div>;
}

function AskPage({ actions, setPage, language, retentionHours, t }) {
  const [result, setResult] = useState(null);
  useEffect(() => { setResult(null); }, [language]);
  return <div className="subpage ask-page"><div className="subpage-heading"><Brain size={29} /><div><h2>{t.ask.title}</h2><p>{text(t.ask.subtitle, { period: formatRetention(retentionHours, t) })}</p></div><button className="skills-link" onClick={() => setPage("skills")}><Sparkle size={17} /> {t.ask.skills}</button></div><QuestionBar t={t} initial={t.question.fallback} onAsk={async (question) => setResult(await actions.ask(question))} /><div className="answer-surface">{result ? <><span className="eyebrow">{t.ask.localAnswer}</span>{result.interpretation && <div className="interpretation"><Brain size={16} /><span><strong>{t.ask.understood}</strong> {result.interpretation}</span></div>}<h3>{result.answer}</h3><div className="answer-sources">{result.sources.map((source) => <div key={source.id}><Clock size={18} /><span>{formatTime(source.start, language)}–{formatTime(source.end, language)}</span><strong>{source.label}</strong><small>{source.apps.join(", ")}</small></div>)}</div><p className="local-engine-note">{t.ask.engineNote}</p></> : <><span className="eyebrow">{t.ask.examples}</span><h3>{t.ask.examplesText}</h3><div className="prompt-chips">{t.ask.prompts.map((prompt) => <span key={prompt}>{prompt}</span>)}</div><p className="local-engine-note">{t.ask.engineNote}</p></>}</div></div>;
}

function SkillsPage({ state, actions, t }) {
  const [exported, setExported] = useState("");
  return <div className="subpage"><div className="subpage-heading"><Sparkle size={29} /><div><h2>{t.skills.title}</h2><p>{t.skills.subtitle}</p></div></div><div className="skill-list">{state.skills.length ? state.skills.map((skill) => <article className="skill-card" key={skill.id}><div className="skill-icon"><Sparkle size={22} /></div><div><h3>{skill.title}</h3><p>{skill.description}</p><div className="app-sequence">{skill.apps.map((app, index) => <span key={app}><AppIcon app={app} size={22} />{index < skill.apps.length - 1 && <ArrowRight size={14} />}</span>)}</div></div><button onClick={async () => setExported(await actions.exportSkill(skill))}>{t.skills.create}</button></article>) : <div className="empty-state"><Sparkle size={34} /><h3>{t.skills.emptyTitle}</h3><p>{t.skills.emptyText}</p></div>}</div>{exported && <div className="toast"><Check size={18} /> {text(t.skills.saved, { path: exported })}</div>}</div>;
}

function ExclusionsPage({ state, actions, t }) {
  const [value, setValue] = useState("");
  const apps = state.settings.excludedApps;
  function add() { const next = value.trim(); if (!next || apps.some((app) => app.toLowerCase() === next.toLowerCase())) return; actions.setExclusions([...apps, next]); setValue(""); }
  return <div className="subpage narrow-page"><div className="subpage-heading"><ShieldCheck size={29} /><div><h2>{t.exclusions.title}</h2><p>{t.exclusions.subtitle}</p></div></div><div className="privacy-banner"><LockKey size={25} /><div><strong>{t.exclusions.privateTitle}</strong><span>{t.exclusions.privateText}</span></div></div><div className="settings-section"><h3>{t.exclusions.appTitle}</h3><div className="add-exclusion"><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder={t.exclusions.placeholder} /><button onClick={add}><Plus size={18} /> {t.common.add}</button></div><div className="exclusion-list">{apps.map((app) => <div key={app}><span>{app}</span><button onClick={() => actions.setExclusions(apps.filter((item) => item !== app))} title={t.exclusions.remove}><X size={18} /></button></div>)}</div></div></div>;
}

function LanguageSelector({ language, onChange, t }) {
  return <div className="language-setting"><div><Globe size={22} /><span><strong>{t.settings.language}</strong><small>{t.settings.languageText}</small></span></div><div className="segmented-language" role="radiogroup" aria-label={t.settings.language}><button className={language === "en" ? "active" : ""} onClick={() => onChange("en")} role="radio" aria-checked={language === "en"}>English</button><button className={language === "ru" ? "active" : ""} onClick={() => onChange("ru")} role="radio" aria-checked={language === "ru"}>Русский</button></div></div>;
}

function IntentRuleEditor({ rules, onPropose, t }) {
  const [match, setMatch] = useState("");
  const [intent, setIntent] = useState("work");
  function addRule() {
    const value = match.replace(/\s+/g, " ").trim();
    if (!value) return;
    onPropose([...rules, { id: `${Date.now()}`, match: value, intent }]);
    setMatch("");
  }
  return <div className="intent-rule-editor"><p>{t.settings.analysisText}</p><div className="intent-rule-form"><input value={match} onChange={(event) => setMatch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addRule()} placeholder={t.settings.rulePlaceholder} maxLength={120} /><select value={intent} onChange={(event) => setIntent(event.target.value)} aria-label={t.settings.rulePurpose}>{Object.entries(t.intent.labels).filter(([key]) => key !== "unknown" && key !== "mixed").map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><button onClick={addRule} disabled={!match.trim()}><Plus size={17} /> {t.common.add}</button></div>{rules.length ? <div className="intent-rule-list">{rules.map((rule) => <div key={rule.id}><span><strong>{rule.match}</strong><small>{t.intent.labels[rule.intent] || t.intent.unknown}</small></span><button onClick={() => onPropose(rules.filter((item) => item.id !== rule.id))} title={t.settings.removeRule}><X size={17} /></button></div>)}</div> : <div className="rule-empty">{t.settings.ruleEmpty}</div>}</div>;
}

function SettingSwitch({ checked, disabled, label, onChange }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`setting-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>;
}

function UpdateSettings({ runtime, actions, pending, run, t }) {
  const update = runtime.update || { status: "disabled", currentVersion: "—" };
  const checking = update.status === "checking";
  const downloading = update.status === "downloading";
  const installing = ["installing", "restarting"].includes(update.status);
  const available = update.status === "available";
  const status = t.settings.updateStatuses[update.status] || t.settings.updateStatuses.idle;
  const checked = update.checkedAt ? new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(update.checkedAt)) : null;
  return <div className="update-settings"><div className="update-copy"><div><strong>{text(t.settings.currentVersion, { version: update.currentVersion || "—" })}</strong><span>{available ? text(t.settings.availableVersion, { version: update.latestVersion }) : status}</span>{checked && <small>{text(t.settings.lastChecked, { time: checked })}</small>}</div>{downloading && <div className="update-progress"><span style={{ width: `${Math.max(3, Number(update.progress || 0))}%` }} /></div>}{update.error && <small className="update-error">{t.settings.updateError}</small>}</div><div className="update-actions"><button className="secondary-button" disabled={Boolean(pending) || checking || downloading || installing || update.status === "disabled"} onClick={() => run("check-update", actions.checkUpdates)}><ArrowClockwise size={18} className={checking ? "spin" : ""} /> {checking ? t.settings.checking : t.settings.checkUpdates}</button>{available && <button className="primary-update-button" disabled={Boolean(pending)} onClick={() => run("install-update", actions.installUpdate)}><DownloadSimple size={18} /> {runtime.platform === "darwin" ? text(t.settings.downloadMac, { version: update.latestVersion }) : text(t.settings.installUpdate, { version: update.latestVersion })}</button>}</div><p>{t.settings.updatePrivacy}</p></div>;
}

function RetentionSettings({ hours, actions, pending, run, t }) {
  return <div className="retention-settings"><div className="retention-copy"><Database size={21} /><span><strong>{t.settings.retentionTitle}</strong><small>{t.settings.retentionText}</small></span></div><div className="retention-options" role="radiogroup" aria-label={t.settings.retentionTitle}>{RETENTION_OPTIONS.map((option) => <button type="button" key={option} className={hours === option ? "active" : ""} role="radio" aria-checked={hours === option} disabled={Boolean(pending)} onClick={() => run("retention", () => actions.setRetention(option))}>{formatRetention(option, t)}</button>)}</div><p>{t.settings.retentionWarning}</p></div>;
}

function ReviewQueue({ items, onClassify, learningExplained, onAcknowledge, t }) {
  return <div className="review-queue" id="review-settings"><div className="review-heading"><div><strong>{t.settings.reviewTitle}</strong><p>{t.settings.reviewText}</p></div><span>{items.length}</span></div>{items.length > 0 && !learningExplained && <div className="review-learning-note"><Sparkle size={20} /><span><strong>{t.settings.reviewLearnTitle}</strong><small>{t.settings.reviewLearnText}</small></span><button onClick={onAcknowledge}>{t.settings.reviewUnderstood}</button></div>}{items.length ? <div className="review-list">{items.slice(0, 8).map((item) => <article key={item.id}><div><strong>{item.observedLabel || item.title || item.app}</strong><small>{item.app} · {text(t.intent.confidence, { percent: Math.round(Number(item.confidenceScore || 0) * 100) })}</small><em>{text(t.settings.reviewOccurrences, { count: item.occurrenceCount || 1 })}</em></div><select value={item.intent || "unknown"} onChange={(event) => { onAcknowledge?.(); onClassify(item, event.target.value); }} aria-label={t.intent.classify}>{Object.entries(t.intent.labels).filter(([key]) => key !== "mixed").map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></article>)}</div> : <div className="review-empty"><CheckCircle size={20} /><span>{t.settings.reviewEmpty}</span></div>}</div>;
}

function qualityPercent(value) {
  return Math.round(Number(value || 0) * 100);
}

function EngineQualityInline({ engine, quality, t, compact = false }) {
  const benchmark = quality?.benchmark?.engines?.[engine]?.benchmark;
  if (!benchmark) return null;
  return <span className={`engine-quality-inline ${compact ? "compact" : ""}`}>
    <span><b>≈{qualityPercent(benchmark.precision)}%</b><small>{t.settings.enginePrecisionShort}</small></span>
    <span><b>{qualityPercent(benchmark.coverage)}%</b><small>{t.settings.engineCoverageShort}</small></span>
  </span>;
}

function QualityLegend({ quality, t, personal = false }) {
  const count = quality?.benchmark?.engines?.builtin?.benchmark?.labelable || 0;
  if (!count) return null;
  const personalResult = quality?.personal;
  return <div className={`quality-legend ${personal ? "onboarding-quality-legend" : ""}`}><Info size={18} /><span>
    <strong>{text(t.settings.engineBenchmarkTitle, { count })}</strong>
    <small>{t.settings.engineBenchmarkLegend}</small>
    {personal && personalResult?.contextCount > 0 && <em>{text(t.settings.enginePersonalAvailable, { contexts: personalResult.contextCount, labelled: personalResult.labelledContextCount || 0 })}</em>}
  </span></div>;
}

function AnalysisQualityPanel({ quality, signalInstalled, semanticInstalled, pending, onRefresh, t }) {
  const personal = quality?.personal;
  const modes = [
    { id: "builtin", title: t.settings.analysisBuiltin, installed: true },
    { id: "signals", title: t.settings.analysisSignals, installed: signalInstalled },
    { id: "semantic", title: t.settings.analysisSemantic, installed: semanticInstalled },
  ];
  const labelled = Number(personal?.labelledContextCount || 0);
  const preliminary = labelled > 0 && labelled < 15;
  const checkedAt = personal?.generatedAt ? new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(personal.generatedAt)) : "";
  return <section className="engine-quality-panel">
    <header><div><ChartBar size={21} /><span><strong>{t.settings.engineQualityTitle}</strong><small>{t.settings.engineQualityText}</small></span></div><button className="text-button" disabled={Boolean(pending) || quality?.running} onClick={onRefresh}><ArrowClockwise size={16} className={quality?.running ? "spin" : ""} />{quality?.running ? t.settings.engineQualityChecking : t.settings.engineQualityRefresh}</button></header>
    <QualityLegend quality={quality} t={t} />
    {personal ? <div className="personal-quality">
      <div className="personal-quality-heading"><span><strong>{t.settings.enginePersonalTitle}</strong><small>{text(t.settings.enginePersonalSample, { contexts: personal.contextCount || 0, labelled })}{checkedAt ? ` · ${checkedAt}` : ""}</small></span>{preliminary && <em>{t.settings.enginePersonalPreliminary}</em>}</div>
      <div className="personal-quality-grid">
        {modes.map((mode) => {
          const result = personal.engines?.[mode.id];
          const unavailable = mode.id !== "builtin" && !mode.installed;
          const waitingForPass = mode.id !== "builtin" && mode.installed && !Number(result?.ruleCount || 0);
          return <div className={`personal-quality-row ${unavailable || waitingForPass ? "unavailable" : ""}`} key={mode.id}><strong>{mode.title}</strong>{unavailable ? <span>{t.settings.enginePersonalInstall}</span> : waitingForPass ? <span>{t.settings.enginePersonalRun}</span> : <><span><b>{qualityPercent(result?.history?.coverage)}%</b><small>{t.settings.enginePersonalHistoryCoverage}</small></span><span><b>{labelled ? `${qualityPercent(result?.personal?.accuracy)}%` : "—"}</b><small>{t.settings.enginePersonalAgreement}</small></span></>}</div>;
        })}
      </div>
      <p>{labelled ? preliminary ? t.settings.enginePersonalSmallSample : t.settings.enginePersonalNote : t.settings.enginePersonalNoLabels}</p>
    </div> : <div className="personal-quality-empty"><Clock size={18} /><span>{quality?.running ? t.settings.engineQualityChecking : t.settings.enginePersonalWaiting}</span></div>}
    {quality?.error && <small className="analysis-error">{t.settings.engineQualityError}</small>}
  </section>;
}

function SmartAnalysisSettings({ state, actions, pending, run, t, onStartTour }) {
  const runtime = state.runtime?.smartAnalysis || {};
  const engine = state.settings.analysisEngine || runtime.engine || "builtin";
  const signal = runtime.signal || {};
  const semantic = runtime.semantic || {};
  const selectedRuntime = engine === "signals" ? signal : engine === "semantic" ? semantic : runtime;
  const lastResult = selectedRuntime.lastResult || {};
  const semanticSize = semantic.sizeBytes
    ? `${new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(semantic.sizeBytes / (1024 * 1024))} ${t.settings.megabytes}`
    : t.settings.semanticApproxSize;
  const modes = [
    { id: "builtin", icon: Compass, title: t.settings.analysisBuiltin, size: t.settings.analysisNoDownload, description: t.settings.analysisBuiltinText, installed: true },
    { id: "signals", icon: Robot, title: t.settings.analysisSignals, size: t.settings.analysisSignalsSize, description: t.settings.analysisSignalsText, installed: Boolean(signal.installed) },
    { id: "semantic", icon: Brain, title: t.settings.analysisSemantic, size: semanticSize, description: t.settings.analysisSemanticText, installed: Boolean(semantic.installed) },
  ];
  return <div className="analysis-settings">
    <div className="feature-heading analysis-heading"><Brain size={23} /><div><strong>{t.settings.smartTitle}</strong><span>{t.settings.smartText}</span></div></div>
    <div className="analysis-mode-grid" role="radiogroup" aria-label={t.settings.analysisMode}>
      {modes.map((mode) => { const Icon = mode.icon; return <button type="button" key={mode.id} className={`analysis-mode-card ${engine === mode.id ? "selected" : ""}`} role="radio" aria-checked={engine === mode.id} disabled={Boolean(pending) || semantic.downloading || semantic.running} onClick={() => run(`analysis-${mode.id}`, () => actions.setAnalysisEngine(mode.id))}><span className="analysis-mode-icon"><Icon size={19} /></span><span className="analysis-mode-copy"><strong>{mode.title}</strong><small>{mode.description}</small><em>{mode.size}</em><EngineQualityInline engine={mode.id} quality={runtime.quality} t={t} /></span><span className={`status-dot ${mode.installed ? "on" : "off"}`} /></button>; })}
    </div>
    <AnalysisQualityPanel quality={runtime.quality} signalInstalled={Boolean(signal.installed)} semanticInstalled={Boolean(semantic.installed)} pending={pending} onRefresh={() => run("analysis-quality", actions.refreshAnalysisQuality)} t={t} />
    {engine === "signals" && <div className="analysis-detail"><div className="feature-status"><span className={`status-dot ${signal.installed && !signal.updateAvailable ? "on" : "off"}`} />{signal.installed ? signal.updateAvailable ? text(t.settings.smartOutdated, { version: signal.version || "1.0" }) : text(t.settings.smartInstalled, { version: signal.version || "1.1", size: t.settings.analysisSignalsSize }) : t.settings.smartNotInstalled}{signal.running && <em>{t.settings.smartRunning}</em>}</div><div className="feature-actions">{(!signal.installed || signal.updateAvailable) && <button className="secondary-button" disabled={Boolean(pending)} onClick={() => run("smart-download", actions.downloadSmartModel)}><DownloadSimple size={17} /> {signal.updateAvailable ? t.settings.smartUpdate : t.settings.smartDownload}</button>}{!signal.installed && <button className="secondary-button" disabled={Boolean(pending)} onClick={() => run("smart-file", actions.installSmartModel)}><FolderOpen size={17} /> {t.settings.smartFile}</button>}{signal.installed && <button className="secondary-button" disabled={Boolean(pending) || signal.running} onClick={() => run("smart-run", actions.runSelectedAnalysis)}><Sparkle size={17} /> {t.settings.smartRun}</button>}{signal.installed && <button className="text-button" disabled={Boolean(pending)} onClick={() => run("smart-remove", actions.removeSmartModel)}>{t.settings.smartRemove}</button>}</div><p>{t.settings.smartPrivacy}</p></div>}
    {engine === "semantic" && <div className="analysis-detail"><div className="feature-status"><span className={`status-dot ${semantic.installed ? "on" : "off"}`} />{semantic.installed ? text(t.settings.semanticInstalled, { version: semantic.version || "1.0", size: semanticSize }) : text(t.settings.semanticNotInstalled, { size: semanticSize })}{(semantic.downloading || semantic.running) && <em>{semantic.downloading ? t.settings.semanticDownloading : t.settings.smartRunning}</em>}</div>{(semantic.downloading || semantic.running) && <div className="analysis-progress" aria-label={t.settings.semanticProgress}><span style={{ width: `${Math.max(2, Number(semantic.progress || 0))}%` }} /></div>}<div className="feature-actions">{!semantic.installed && <button className="secondary-button" disabled={Boolean(pending) || semantic.downloading} onClick={() => run("semantic-download", actions.downloadSemanticModel)}><DownloadSimple size={17} /> {t.settings.semanticDownload}</button>}{semantic.installed && <button className="secondary-button" disabled={Boolean(pending) || semantic.running} onClick={() => run("semantic-run", actions.runSelectedAnalysis)}><Sparkle size={17} /> {t.settings.smartRun}</button>}{semantic.installed && <button className="text-button" disabled={Boolean(pending) || semantic.running} onClick={() => run("semantic-remove", actions.removeSemanticModel)}>{t.settings.semanticRemove}</button>}</div>{semantic.error && <small className="analysis-error">{semantic.error}</small>}<p>{t.settings.semanticPrivacy}</p></div>}
    {engine === "builtin" && <p className="analysis-footnote">{t.settings.analysisBuiltinPrivacy}</p>}
    {lastResult.status && lastResult.status !== "never" && <div className="analysis-result"><CheckCircle size={18} /><span><strong>{t.settings.analysisLastResult}</strong><small>{text(t.settings.analysisResultMetrics, { candidates: lastResult.candidates || 0, refined: lastResult.refined || 0, changed: lastResult.changed || 0 })}</small>{engine === "semantic" && Number(lastResult.candidates || 0) > 0 && <em>{text(t.settings.semanticLastCoverage, { percent: Math.round((Number(lastResult.refined || 0) / Number(lastResult.candidates)) * 100) })}</em>}</span></div>}
    <div className="analysis-tour-link"><span><strong>{t.quickTour.replay}</strong><small>{t.quickTour.steps[4].hint}</small></span><button className="secondary-button" disabled={Boolean(pending)} onClick={onStartTour}><Compass size={17} />{t.quickTour.replay}</button></div>
  </div>;
}

function BrowserCompanionSettings({ state, actions, pending, run, isDesktop, t }) {
  const runtime = state.runtime?.browserCompanion || {};
  const supported = Boolean(state.runtime?.capabilities?.browserCompanion);
  return <div className="feature-settings"><div className="feature-heading"><PuzzlePiece size={23} /><div><strong>{t.settings.browserTitle}</strong><span>{supported ? t.settings.browserText : t.settings.browserUnavailable}</span></div><SettingSwitch checked={Boolean(state.settings.browserCompanionEnabled)} disabled={Boolean(pending) || !supported} label={t.settings.browserTitle} onChange={(enabled) => run("browser-enabled", () => actions.setSetting("browserCompanionEnabled", enabled))} /></div>{supported && <><div className="feature-status"><span className={`status-dot ${runtime.lastContextAt ? "on" : "off"}`} />{runtime.lastContextAt ? t.settings.browserConnected : runtime.running ? t.settings.browserWaiting : t.settings.browserStopped}</div><div className="feature-actions">{isDesktop && <button className="secondary-button" disabled={Boolean(pending)} onClick={() => run("browser-host", actions.installBrowserHost)}><PuzzlePiece size={17} /> {t.settings.browserInstallHost}</button>} {isDesktop && <button className="secondary-button" disabled={Boolean(pending)} onClick={() => run("browser-folder", actions.revealBrowserExtension)}><FolderOpen size={17} /> {t.settings.browserOpenFolder}</button>}</div><p>{t.settings.browserPrivacy}</p></>}</div>;
}

function DiagnosticsSettings({ diagnostics, actions, pending, run, t }) {
  const checks = diagnostics?.checks || [];
  return <div className="diagnostics-settings"><div className="diagnostics-heading"><div><strong>{t.settings.diagnosticsTitle}</strong><p>{t.settings.diagnosticsText}</p></div><button className="secondary-button" disabled={Boolean(pending)} onClick={() => run("diagnostics", actions.runDiagnostics)}><ArrowClockwise size={17} /> {t.settings.diagnosticsRun}</button></div>{checks.length > 0 && <div className="diagnostic-list">{checks.map((check) => { const Icon = check.status === "pass" ? CheckCircle : check.status === "fail" ? XCircle : Info; return <div className={check.status} key={check.id}><Icon size={18} /><span><strong>{t.settings.diagnosticChecks[check.id] || check.id}</strong><small>{t.settings.diagnosticStatuses[check.status] || check.status}</small></span></div>; })}</div>}</div>;
}

function DataPortability({ actions, pending, run, t }) {
  const [mode, setMode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [result, setResult] = useState("");
  const submit = async () => {
    if (passphrase.length < 8) return;
    let value = "";
    const ok = await run(mode, async () => { value = mode === "backup" ? await actions.createBackup(passphrase) : await actions.restoreBackup(passphrase); });
    if (!ok) return;
    setPassphrase(""); setMode(""); if (value) setResult(value);
  };
  const exportFile = async (format) => { let value = ""; const ok = await run(`export-${format}`, async () => { value = await actions.exportData(format); }); if (ok && value) setResult(value); };
  return <div className="data-portability"><div className="portability-actions"><button className="secondary-button" disabled={Boolean(pending)} onClick={() => exportFile("json")}><UploadSimple size={17} /> JSON</button><button className="secondary-button" disabled={Boolean(pending)} onClick={() => exportFile("csv")}><FileCsv size={17} /> CSV</button><button className="secondary-button" disabled={Boolean(pending)} onClick={() => setMode("backup")}><LockKey size={17} /> {t.settings.backup}</button><button className="secondary-button" disabled={Boolean(pending)} onClick={() => setMode("restore")}><ArrowCounterClockwise size={17} /> {t.settings.restore}</button></div><p>{t.settings.backupText}</p>{mode && <div className="passphrase-panel"><Key size={20} /><div><strong>{mode === "backup" ? t.settings.backupTitle : t.settings.restoreTitle}</strong><input autoFocus type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder={t.settings.passphrase} minLength={8} maxLength={512} /><small>{t.settings.passphraseText}</small></div><button className="primary-update-button" onClick={submit} disabled={passphrase.length < 8 || Boolean(pending)}>{mode === "backup" ? t.settings.backup : t.settings.restore}</button><button className="icon-button" onClick={() => { setMode(""); setPassphrase(""); }} aria-label={t.common.cancel}><X size={17} /></button></div>}{result && <div className="portability-result"><Check size={17} /> {text(t.settings.fileReady, { path: result })}</div>}</div>;
}

function SettingsPage({ state, actions, isDesktop, language, focusSection, t, onStartTour }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState("");
  const [actionError, setActionError] = useState("");
  const [rulePreview, setRulePreview] = useState(null);
  useEffect(() => {
    if (!focusSection) return undefined;
    let pulseTimer;
    const timer = setTimeout(() => {
      const target = document.getElementById(focusSection === "smart" ? "smart-analysis-settings" : "review-settings");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("settings-focus-pulse");
      pulseTimer = setTimeout(() => target?.classList.remove("settings-focus-pulse"), 1_500);
    }, 80);
    return () => { clearTimeout(timer); clearTimeout(pulseTimer); };
  }, [focusSection]);
  const run = async (key, action) => {
    setPending(key);
    setActionError("");
    try {
      await action();
      return true;
    } catch {
      setActionError(t.settings.actionFailed);
      return false;
    } finally {
      setPending("");
    }
  };
  const proposeRules = async (rules) => {
    setPending("rule-preview");
    setActionError("");
    try {
      const preview = await actions.previewIntentRules(rules);
      setRulePreview({ ...preview, nextRules: rules });
    } catch { setActionError(t.settings.actionFailed); }
    finally { setPending(""); }
  };
  const confirmRules = async () => {
    if (!rulePreview) return;
    await run("intent-rules", async () => { await actions.setIntentRules(rulePreview.nextRules); setRulePreview(null); });
  };
  const classifyReview = (activity, intent) => {
    if (intent === activity.intent) return;
    const app = String(activity.app || "").trim();
    const title = String(activity.title || "").trim();
    const contextSensitive = CONTEXT_SENSITIVE_APPS.test(app);
    const scope = contextSensitive ? "context" : "application";
    const rules = (state.settings.intentRules || []).filter((rule) => !(rule.scope === scope && String(rule.app || "").toLowerCase() === app.toLowerCase() && (scope !== "context" || String(rule.title || "").toLowerCase() === title.toLowerCase())));
    void proposeRules([...rules, { id: `${Date.now()}`, scope, app, title: scope === "context" ? title : undefined, match: scope === "context" ? title : app, intent }]);
  };
  const runtime = state.runtime || {};
  const macInstall = runtime.macInstall || {};
  const accessibilityText = macInstall.issue
    ? text(t.settings.accessibilityInstallIssues[macInstall.issue] || t.settings.accessibilityInstallIssues["unknown-location"], { name: macInstall.appName || "Daytrace", path: macInstall.bundlePath || "—" })
    : runtime.accessibilityMainTrusted ? t.settings.accessibilityWrongTarget : t.settings.accessibilityText;
  const statusLabel = t.settings.statuses[runtime.trackerStatus] || t.settings.statuses.stopped;
  const setting = (key, title, description) => (
    <div className="setting-row" key={key}>
      <div><strong>{title}</strong><span>{description}</span></div>
      <SettingSwitch checked={Boolean(state.settings[key])} disabled={Boolean(pending)} label={title} onChange={(enabled) => run(key, () => actions.setSetting(key, enabled))} />
    </div>
  );
  return (
    <div className="subpage narrow-page">
      <div className="subpage-heading"><Gear size={29} /><div><h2>{t.settings.title}</h2><p>{t.settings.subtitle}</p></div></div>
      <div className={`runtime-card ${runtime.trackerStatus || "stopped"}`}>
        <span className="status-dot on" />
        <div><strong>{statusLabel}</strong><small>{t.settings.runtimeText}</small></div>
        {runtime.platform && <em>{runtime.platform === "darwin" ? "macOS" : runtime.platform === "win32" ? "Windows" : runtime.platform}</em>}
      </div>
      {actionError && <div className="settings-action-error" role="alert"><WarningCircle size={20} /><span>{actionError}</span></div>}
      {runtime.platform === "darwin" && !runtime.accessibilityTrusted && (
        <div className="permission-card">
          <ShieldCheck size={22} />
          <div className="permission-copy"><strong>{t.settings.accessibility}</strong><span>{accessibilityText}</span></div>
          <div className="permission-actions">
            <button onClick={() => run("accessibility", actions.requestAccessibility)} disabled={Boolean(pending)}>{t.settings.grantAccess}</button>
            <button onClick={() => run("accessibility-check", actions.refreshAccessibility)} disabled={Boolean(pending)}>{t.onboarding.permissionCheck}</button>
            <button onClick={actions.relaunch}>{t.settings.restartAfterAccess}</button>
          </div>
        </div>
      )}
      <div className="settings-section appearance-section">
        <h3>{t.settings.appearance}</h3>
        <ThemeSelector theme={state.settings.theme} disabled={Boolean(pending)} onChange={(next) => run("theme", () => actions.setTheme(next))} t={t} />
      </div>
      <div className="settings-section">
        <h3>{t.settings.language}</h3>
        <LanguageSelector language={language} onChange={(next) => run("language", () => actions.setLanguage(next))} t={t} />
      </div>
      <div className="settings-section">
        <h3>{t.settings.updates}</h3>
        <UpdateSettings runtime={runtime} actions={actions} pending={pending} run={run} t={t} />
      </div>
      <div className="settings-section">
        <h3>{t.settings.activity}</h3>
        <div className="setting-row">
          <div><strong>{t.settings.record}</strong><span>{t.settings.recordText}</span></div>
          <SettingSwitch checked={state.settings.trackingEnabled} disabled={Boolean(pending)} label={t.settings.record} onChange={(enabled) => run("tracking", () => actions.setTracking(enabled))} />
        </div>
        {setting("collectWindowTitles", t.settings.titles, t.settings.titlesText)}
        {setting("collectInputCounts", t.settings.inputs, t.settings.inputsText)}
        {runtime.capabilities?.browserTabCount !== false && setting("collectBrowserTabCount", t.settings.tabs, t.settings.tabsText)}
        <div className="setting-row">
          <div><strong>{t.settings.private}</strong><span>{state.settings.excludePrivateWindows ? t.settings.privateText : t.settings.privateWarning}</span></div>
          <SettingSwitch checked={state.settings.excludePrivateWindows} disabled={Boolean(pending)} label={t.settings.private} onChange={(enabled) => run("private", () => actions.setSetting("excludePrivateWindows", enabled))} />
        </div>
      </div>
      <div className="settings-section">
        <h3>{t.settings.analysis}</h3>
        <IntentRuleEditor rules={state.settings.intentRules || []} onPropose={proposeRules} t={t} />
        {(state.settings.intentRulesUndo || []).length > 0 && <button className="secondary-button rule-undo" disabled={Boolean(pending)} onClick={() => run("undo-rules", actions.undoIntentRules)}><ArrowCounterClockwise size={17} /> {t.intent.undoLastRuleChange}</button>}
        <ReviewQueue items={state.reviewQueue || []} onClassify={classifyReview} learningExplained={Boolean(state.settings.reviewLearningExplained)} onAcknowledge={() => actions.acknowledgeReviewGuidance("understood")} t={t} />
      </div>
      <div className="settings-section smart-analysis-section" id="smart-analysis-settings" data-tour="analysis">
        <h3>{t.settings.smartAnalysis}</h3>
        <SmartAnalysisSettings state={state} actions={actions} pending={pending} run={run} t={t} onStartTour={onStartTour} />
      </div>
      <div className="settings-section browser-companion-section">
        <h3>{t.settings.browserCompanion}</h3>
        <BrowserCompanionSettings state={state} actions={actions} pending={pending} run={run} isDesktop={isDesktop} t={t} />
      </div>
      <div className="settings-section system-section">
        <h3>{t.settings.system}</h3>
        <div className="setting-row">
          <div><strong>{t.settings.autostart}</strong><span>{runtime.autoStartSupported ? t.settings.autostartText : t.settings.autostartUnavailable}</span></div>
          <SettingSwitch checked={Boolean(runtime.autoStartEnabled)} disabled={Boolean(pending) || !runtime.autoStartSupported} label={t.settings.autostart} onChange={(enabled) => run("autostart", () => actions.setAutoStart(enabled))} />
        </div>
        <DiagnosticsSettings diagnostics={runtime.diagnostics} actions={actions} pending={pending} run={run} t={t} />
      </div>
      <div className="settings-section data-section">
        <h3>{t.settings.data}</h3>
        <RetentionSettings hours={state.settings.retentionHours} actions={actions} pending={pending} run={run} t={t} />
        <div className="data-facts">
          <div><Database size={21} /><span><strong>{text(t.settings.events, { count: state.eventCount })}</strong><small>{text(t.settings.autoDelete, { period: formatRetention(state.settings.retentionHours, t) })}</small></span></div>
          <div><FolderOpen size={21} /><span><strong>{t.settings.deviceOnly}</strong><small>{state.dataPath}</small></span></div>
        </div>
        <DataPortability actions={actions} pending={pending} run={run} t={t} />
        {isDesktop && <button className="secondary-button" onClick={() => run("reveal-data", actions.revealData)}><FolderOpen size={18} /> {t.settings.openData}</button>}
      </div>
      <div className="danger-zone">
        <h3>{t.settings.clear}</h3>
        <p>{t.settings.clearText}</p>
        {confirming
          ? <div className="confirm-row"><button disabled={Boolean(pending)} onClick={() => run("delete-all", async () => { await actions.deleteAll(); setConfirming(false); })}><Trash size={18} /> {t.settings.deleteAll}</button><button className="cancel" onClick={() => setConfirming(false)}>{t.common.cancel}</button></div>
          : <button onClick={() => setConfirming(true)}><Trash size={18} /> {t.settings.clearJournal}</button>}
      </div>
      <RulePreviewDialog preview={rulePreview} busy={pending === "intent-rules"} onConfirm={confirmRules} onCancel={() => setRulePreview(null)} language={language} t={t} />
    </div>
  );
}

export function App() {
  const { state, actions, isDesktop, language, hydrated } = useDaytrace();
  const [page, setPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const previewPage = params.get("capture") === "desktop" ? params.get("page") : "";
    return NAVIGATION.some((item) => item.id === previewPage) ? previewPage : "history";
  });
  const [settingsFocus, setSettingsFocus] = useState("");
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(Date.now()));
  const [tourOpen, setTourOpen] = useState(() => new URLSearchParams(window.location.search).get("tour") === "1");
  const autoTourStarted = useRef(false);
  const t = translations[language];
  const today = startOfLocalDay(Date.now());
  const displayDay = page === "history" ? selectedDay : today;
  const date = useMemo(() => formatDay(displayDay, language), [displayDay, language]);
  const isToday = displayDay === today;
  const firstRetainedDay = startOfLocalDay(state.retentionCutoff);
  const navigate = (nextPage, focus = "") => { setPage(nextPage); setSettingsFocus(nextPage === "settings" ? focus : ""); };
  const theme = normalizeTheme(state.settings.theme);
  useEffect(() => {
    applyDocumentTheme(theme);
    return observeSystemTheme(theme);
  }, [theme]);
  useEffect(() => { document.documentElement.lang = language; document.title = "Daytrace"; }, [language]);
  useEffect(() => { if (selectedDay < firstRetainedDay) setSelectedDay(firstRetainedDay); }, [firstRetainedDay, selectedDay]);
  useEffect(() => {
    if (!hydrated || !state.settings.onboardingComplete || state.settings.quickTourComplete || autoTourStarted.current) return;
    autoTourStarted.current = true;
    setTourOpen(true);
    // Mark the tour as shown when it opens. A crash or forced shutdown midway
    // must not turn it into a permanent startup screen.
    void actions.completeQuickTour();
  }, [hydrated, state.settings.onboardingComplete, state.settings.quickTourComplete]);
  if (!hydrated) return <AppLoading language={language} />;
  if (!state.settings.onboardingComplete) return <Onboarding state={state} actions={actions} language={language} />;
  const showMacPermission = isDesktop && state.runtime?.platform === "darwin" && !state.runtime.accessibilityTrusted && !state.settings.accessibilityOnboardingDismissed;
  const startTour = () => { setTourOpen(true); setPage("history"); setSettingsFocus(""); };
  return <><div className="app-shell"><Sidebar page={page} setPage={navigate} state={state} actions={actions} language={language} t={t} onStartTour={startTour} /><div className="app-main"><header className="date-header"><div className="date-copy" key={`${displayDay}-${language}`}><h1>{isToday ? `${t.common.today}, ${date.date}` : date.date}</h1><span>{date.weekday}</span></div>{page === "history" && <DateNavigation selectedDay={selectedDay} minDay={firstRetainedDay} maxDay={today} availableDays={state.availableDays || []} language={language} onSelect={setSelectedDay} t={t} />}</header>{page === "history" && <HistoryPage key={selectedDay} state={state} actions={actions} setPage={navigate} selectedDay={selectedDay} language={language} t={t} />}{page === "ask" && <AskPage actions={actions} setPage={navigate} language={language} retentionHours={state.settings.retentionHours} t={t} />}{page === "skills" && <SkillsPage state={state} actions={actions} t={t} />}{page === "settings" && <SettingsPage state={state} actions={actions} isDesktop={isDesktop} language={language} focusSection={settingsFocus} t={t} onStartTour={startTour} />}{page === "exclusions" && <ExclusionsPage state={state} actions={actions} t={t} />}</div></div>{showMacPermission && !tourOpen && <MacPermissionOnboarding actions={actions} onContinue={actions.dismissAccessibilityOnboarding} runtime={state.runtime} t={t} />}{!tourOpen && <ReviewCoach state={state} language={language} t={t} onReview={async () => { await actions.acknowledgeReviewGuidance("review"); navigate("settings", "review"); }} onModel={async () => { await actions.acknowledgeReviewGuidance("model"); navigate("settings", "smart"); }} onLater={() => actions.acknowledgeReviewGuidance("later")} />}{tourOpen && <QuickTour t={t} onNavigate={navigate} onClose={() => setTourOpen(false)} />}</>;
}
