import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Brain, Check, Clock, Compass, Database, EyeSlash, FolderOpen, Gear, Globe, LockKey, MagnifyingGlass, Pause, Play, Plus, ShieldCheck, Sparkle, Trash, X } from "@phosphor-icons/react";
import { SiFigma, SiGooglechrome, SiGmail, SiTelegram } from "react-icons/si";
import { FaEdge } from "react-icons/fa6";
import { VscVscode } from "react-icons/vsc";
import sageBranch from "./assets/sage-branch.png";
import { formatDuration, formatTime, formatToday, normalizeLanguage, text, translations } from "./i18n.js";

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
  en: { planning: "Planning and preparation", development: "Development", communication: "Communication and follow-up", design: "Design", research: "Research", files: "File work", other: "Work activity", break: "Break" },
  ru: { planning: "Планирование и подготовка", development: "Разработка", communication: "Коммуникация и уточнения", design: "Дизайн", research: "Исследование", files: "Работа с файлами", other: "Рабочая активность", break: "Перерыв" },
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
  const apps = ["Visual Studio Code", "Google Chrome", "Telegram Desktop", "Visual Studio Code", "Visual Studio Code", "Google Chrome", "Figma", "Telegram Desktop", "Gmail"];
  const focuses = ["development", "planning", "communication", "development", "development", "research", "design", "communication", "communication"];
  const times = [[9, 5, 9, 30], [9, 30, 9, 45], [9, 45, 10, 0], [10, 0, 10, 15], [10, 15, 10, 45], [10, 45, 11, 15], [11, 15, 11, 30], [11, 30, 11, 50], [11, 50, 12, 5]];
  const activities = times.map(([sh, sm, eh, em], index) => ({
    start: startOfToday(sh, sm), end: startOfToday(eh, em), durationMs: startOfToday(eh, em) - startOfToday(sh, sm),
    app: apps[index], title: t.demo.titles[index], focus: focuses[index], clicks: 4, inputs: 18,
  }));
  const makeSession = (id, from, to, focus) => ({ id, start: activities[from].start, end: activities[to].end, durationMs: activities[to].end - activities[from].start, focus, label: FOCUS_LABELS[lang][focus], activities: activities.slice(from, to + 1) });
  return {
    settings: { trackingEnabled: true, retentionHours: 48, excludePrivateWindows: true, excludedApps: ["1Password", "Bitwarden", "KeePass"], language: lang, onboardingComplete },
    sessions: [
      makeSession("demo-1", 0, 2, "planning"), makeSession("demo-2", 3, 6, "development"), makeSession("demo-3", 7, 8, "communication"),
      { id: "demo-break", start: startOfToday(12, 5), end: startOfToday(12, 20), durationMs: 15 * 60_000, focus: "break", label: FOCUS_LABELS[lang].break, activities: [] },
    ],
    eventCount: 128, retentionCutoff: Date.now() - 48 * 60 * 60_000, dataPath: t.demo.dataPath,
    skills: [
      { id: "morning-dev", title: t.demo.skills[0][0], description: t.demo.skills[0][1], apps: ["Visual Studio Code", "Google Chrome", "Telegram Desktop"], count: 3, duration: t.demo.skills[0][2] },
      { id: "requirements-sync", title: t.demo.skills[1][0], description: t.demo.skills[1][1], apps: ["Telegram Desktop", "Figma", "Gmail"], count: 2, duration: t.demo.skills[1][2] },
    ],
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
    async setExclusions(apps) { if (window.daytrace) setState(await window.daytrace.setExclusions(apps)); else setState((current) => ({ ...current, settings: { ...current.settings, excludedApps: apps } })); },
    async setLanguage(nextLanguage) { const next = normalizeLanguage(nextLanguage); if (window.daytrace) setState(await window.daytrace.setLanguage(next)); else setState(demoState(next, true)); },
    async completeOnboarding(nextLanguage) { const next = normalizeLanguage(nextLanguage); if (window.daytrace) setState(await window.daytrace.completeOnboarding(next)); else setState(demoState(next, true)); },
    async deleteAll() { if (window.daytrace) setState(await window.daytrace.deleteAll()); else setState((current) => ({ ...current, sessions: [], eventCount: 0 })); },
    async deleteSession(session) { if (window.daytrace) setState(await window.daytrace.deleteSession(session.start, session.end)); else setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) })); },
    async ask(question) {
      if (window.daytrace) return window.daytrace.ask(question);
      const t = translations[language];
      const sources = state.sessions.map((session) => ({ ...session, duration: formatDuration(session.durationMs, language), apps: [...new Set(session.activities.map((item) => item.app))] }));
      return { answer: t.summary.default, points: state.sessions.map((session) => ({ label: session.label, duration: formatDuration(session.durationMs, language) })), sources };
    },
    async exportSkill(skill) { if (window.daytrace) return window.daytrace.exportSkill(skill); return text(translations[language].skills.draft, { title: skill.title }); },
    revealData() { return window.daytrace?.revealData(); },
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
  return <aside className="sidebar">
    <div className="brand-mark"><Compass size={29} weight="fill" /></div>
    <nav className="main-nav" aria-label={language === "ru" ? "Разделы" : "Sections"}>{NAVIGATION.map(({ id, icon: Icon, separated }) => <button key={id} className={`${page === id ? "active" : ""} ${separated ? "separated" : ""}`} onClick={() => setPage(id)}><Icon size={25} weight={page === id ? "fill" : "regular"} /><span>{t.nav[id]}</span></button>)}</nav>
    <div className="sidebar-status"><div className="status-row"><span className={`status-dot ${state.settings.trackingEnabled ? "on" : "off"}`} /><span>{state.settings.trackingEnabled ? t.common.local : t.status.paused}</span></div><div className="status-row muted"><Database size={18} /><span>{text(t.status.retention, { hours: state.settings.retentionHours })}</span></div><div className="expiry">{text(t.status.deletion, { time: formatTime(expires, language) })}</div></div>
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

