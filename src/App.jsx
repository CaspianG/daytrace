import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowRight, ArrowsLeftRight, Brain, Browsers, CalendarBlank, CaretLeft, CaretRight, ChartBar, Check, Clock, Compass, Database, DownloadSimple, EyeSlash, FolderOpen, Gear, Globe, LockKey, MagnifyingGlass, Pause, Play, Plus, ShieldCheck, Sparkle, Timer, Trash, X } from "@phosphor-icons/react";
import { SiFigma, SiGooglechrome, SiGmail, SiTelegram } from "react-icons/si";
import { FaEdge } from "react-icons/fa6";
import { VscVscode } from "react-icons/vsc";
import sageBranch from "./assets/sage-branch.png";
import { formatDay, formatDuration, formatTime, normalizeLanguage, text, translations } from "./i18n.js";

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
  en: { work: "Work", learning: "Learning", personal: "Personal", entertainment: "Entertainment", unknown: "Unknown purpose", mixed: "Mixed purpose" },
  ru: { work: "Работа", learning: "Обучение", personal: "Личное", entertainment: "Развлечения", unknown: "Цель не определена", mixed: "Смешанная цель" },
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

function demoState(language = demoLanguage(), onboardingComplete = true) {
  const lang = normalizeLanguage(language);
  const t = translations[lang];
  const updatePreview = new URLSearchParams(window.location.search).get("update") === "available";
  const apps = ["Visual Studio Code", "Google Chrome", "Telegram Desktop", "Visual Studio Code", "Visual Studio Code", "Google Chrome", "Figma", "Telegram Desktop", "Gmail"];
  const focuses = ["development", "planning", "communication", "development", "development", "research", "design", "communication", "communication"];
  const intents = ["work", "work", "work", "work", "work", "learning", "work", "personal", "work"];
  const times = [[9, 5, 9, 30], [9, 30, 9, 45], [9, 45, 10, 0], [10, 0, 10, 15], [10, 15, 10, 45], [10, 45, 11, 15], [11, 15, 11, 30], [11, 30, 11, 50], [11, 50, 12, 5]];
  const activities = times.map(([sh, sm, eh, em], index) => ({
    start: startOfToday(sh, sm), end: startOfToday(eh, em), durationMs: startOfToday(eh, em) - startOfToday(sh, sm),
    app: apps[index], title: t.demo.titles[index], focus: focuses[index], focusLabel: FOCUS_LABELS[lang][focuses[index]], intent: intents[index], intentLabel: INTENT_LABELS[lang][intents[index]], intentConfidence: index === 7 ? "high" : "medium", context: apps[index].includes("Chrome") ? "browser" : apps[index].includes("Telegram") ? "messaging" : "other",
    tabCount: apps[index].includes("Chrome") ? (index === 1 ? 7 : 11) : 0, clicks: 4, inputs: 18,
  }));
  const makeSession = (id, from, to, focus, intent) => ({ id, start: activities[from].start, end: activities[to].end, durationMs: activities[to].end - activities[from].start, focus, label: FOCUS_LABELS[lang][focus], intent, intentLabel: INTENT_LABELS[lang][intent], activities: activities.slice(from, to + 1) });
  return {
    settings: { trackingEnabled: true, retentionHours: 48, excludePrivateWindows: true, collectWindowTitles: true, collectInputCounts: true, collectBrowserTabCount: true, autoStartEnabled: false, excludedApps: ["1Password", "Bitwarden", "KeePass"], intentRules: [{ id: "demo-friends", match: lang === "ru" ? "Друзья" : "Friends", intent: "personal" }], language: lang, onboardingComplete },
    runtime: { platform: updatePreview ? "win32" : "browser", trackerStatus: "running", accessibilityTrusted: true, autoStartSupported: false, autoStartEnabled: false, update: { status: updatePreview ? "available" : "up-to-date", currentVersion: "0.4.1", latestVersion: updatePreview ? "0.4.2" : "0.4.1", checkedAt: Date.now(), progress: 0 } },
    sessions: [
      makeSession("demo-1", 0, 2, "mixed", "work"), makeSession("demo-2", 3, 6, "mixed", "work"), makeSession("demo-3", 7, 8, "communication", "mixed"),
      { id: "demo-break", start: startOfToday(12, 5), end: startOfToday(12, 20), durationMs: 15 * 60_000, focus: "break", label: FOCUS_LABELS[lang].break, intent: "unknown", intentLabel: INTENT_LABELS[lang].unknown, activities: [] },
    ],
    eventCount: 128, retentionCutoff: Date.now() - 48 * 60 * 60_000, dataPath: t.demo.dataPath,
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

function daySessions(sessions, selectedDay) {
  const start = startOfLocalDay(selectedDay);
  const end = start + 24 * 60 * 60_000;
  return sessions
    .filter((session) => session.end > start && session.start < end)
    .map((session) => ({
      ...session,
      activities: [...session.activities]
        .filter((activity) => activity.end > start && activity.start < end)
        .sort((a, b) => b.end - a.end),
    }))
    .sort((a, b) => b.end - a.end);
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
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, durationMs: 0 }));
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
      hours[new Date(cursor).getHours()].durationMs += sliceEnd - cursor;
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
    hours: hours.slice(firstHour, lastHour + 1),
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
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (!window.daytrace) return undefined;
    setIsDesktop(true);
    window.daytrace.getState().then(setState);
    return window.daytrace.onStateChanged(setState);
  }, []);
  const language = normalizeLanguage(state.settings.language);
  const actions = {
    async setTracking(enabled) { if (window.daytrace) setState(await window.daytrace.setTracking(enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, trackingEnabled: enabled } })); },
    async setSetting(key, enabled) { if (window.daytrace) setState(await window.daytrace.setSetting(key, enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, [key]: enabled } })); },
    async setAutoStart(enabled) { if (window.daytrace) setState(await window.daytrace.setAutoStart(enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, autoStartEnabled: enabled }, runtime: { ...current.runtime, autoStartEnabled: enabled } })); },
    async requestAccessibility() { if (window.daytrace) setState(await window.daytrace.requestAccessibility()); },
    async setExclusions(apps) { if (window.daytrace) setState(await window.daytrace.setExclusions(apps)); else setState((current) => ({ ...current, settings: { ...current.settings, excludedApps: apps } })); },
    async setIntentRules(rules) { if (window.daytrace) setState(await window.daytrace.setIntentRules(rules)); else setState((current) => ({ ...current, settings: { ...current.settings, intentRules: rules } })); },
    async setLanguage(nextLanguage) { const next = normalizeLanguage(nextLanguage); if (window.daytrace) setState(await window.daytrace.setLanguage(next)); else setState(demoState(next, true)); },
    async completeOnboarding(nextLanguage) { const next = normalizeLanguage(nextLanguage); if (window.daytrace) setState(await window.daytrace.completeOnboarding(next)); else setState(demoState(next, true)); },
    async deleteAll() { if (window.daytrace) setState(await window.daytrace.deleteAll()); else setState((current) => ({ ...current, sessions: [], eventCount: 0 })); },
    async deleteSession(session) { if (window.daytrace) setState(await window.daytrace.deleteSession(session.start, session.end)); else setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) })); },
    async ask(question) {
      if (window.daytrace) return window.daytrace.ask(question);
      const t = translations[language];
      const sources = state.sessions.map((session) => ({ ...session, label: session.intentLabel, duration: formatDuration(session.durationMs, language), apps: [...new Set(session.activities.map((item) => item.app))] }));
      return { answer: text(t.summary.default, { intent: INTENT_LABELS[language].work.toLocaleLowerCase(t.locale), app: "Visual Studio Code" }), interpretation: t.ask.demoInterpretation, points: state.sessions.filter((session) => session.activities.length).map((session) => ({ label: session.intentLabel, duration: formatDuration(session.durationMs, language) })), sources };
    },
    async exportSkill(skill) { if (window.daytrace) return window.daytrace.exportSkill(skill); return text(translations[language].skills.draft, { title: skill.title }); },
    revealData() { return window.daytrace?.revealData(); },
    async checkUpdates() { if (window.daytrace) setState(await window.daytrace.checkUpdates()); else setState((current) => ({ ...current, runtime: { ...current.runtime, update: { ...current.runtime.update, status: "up-to-date", checkedAt: Date.now() } } })); },
    async installUpdate() { if (window.daytrace) setState(await window.daytrace.installUpdate()); },
  };
  return { state, actions, isDesktop, language };
}

function Onboarding({ language, onComplete }) {
  const [selected, setSelected] = useState(normalizeLanguage(language));
  const t = translations[selected];
  return <main className="onboarding-shell">
    <section className="onboarding-card">
      <div className="onboarding-logo"><Compass size={36} weight="fill" /></div>
      <span className="eyebrow">{t.onboarding.eyebrow}</span>
      <h1>{t.onboarding.title}</h1>
      <p className="onboarding-subtitle">{t.onboarding.subtitle}</p>
      <div className="language-grid" role="radiogroup" aria-label={t.onboarding.title}>
        <button className={selected === "en" ? "selected" : ""} onClick={() => setSelected("en")} role="radio" aria-checked={selected === "en"}><span>EN</span><div><strong>{t.onboarding.english}</strong><small>{t.onboarding.englishDetail}</small></div>{selected === "en" && <Check size={20} weight="bold" />}</button>
        <button className={selected === "ru" ? "selected" : ""} onClick={() => setSelected("ru")} role="radio" aria-checked={selected === "ru"}><span>RU</span><div><strong>{t.onboarding.russian}</strong><small>{t.onboarding.russianDetail}</small></div>{selected === "ru" && <Check size={20} weight="bold" />}</button>
      </div>
      <div className="onboarding-privacy"><LockKey size={25} /><div><strong>{t.onboarding.privacyTitle}</strong><span>{t.onboarding.privacyText}</span></div></div>
      <button className="onboarding-continue" onClick={() => onComplete(selected)}>{t.onboarding.continue}<ArrowRight size={19} /></button>
    </section>
  </main>;
}