function Session({ session, onDelete, language, t }) {
  const isBreak = session.focus === "break";
  return <section className={`timeline-session ${isBreak ? "break-session" : ""}`}><span className="timeline-node" /><header className="session-header"><div className="session-chip"><strong>{formatTime(session.start, language)} – {formatTime(session.end, language)}</strong>{!isBreak && <><span>•</span><span>{t.session.focus}: {session.label.toLocaleLowerCase(t.locale)}</span></>}</div><span className="session-line" /><strong className="duration">{formatDuration(session.durationMs, language)}</strong><button className="icon-button delete-session" onClick={() => onDelete(session)} title={t.session.delete}><Trash size={17} /></button></header><div className="activity-list">{session.activities.map((activity, index) => <div className="activity" key={`${activity.start}-${index}`}><time>{formatTime(activity.start, language)} – {formatTime(activity.end, language)}</time><AppIcon app={activity.app} /><div><strong>{activity.app}</strong><span>{activity.title || t.common.activeWindow}</span></div></div>)}</div></section>;
}

function Summary({ result, sessions, language, t }) {
  const sessionPoints = sessions.filter((session) => session.focus !== "break").map((session) => ({ label: session.label, duration: formatDuration(session.durationMs, language), time: `${formatTime(session.start, language)} – ${formatTime(session.end, language)}`, detail: t.summary.details[session.focus] || t.summary.grouped }));
  const points = result?.points?.length ? result.points.map((point) => ({ ...sessionPoints.find((item) => item.label === point.label), ...point })) : sessionPoints;
  const answer = result?.answer || (sessions.length ? t.summary.default : t.summary.empty);
  return <aside className="summary-panel"><img className="sage-branch" src={sageBranch} alt="" /><h2>{t.summary.title}</h2><span className="summary-time">{text(t.summary.generated, { time: formatTime(Date.now(), language) })}</span><p className="summary-answer">{answer}</p><div className="summary-points">{points.slice(0, 3).map((point) => <div className="summary-point" key={point.label}><span className="summary-dot" /><div><strong>{point.label}</strong><small>{point.time ? `${point.time} (${point.duration})` : point.duration}</small>{point.detail && <p>{point.detail}</p>}</div></div>)}</div><div className="privacy-note"><strong>{t.summary.how}</strong><p>{t.summary.explanation}</p><div><LockKey size={16} /> {t.summary.private}</div><div><EyeSlash size={16} /> {t.summary.excluded}</div></div></aside>;
}

function HistoryPage({ state, actions, setPage, language, t }) {
  const [result, setResult] = useState(null);
  useEffect(() => { setResult(null); }, [language]);
  return <div className="history-page"><QuestionBar t={t} onAsk={async (question) => setResult(await actions.ask(question))} /><div className="history-layout"><main className="timeline-column"><div className="section-title"><h2>{t.history.title}</h2></div>{state.sessions.length ? <div className="timeline">{state.sessions.map((session) => <Session key={session.id} session={session} onDelete={actions.deleteSession} language={language} t={t} />)}</div> : <div className="empty-state"><Clock size={34} /><h3>{t.history.emptyTitle}</h3><p>{t.history.emptyText}</p><button onClick={() => setPage("settings")}>{t.history.checkSettings} <ArrowRight size={17} /></button></div>}</main><Summary result={result} sessions={state.sessions} language={language} t={t} /></div></div>;
}