function Sidebar({ page, setPage, state, actions, language, t }) {
  const expires = new Date(Date.now() + state.settings.retentionHours * 60 * 60_000);
  const update = state.runtime?.update || {};
  const updateAvailable = update.status === "available";
  return <aside className="sidebar">
    <div className="brand-mark"><Compass size={29} weight="fill" /></div>
    <nav className="main-nav" aria-label={language === "ru" ? "Разделы" : "Sections"}>{NAVIGATION.map(({ id, icon: Icon, separated }) => <button key={id} className={`${page === id ? "active" : ""} ${separated ? "separated" : ""}`} onClick={() => setPage(id)}><Icon size={25} weight={page === id ? "fill" : "regular"} /><span>{t.nav[id]}</span></button>)}</nav>
    <div className="sidebar-status"><div className="status-row"><span className={`status-dot ${state.settings.trackingEnabled ? "on" : "off"}`} /><span>{state.settings.trackingEnabled ? t.common.local : t.status.paused}</span></div><div className="status-row muted"><Database size={18} /><span>{text(t.status.retention, { hours: state.settings.retentionHours })}</span></div><div className="expiry">{text(t.status.deletion, { time: formatTime(expires, language) })}</div></div>
    {updateAvailable && <button className="sidebar-update-button" onClick={actions.installUpdate} title={text(t.status.update, { version: update.latestVersion })}><DownloadSimple size={21} weight="bold" /><span>{text(t.status.update, { version: update.latestVersion })}</span></button>}
    <button className={`tracking-button ${state.settings.trackingEnabled ? "pause" : "resume"}`} onClick={() => actions.setTracking(!state.settings.trackingEnabled)}>{state.settings.trackingEnabled ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}{state.settings.trackingEnabled ? t.status.pause : t.status.resume}</button>
  </aside>;
}