function AskPage({ actions, setPage, language, t }) {
  const [result, setResult] = useState(null);
  useEffect(() => { setResult(null); }, [language]);
  return <div className="subpage ask-page"><div className="subpage-heading"><Brain size={29} /><div><h2>{t.ask.title}</h2><p>{t.ask.subtitle}</p></div><button className="skills-link" onClick={() => setPage("skills")}><Sparkle size={17} /> {t.ask.skills}</button></div><QuestionBar t={t} initial={t.question.fallback} onAsk={async (question) => setResult(await actions.ask(question))} /><div className="answer-surface">{result ? <><span className="eyebrow">{t.ask.localAnswer}</span><h3>{result.answer}</h3><div className="answer-sources">{result.sources.map((source) => <div key={source.id}><Clock size={18} /><span>{formatTime(source.start, language)}–{formatTime(source.end, language)}</span><strong>{source.label}</strong><small>{source.apps.join(", ")}</small></div>)}</div></> : <><span className="eyebrow">{t.ask.examples}</span><h3>{t.ask.examplesText}</h3><div className="prompt-chips">{t.ask.prompts.map((prompt) => <span key={prompt}>{prompt}</span>)}</div></>}</div></div>;
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

function SettingsPage({ state, actions, isDesktop, language, t }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="subpage narrow-page"><div className="subpage-heading"><Gear size={29} /><div><h2>{t.settings.title}</h2><p>{t.settings.subtitle}</p></div></div><div className="settings-section"><h3>{t.settings.language}</h3><LanguageSelector language={language} onChange={actions.setLanguage} t={t} /></div><div className="settings-section"><h3>{t.settings.activity}</h3><label className="setting-row"><div><strong>{t.settings.record}</strong><span>{t.settings.recordText}</span></div><input type="checkbox" checked={state.settings.trackingEnabled} onChange={(event) => actions.setTracking(event.target.checked)} /></label><label className="setting-row"><div><strong>{t.settings.private}</strong><span>{t.settings.privateText}</span></div><input type="checkbox" checked={state.settings.excludePrivateWindows} readOnly /></label></div><div className="settings-section"><h3>{t.settings.data}</h3><div className="data-facts"><div><Database size={21} /><span><strong>{text(t.settings.events, { count: state.eventCount })}</strong><small>{text(t.settings.autoDelete, { hours: state.settings.retentionHours })}</small></span></div><div><FolderOpen size={21} /><span><strong>{t.settings.deviceOnly}</strong><small>{state.dataPath}</small></span></div></div>{isDesktop && <button className="secondary-button" onClick={actions.revealData}><FolderOpen size={18} /> {t.settings.openData}</button>}</div><div className="danger-zone"><h3>{t.settings.clear}</h3><p>{t.settings.clearText}</p>{confirming ? <div className="confirm-row"><button onClick={() => { actions.deleteAll(); setConfirming(false); }}><Trash size={18} /> {t.settings.deleteAll}</button><button className="cancel" onClick={() => setConfirming(false)}>{t.common.cancel}</button></div> : <button onClick={() => setConfirming(true)}><Trash size={18} /> {t.settings.clearJournal}</button>}</div></div>;
}

export function App() {
  const { state, actions, isDesktop, language } = useDaytrace();
  const [page, setPage] = useState("history");
  const t = translations[language];
  const date = useMemo(() => formatToday(language), [language]);
  useEffect(() => { document.documentElement.lang = language; document.title = "Daytrace"; }, [language]);
  if (!state.settings.onboardingComplete) return <Onboarding language={language} onComplete={actions.completeOnboarding} />;
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} state={state} actions={actions} language={language} t={t} /><div className="app-main"><header className="date-header"><h1>{t.common.today}, {date.date}</h1><span>{date.weekday}</span></header>{page === "history" && <HistoryPage state={state} actions={actions} setPage={setPage} language={language} t={t} />}{page === "ask" && <AskPage actions={actions} setPage={setPage} language={language} t={t} />}{page === "skills" && <SkillsPage state={state} actions={actions} t={t} />}{page === "settings" && <SettingsPage state={state} actions={actions} isDesktop={isDesktop} language={language} t={t} />}{page === "exclusions" && <ExclusionsPage state={state} actions={actions} t={t} />}</div></div>;
}