function QuestionBar({ onAsk, t, initial = "" }) {
  const [question, setQuestion] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQuestion(initial); }, [initial]);
  async function submit(event) { event?.preventDefault(); const value = question.trim() || t.question.fallback; setBusy(true); try { await onAsk(value); } finally { setBusy(false); } }
  return <form className="question-bar" onSubmit={submit}><MagnifyingGlass size={26} /><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t.question.placeholder} aria-label={t.question.label} /><button type="submit" disabled={busy}>{busy ? t.question.searching : t.question.ask}</button></form>;
}

function OverviewMetrics({ stats, language, t }) {
  const cards = [
    { icon: Timer, value: stats.activeMs ? formatDuration(stats.activeMs, language) : "—", label: t.overview.activeTime, hint: t.overview.activeTimeHint },
    { icon: ChartBar, value: stats.appCount || "—", label: t.overview.apps, hint: t.overview.appsHint },
    { icon: ArrowsLeftRight, value: stats.switchCount || "—", label: t.overview.switches, hint: t.overview.switchesHint },
    { icon: Browsers, value: stats.maxTabs || "—", label: t.overview.tabs, hint: stats.maxTabs ? t.overview.tabsHint : t.overview.noTabs },
  ];
  return <section className="overview-metrics">{cards.map(({ icon: Icon, value, label, hint }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={19} /></div><strong>{value}</strong><span>{label}</span><small>{hint}</small></article>)}</section>;
}

function RankedBars({ title, subtitle, items, max, renderLabel, renderValue }) {
  return <section className="chart-card"><header><div><h3>{title}</h3><p>{subtitle}</p></div></header><div className="ranked-bars">{items.slice(0, 5).map((item) => <div className="ranked-row" key={renderLabel(item)}><div className="ranked-label"><span>{renderLabel(item)}</span><strong>{renderValue(item)}</strong></div><div className="ranked-track"><span style={{ width: `${Math.max(4, (item.durationMs / Math.max(1, max)) * 100)}%` }} /></div></div>)}</div></section>;
}

function ActivityRhythm({ stats, t }) {
  const max = Math.max(1, ...stats.hours.map((item) => item.durationMs));
  return <section className="chart-card rhythm-card"><header><div><h3>{t.overview.rhythmTitle}</h3><p>{t.overview.rhythmSubtitle}</p></div></header><div className="rhythm-chart">{stats.hours.map((item) => <div className="rhythm-hour" key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00`}><div><span style={{ height: `${Math.max(item.durationMs ? 8 : 2, (item.durationMs / max) * 100)}%` }} /></div><small>{String(item.hour).padStart(2, "0")}</small></div>)}</div></section>;
}

function DayOverview({ stats, language, t }) {
  const intentMax = Math.max(1, ...stats.intentTotals.map((item) => item.durationMs));
  const appMax = Math.max(1, ...stats.appTotals.map((item) => item.durationMs));
  return <div className="day-overview"><OverviewMetrics stats={stats} language={language} t={t} /><div className="overview-charts"><RankedBars title={t.overview.intentTitle} subtitle={t.overview.intentSubtitle} items={stats.intentTotals} max={intentMax} renderLabel={(item) => item.label} renderValue={(item) => formatDuration(item.durationMs, language)} /><RankedBars title={t.overview.appsTitle} subtitle={t.overview.appsSubtitle} items={stats.appTotals} max={appMax} renderLabel={(item) => item.app} renderValue={(item) => formatDuration(item.durationMs, language)} /></div><ActivityRhythm stats={stats} t={t} /></div>;
}

function IntentPicker({ activity, onClassify, t }) {
  return <label className={`intent-badge ${activity.intentConfidence || "low"}`} title={`${t.intent.classify}: ${t.intent.reasons[activity.intentReason] || t.intent.reasons.insufficient}`}><Sparkle size={13} /><select value={activity.intent || "unknown"} onChange={(event) => onClassify(activity, event.target.value)} aria-label={t.intent.classify}>{Object.entries(t.intent.labels).filter(([key]) => key !== "mixed").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}

function Session({ session, onDelete, onClassify, language, t }) {
  const isBreak = session.focus === "break";
  return <section className={`timeline-session ${isBreak ? "break-session" : ""}`}><span className="timeline-node" /><header className="session-header"><div className="session-chip"><strong>{formatTime(session.start, language)} – {formatTime(session.end, language)}</strong>{!isBreak && <><span>•</span><span>{t.session.intent}: {(session.intentLabel || t.intent.unknown).toLocaleLowerCase(t.locale)}</span></>}</div><span className="session-line" /><strong className="duration">{formatDuration(session.durationMs, language)}</strong><button className="icon-button delete-session" onClick={() => onDelete(session)} title={t.session.delete}><Trash size={17} /></button></header><div className="activity-list">{session.activities.map((activity, index) => <div className="activity" key={`${activity.start}-${index}`}><time>{formatTime(activity.start, language)} – {formatTime(activity.end, language)}</time><AppIcon app={activity.app} /><div className="activity-copy"><strong>{activity.app}</strong><span>{activity.title || t.common.activeWindow}</span><div className="activity-meta"><IntentPicker activity={activity} onClassify={onClassify} t={t} /><small>{activity.focusLabel || session.label}</small>{activity.tabCount > 0 && <small><Browsers size={13} /> {text(t.overview.tabsCount, { count: activity.tabCount })}</small>}{Number(activity.inputs || 0) + Number(activity.clicks || 0) > 0 && <small><ArrowsLeftRight size={13} /> {text(t.overview.inputCount, { count: Number(activity.inputs || 0) + Number(activity.clicks || 0) })}</small>}</div></div></div>)}</div></section>;
}

function Summary({ result, sessions, stats, language, t }) {
  const sessionPoints = stats.intentTotals.map((item) => ({ label: item.label, duration: formatDuration(item.durationMs, language), detail: t.summary.intentDetails[item.intent] || t.summary.grouped }));
  const points = result?.points?.length ? result.points.map((point) => ({ ...sessionPoints.find((item) => item.label === point.label), ...point })) : sessionPoints;
  const answer = result?.answer || (sessions.length ? text(t.summary.default, { intent: stats.topIntent?.label.toLocaleLowerCase(t.locale), app: stats.topApp?.app }) : t.summary.empty);
  return <aside className="summary-panel"><img className="sage-branch" src={sageBranch} alt="" /><h2>{t.summary.title}</h2><span className="summary-time">{text(t.summary.generated, { time: formatTime(Date.now(), language) })}</span><p className="summary-answer">{answer}</p><div className="summary-points">{points.slice(0, 3).map((point) => <div className="summary-point" key={point.label}><span className="summary-dot" /><div><strong>{point.label}</strong><small>{point.time ? `${point.time} (${point.duration})` : point.duration}</small>{point.detail && <p>{point.detail}</p>}</div></div>)}</div><div className="privacy-note"><strong>{t.summary.how}</strong><p>{t.summary.explanation}</p><div><LockKey size={16} /> {t.summary.private}</div><div><EyeSlash size={16} /> {t.summary.excluded}</div></div></aside>;
}

function HistoryPage({ state, actions, setPage, selectedDay, language, t }) {
  const [result, setResult] = useState(null);
  const sessions = useMemo(() => daySessions(state.sessions, selectedDay), [state.sessions, selectedDay]);
  const stats = useMemo(() => buildOverview(sessions, selectedDay), [sessions, selectedDay]);
  useEffect(() => { setResult(null); }, [language, selectedDay]);
  const classify = (activity, intent) => {
    const genericTitle = /^(active window|активное окно|telegramdesktop)$/i.test(String(activity.title || ""));
    const match = genericTitle || !activity.title ? activity.app : activity.title;
    const rules = (state.settings.intentRules || []).filter((rule) => rule.match.toLocaleLowerCase(t.locale) !== match.toLocaleLowerCase(t.locale));
    actions.setIntentRules([...rules, { id: `${Date.now()}`, match, intent }]);
  };
  return <div className="history-page"><QuestionBar t={t} onAsk={async (question) => setResult(await actions.ask(question))} /><div className="history-layout"><main className="timeline-column"><DayOverview stats={stats} language={language} t={t} /><div className="section-title timeline-title"><h2>{t.history.title}</h2><span>{t.history.newestFirst}</span></div>{sessions.length ? <div className="timeline reverse-timeline">{sessions.map((session) => <Session key={session.id} session={session} onDelete={actions.deleteSession} onClassify={classify} language={language} t={t} />)}</div> : <div className="empty-state"><Clock size={34} /><h3>{t.history.emptyTitle}</h3><p>{t.history.emptyText}</p><button onClick={() => setPage("settings")}>{t.history.checkSettings} <ArrowRight size={17} /></button></div>}</main><Summary result={result} sessions={sessions} stats={stats} language={language} t={t} /></div></div>;
}

function AskPage({ actions, setPage, language, t }) {
  const [result, setResult] = useState(null);
  useEffect(() => { setResult(null); }, [language]);
  return <div className="subpage ask-page"><div className="subpage-heading"><Brain size={29} /><div><h2>{t.ask.title}</h2><p>{t.ask.subtitle}</p></div><button className="skills-link" onClick={() => setPage("skills")}><Sparkle size={17} /> {t.ask.skills}</button></div><QuestionBar t={t} initial={t.question.fallback} onAsk={async (question) => setResult(await actions.ask(question))} /><div className="answer-surface">{result ? <><span className="eyebrow">{t.ask.localAnswer}</span>{result.interpretation && <div className="interpretation"><Brain size={16} /><span><strong>{t.ask.understood}</strong> {result.interpretation}</span></div>}<h3>{result.answer}</h3><div className="answer-sources">{result.sources.map((source) => <div key={source.id}><Clock size={18} /><span>{formatTime(source.start, language)}–{formatTime(source.end, language)}</span><strong>{source.label}</strong><small>{source.apps.join(", ")}</small></div>)}</div><p className="local-engine-note">{t.ask.engineNote}</p></> : <><span className="eyebrow">{t.ask.examples}</span><h3>{t.ask.examplesText}</h3><div className="prompt-chips">{t.ask.prompts.map((prompt) => <span key={prompt}>{prompt}</span>)}</div><p className="local-engine-note">{t.ask.engineNote}</p></>}</div></div>;
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

function IntentRuleEditor({ rules, onChange, t }) {
  const [match, setMatch] = useState("");
  const [intent, setIntent] = useState("work");
  function addRule() {
    const value = match.replace(/\s+/g, " ").trim();
    if (!value) return;
    onChange([...rules, { id: `${Date.now()}`, match: value, intent }]);
    setMatch("");
  }
  return <div className="intent-rule-editor"><p>{t.settings.analysisText}</p><div className="intent-rule-form"><input value={match} onChange={(event) => setMatch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addRule()} placeholder={t.settings.rulePlaceholder} maxLength={120} /><select value={intent} onChange={(event) => setIntent(event.target.value)} aria-label={t.settings.rulePurpose}>{Object.entries(t.intent.labels).filter(([key]) => key !== "unknown" && key !== "mixed").map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><button onClick={addRule} disabled={!match.trim()}><Plus size={17} /> {t.common.add}</button></div>{rules.length ? <div className="intent-rule-list">{rules.map((rule) => <div key={rule.id}><span><strong>{rule.match}</strong><small>{t.intent.labels[rule.intent] || t.intent.unknown}</small></span><button onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} title={t.settings.removeRule}><X size={17} /></button></div>)}</div> : <div className="rule-empty">{t.settings.ruleEmpty}</div>}</div>;
}

function SettingSwitch({ checked, disabled, label, onChange }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`setting-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>;
}

function UpdateSettings({ runtime, actions, pending, run, t }) {
  const update = runtime.update || { status: "disabled", currentVersion: "—" };
  const checking = update.status === "checking";
  const downloading = update.status === "downloading";
  const available = update.status === "available";
  const status = t.settings.updateStatuses[update.status] || t.settings.updateStatuses.idle;
  const checked = update.checkedAt ? new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(update.checkedAt)) : null;
  return <div className="update-settings"><div className="update-copy"><div><strong>{text(t.settings.currentVersion, { version: update.currentVersion || "—" })}</strong><span>{available ? text(t.settings.availableVersion, { version: update.latestVersion }) : status}</span>{checked && <small>{text(t.settings.lastChecked, { time: checked })}</small>}</div>{downloading && <div className="update-progress"><span style={{ width: `${Math.max(3, Number(update.progress || 0))}%` }} /></div>}{update.error && <small className="update-error">{t.settings.updateError}</small>}</div><div className="update-actions"><button className="secondary-button" disabled={Boolean(pending) || checking || downloading || update.status === "disabled"} onClick={() => run("check-update", actions.checkUpdates)}><ArrowClockwise size={18} className={checking ? "spin" : ""} /> {checking ? t.settings.checking : t.settings.checkUpdates}</button>{available && <button className="primary-update-button" disabled={Boolean(pending)} onClick={() => run("install-update", actions.installUpdate)}><DownloadSimple size={18} /> {runtime.platform === "darwin" ? text(t.settings.downloadMac, { version: update.latestVersion }) : text(t.settings.installUpdate, { version: update.latestVersion })}</button>}</div><p>{t.settings.updatePrivacy}</p></div>;
}

function SettingsPage({ state, actions, isDesktop, language, t }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState("");
  const run = async (key, action) => { setPending(key); try { await action(); } finally { setPending(""); } };
  const runtime = state.runtime || {};
  const statusLabel = t.settings.statuses[runtime.trackerStatus] || t.settings.statuses.stopped;
  const setting = (key, title, description) => <div className="setting-row" key={key}><div><strong>{title}</strong><span>{description}</span></div><SettingSwitch checked={Boolean(state.settings[key])} disabled={Boolean(pending) || !state.settings.trackingEnabled} label={title} onChange={(enabled) => run(key, () => actions.setSetting(key, enabled))} /></div>;
  return <div className="subpage narrow-page"><div className="subpage-heading"><Gear size={29} /><div><h2>{t.settings.title}</h2><p>{t.settings.subtitle}</p></div></div><div className={`runtime-card ${runtime.trackerStatus || "stopped"}`}><span className="status-dot on" /><div><strong>{statusLabel}</strong><small>{t.settings.runtimeText}</small></div>{runtime.platform && <em>{runtime.platform === "darwin" ? "macOS" : runtime.platform === "win32" ? "Windows" : runtime.platform}</em>}</div>{runtime.platform === "darwin" && !runtime.accessibilityTrusted && <div className="permission-card"><ShieldCheck size={22} /><div><strong>{t.settings.accessibility}</strong><span>{t.settings.accessibilityText}</span></div><button onClick={() => run("accessibility", actions.requestAccessibility)} disabled={Boolean(pending)}>{t.settings.grantAccess}</button></div>}<div className="settings-section"><h3>{t.settings.language}</h3><LanguageSelector language={language} onChange={actions.setLanguage} t={t} /></div><div className="settings-section"><h3>{t.settings.updates}</h3><UpdateSettings runtime={runtime} actions={actions} pending={pending} run={run} t={t} /></div><div className="settings-section"><h3>{t.settings.activity}</h3><div className="setting-row"><div><strong>{t.settings.record}</strong><span>{t.settings.recordText}</span></div><SettingSwitch checked={state.settings.trackingEnabled} disabled={Boolean(pending)} label={t.settings.record} onChange={(enabled) => run("tracking", () => actions.setTracking(enabled))} /></div>{setting("collectWindowTitles", t.settings.titles, t.settings.titlesText)}{setting("collectInputCounts", t.settings.inputs, t.settings.inputsText)}{setting("collectBrowserTabCount", t.settings.tabs, t.settings.tabsText)}<div className="setting-row"><div><strong>{t.settings.private}</strong><span>{state.settings.excludePrivateWindows ? t.settings.privateText : t.settings.privateWarning}</span></div><SettingSwitch checked={state.settings.excludePrivateWindows} disabled={Boolean(pending) || !state.settings.trackingEnabled} label={t.settings.private} onChange={(enabled) => run("private", () => actions.setSetting("excludePrivateWindows", enabled))} /></div></div><div className="settings-section"><h3>{t.settings.analysis}</h3><IntentRuleEditor rules={state.settings.intentRules || []} onChange={actions.setIntentRules} t={t} /></div><div className="settings-section"><h3>{t.settings.system}</h3><div className="setting-row"><div><strong>{t.settings.autostart}</strong><span>{runtime.autoStartSupported ? t.settings.autostartText : t.settings.autostartUnavailable}</span></div><SettingSwitch checked={Boolean(runtime.autoStartEnabled)} disabled={Boolean(pending) || !runtime.autoStartSupported} label={t.settings.autostart} onChange={(enabled) => run("autostart", () => actions.setAutoStart(enabled))} /></div></div><div className="settings-section"><h3>{t.settings.data}</h3><div className="data-facts"><div><Database size={21} /><span><strong>{text(t.settings.events, { count: state.eventCount })}</strong><small>{text(t.settings.autoDelete, { hours: state.settings.retentionHours })}</small></span></div><div><FolderOpen size={21} /><span><strong>{t.settings.deviceOnly}</strong><small>{state.dataPath}</small></span></div></div>{isDesktop && <button className="secondary-button" onClick={actions.revealData}><FolderOpen size={18} /> {t.settings.openData}</button>}</div><div className="danger-zone"><h3>{t.settings.clear}</h3><p>{t.settings.clearText}</p>{confirming ? <div className="confirm-row"><button onClick={() => { actions.deleteAll(); setConfirming(false); }}><Trash size={18} /> {t.settings.deleteAll}</button><button className="cancel" onClick={() => setConfirming(false)}>{t.common.cancel}</button></div> : <button onClick={() => setConfirming(true)}><Trash size={18} /> {t.settings.clearJournal}</button>}</div></div>;
}

export function App() {
  const { state, actions, isDesktop, language } = useDaytrace();
  const [page, setPage] = useState("history");
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(Date.now()));
  const t = translations[language];
  const today = startOfLocalDay(Date.now());
  const displayDay = page === "history" ? selectedDay : today;
  const date = useMemo(() => formatDay(displayDay, language), [displayDay, language]);
  const isToday = displayDay === today;
  const previousDay = selectedDay - 24 * 60 * 60_000;
  const canGoPrevious = previousDay + 24 * 60 * 60_000 >= state.retentionCutoff;
  const canGoNext = selectedDay < today;
  useEffect(() => { document.documentElement.lang = language; document.title = "Daytrace"; }, [language]);
  if (!state.settings.onboardingComplete) return <Onboarding language={language} onComplete={actions.completeOnboarding} />;
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} state={state} actions={actions} language={language} t={t} /><div className="app-main"><header className="date-header"><div><h1>{isToday ? `${t.common.today}, ${date.date}` : date.date}</h1><span>{date.weekday}</span></div>{page === "history" && <nav className="day-nav" aria-label={t.nav.history}><button onClick={() => setSelectedDay(previousDay)} disabled={!canGoPrevious} title={t.overview.previousDay}><CaretLeft size={18} /></button><button className="today-button" onClick={() => setSelectedDay(today)} disabled={selectedDay === today}><CalendarBlank size={17} /> {t.overview.backToday}</button><button onClick={() => setSelectedDay(selectedDay + 24 * 60 * 60_000)} disabled={!canGoNext} title={t.overview.nextDay}><CaretRight size={18} /></button></nav>}</header>{page === "history" && <HistoryPage state={state} actions={actions} setPage={setPage} selectedDay={selectedDay} language={language} t={t} />}{page === "ask" && <AskPage actions={actions} setPage={setPage} language={language} t={t} />}{page === "skills" && <SkillsPage state={state} actions={actions} t={t} />}{page === "settings" && <SettingsPage state={state} actions={actions} isDesktop={isDesktop} language={language} t={t} />}{page === "exclusions" && <ExclusionsPage state={state} actions={actions} t={t} />}</div></div>;
}
