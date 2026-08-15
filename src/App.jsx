import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Brain, Check, Clock, Compass, Database, EyeSlash, FolderOpen, Gear, LockKey, MagnifyingGlass, Pause, Play, Plus, ShieldCheck, Sparkle, Trash, X } from "@phosphor-icons/react";
import { SiFigma, SiGooglechrome, SiGmail, SiTelegram } from "react-icons/si";
import { FaEdge } from "react-icons/fa6";
import { VscVscode } from "react-icons/vsc";

const NAVIGATION = [
  { id: "history", label: "История дня", icon: Clock },
  { id: "ask", label: "Спросить о дне", icon: MagnifyingGlass },
  { id: "settings", label: "Настройки", icon: Gear },
  { id: "exclusions", label: "Исключения", icon: ShieldCheck, separated: true },
];

const APP_ICONS = [
  [/visual studio|\bcode\b/i, VscVscode, "#168bd2"],
  [/chrome/i, SiGooglechrome, "#e25b3d"],
  [/edge/i, FaEdge, "#0a9c83"],
  [/telegram/i, SiTelegram, "#249bd7"],
  [/figma/i, SiFigma, "#292929"],
  [/gmail|mail/i, SiGmail, "#d94c3f"],
];

const SUMMARY_DETAILS = {
  planning: "План задач, структура проекта, обсуждение в команде.",
  development: "Код: модели, сервисы, компоненты. Документация и проектирование интерфейса.",
  communication: "Обсуждение требований и письмо с уточнениями по API.",
  design: "Макеты, компоненты и визуальная структура интерфейса.",
  research: "Документация, примеры и материалы по текущей задаче.",
};

function startOfToday(hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function demoState() {
  const activities = [
    [9, 5, 9, 30, "Visual Studio Code", "studio-tasks.md, roadmap.md, app.ts", "development"],
    [9, 30, 9, 45, "Google Chrome", "Google Документы — план задач", "planning"],
    [9, 45, 10, 0, "Telegram Desktop", "Обсуждение задачи в рабочем чате", "communication"],
    [10, 0, 10, 15, "Visual Studio Code", "models/task.ts, services/api.ts", "development"],
    [10, 15, 10, 45, "Visual Studio Code", "components/TaskList.vue, styles.css", "development"],
    [10, 45, 11, 15, "Google Chrome", "Локальная документация, MDN Web Docs", "research"],
    [11, 15, 11, 30, "Figma", "UI Kit — Task Board", "design"],
    [11, 30, 11, 50, "Telegram Desktop", "Синхронизация по требованиям", "communication"],
    [11, 50, 12, 5, "Gmail", "Письмо: уточнения по API", "communication"],
  ].map(([sh, sm, eh, em, app, title, focus]) => ({ start: startOfToday(sh, sm), end: startOfToday(eh, em), durationMs: startOfToday(eh, em) - startOfToday(sh, sm), app, title, focus, clicks: 4, inputs: 18 }));
  const makeSession = (id, from, to, focus, label) => ({ id, start: activities[from].start, end: activities[to].end, durationMs: activities[to].end - activities[from].start, focus, label, activities: activities.slice(from, to + 1) });
  return {
    settings: { trackingEnabled: true, retentionHours: 48, excludePrivateWindows: true, excludedApps: ["1Password", "Bitwarden", "KeePass"] },
    sessions: [
      makeSession("demo-1", 0, 2, "planning", "Планирование и подготовка"),
      makeSession("demo-2", 3, 6, "development", "Разработка"),
      makeSession("demo-3", 7, 8, "communication", "Коммуникация и уточнения"),
      { id: "demo-break", start: startOfToday(12, 5), end: startOfToday(12, 20), durationMs: 15 * 60_000, focus: "break", label: "Перерыв", activities: [] },
    ],
    eventCount: 128,
    retentionCutoff: Date.now() - 48 * 60 * 60_000,
    dataPath: "Локальная папка Daytrace",
    skills: [
      { id: "morning-dev", title: "Утренний старт проекта", description: "Повторяющийся поток: план → код → проверка документации.", apps: ["Visual Studio Code", "Google Chrome", "Telegram Desktop"], count: 3, duration: "2 ч 40 мин" },
      { id: "requirements-sync", title: "Синхронизация требований", description: "Повторяющийся поток: рабочий чат → макет → письмо с итогом.", apps: ["Telegram Desktop", "Figma", "Gmail"], count: 2, duration: "1 ч 15 мин" },
    ],
  };
}

function formatTime(value) { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function durationText(ms) { const minutes = Math.max(1, Math.round(ms / 60_000)); const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} ч${rest ? ` ${rest} мин` : ""}` : `${minutes} мин`; }
function russianDate() { const now = new Date(); const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(now).replace(/\s*г\.$/, ""); const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(now); return { date: date.replace(/^./, (letter) => letter.toUpperCase()), weekday: weekday.replace(/^./, (letter) => letter.toUpperCase()) }; }

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
    if (!window.daytrace) return;
    setIsDesktop(true);
    window.daytrace.getState().then(setState);
    return window.daytrace.onStateChanged(setState);
  }, []);
  const actions = {
    async setTracking(enabled) { if (window.daytrace) setState(await window.daytrace.setTracking(enabled)); else setState((current) => ({ ...current, settings: { ...current.settings, trackingEnabled: enabled } })); },
    async setExclusions(apps) { if (window.daytrace) setState(await window.daytrace.setExclusions(apps)); else setState((current) => ({ ...current, settings: { ...current.settings, excludedApps: apps } })); },
    async deleteAll() { if (window.daytrace) setState(await window.daytrace.deleteAll()); else setState((current) => ({ ...current, sessions: [], eventCount: 0 })); },
    async deleteSession(session) { if (window.daytrace) setState(await window.daytrace.deleteSession(session.start, session.end)); else setState((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) })); },
    async ask(question) {
      if (window.daytrace) return window.daytrace.ask(question);
      const sources = state.sessions.map((session) => ({ ...session, duration: durationText(session.durationMs), apps: [...new Set(session.activities.map((item) => item.app))] }));
      return { answer: "Сегодня утром вы работали над планированием, разработкой и коммуникацией по проекту.", points: state.sessions.map((session) => ({ label: session.label, duration: durationText(session.durationMs) })), sources };
    },
    async exportSkill(skill) { if (window.daytrace) return window.daytrace.exportSkill(skill); return `Локальный черновик навыка: ${skill.title}`; },
    revealData() { return window.daytrace?.revealData(); },
  };
  return { state, actions, isDesktop };
}

function Sidebar({ page, setPage, state, actions }) {
  const expires = new Date(Date.now() + state.settings.retentionHours * 60 * 60_000);
  return <aside className="sidebar">
    <div className="brand-mark"><Compass size={29} weight="fill" /></div>
    <nav className="main-nav" aria-label="Разделы">{NAVIGATION.map(({ id, label, icon: Icon, separated }) => <button key={id} className={`${page === id ? "active" : ""} ${separated ? "separated" : ""}`} onClick={() => setPage(id)}><Icon size={25} weight={page === id ? "fill" : "regular"} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-status"><div className="status-row"><span className={`status-dot ${state.settings.trackingEnabled ? "on" : "off"}`} /><span>{state.settings.trackingEnabled ? "Локально" : "Сбор на паузе"}</span></div><div className="status-row muted"><Database size={18} /><span>Хранение {state.settings.retentionHours} часов</span></div><div className="expiry">Удаление до {formatTime(expires)}</div></div>
    <button className={`tracking-button ${state.settings.trackingEnabled ? "pause" : "resume"}`} onClick={() => actions.setTracking(!state.settings.trackingEnabled)}>{state.settings.trackingEnabled ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}{state.settings.trackingEnabled ? "Приостановить" : "Продолжить"}</button>
  </aside>;
}

function QuestionBar({ onAsk, initial = "" }) {
  const [question, setQuestion] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function submit(event) { event?.preventDefault(); const value = question.trim() || "Над чем я работал сегодня с утра?"; setBusy(true); await onAsk(value); setBusy(false); }
  return <form className="question-bar" onSubmit={submit}><MagnifyingGlass size={26} /><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Спросить о дне, например: «Над чем я работал сегодня с утра?»" aria-label="Вопрос о рабочем дне" /><button type="submit" disabled={busy}>{busy ? "Ищу…" : "Спросить"}</button></form>;
}

function Session({ session, onDelete }) {
  const isBreak = session.focus === "break";
  return <section className={`timeline-session ${isBreak ? "break-session" : ""}`}><span className="timeline-node" /><header className="session-header"><div className="session-chip"><strong>{formatTime(session.start)} – {formatTime(session.end)}</strong>{!isBreak && <><span>•</span><span>Фокус: {session.label.toLowerCase()}</span></>}</div><span className="session-line" /><strong className="duration">{durationText(session.durationMs)}</strong><button className="icon-button delete-session" onClick={() => onDelete(session)} title="Удалить сессию"><Trash size={17} /></button></header><div className="activity-list">{session.activities.map((activity, index) => <div className="activity" key={`${activity.start}-${index}`}><time>{formatTime(activity.start)} – {formatTime(activity.end)}</time><AppIcon app={activity.app} /><div><strong>{activity.app}</strong><span>{activity.title || "Активное окно"}</span></div></div>)}</div></section>;
}

function Summary({ result, sessions }) {
  const sessionPoints = sessions.filter((session) => session.focus !== "break").map((session) => ({ label: session.label, duration: durationText(session.durationMs), time: `${formatTime(session.start)} – ${formatTime(session.end)}`, detail: SUMMARY_DETAILS[session.focus] || "Сгруппировано по активному приложению и окну." }));
  const points = result?.points?.length ? result.points.map((point) => ({ ...sessionPoints.find((item) => item.label === point.label), ...point })) : sessionPoints;
  const answer = result?.answer || (sessions.length ? "Сегодня утром вы работали над планированием, разработкой и коммуникацией по проекту." : "Как только появится активность, здесь будет аккуратный итог дня.");
  return <aside className="summary-panel"><img className="sage-branch" src="/assets/sage-branch.png" alt="" /><h2>Утренний итог</h2><span className="summary-time">Сформировано локально, {formatTime(Date.now())}</span><p className="summary-answer">{answer}</p><div className="summary-points">{points.slice(0, 3).map((point) => <div className="summary-point" key={point.label}><span className="summary-dot" /><div><strong>{point.label}</strong><small>{point.time ? `${point.time} (${point.duration})` : point.duration}</small>{point.detail && <p>{point.detail}</p>}</div></div>)}</div><div className="privacy-note"><strong>Как формируется итог</strong><p>На основе локальных событий приложений и браузера. Без скриншотов, аудио и содержимого ввода.</p><div><LockKey size={16} /> Приватные окна браузера исключены</div><div><EyeSlash size={16} /> Заданные приложения не отслеживаются</div></div></aside>;
}

function HistoryPage({ state, actions, setPage }) {
  const [result, setResult] = useState(null);
  return <div className="history-page"><QuestionBar onAsk={async (question) => setResult(await actions.ask(question))} /><div className="history-layout"><main className="timeline-column"><div className="section-title"><h2>История дня</h2></div>{state.sessions.length ? <div className="timeline">{state.sessions.map((session) => <Session key={session.id} session={session} onDelete={actions.deleteSession} />)}</div> : <div className="empty-state"><Clock size={34} /><h3>История пока пуста</h3><p>Оставьте сбор включённым и переключитесь между рабочими приложениями. Первые сессии появятся здесь автоматически.</p><button onClick={() => setPage("settings")}>Проверить настройки <ArrowRight size={17} /></button></div>}</main><Summary result={result} sessions={state.sessions} /></div></div>;
}

function AskPage({ actions, setPage }) {
  const [result, setResult] = useState(null);
  return <div className="subpage ask-page"><div className="subpage-heading"><Brain size={29} /><div><h2>Спросить о дне</h2><p>Ответ строится на этом устройстве из событий последних 48 часов.</p></div><button className="skills-link" onClick={() => setPage("skills")}><Sparkle size={17} /> Навыки из потоков</button></div><QuestionBar initial="Над чем я работал сегодня с утра?" onAsk={async (question) => setResult(await actions.ask(question))} /><div className="answer-surface">{result ? <><span className="eyebrow">Локальный ответ</span><h3>{result.answer}</h3><div className="answer-sources">{result.sources.map((source) => <div key={source.id}><Clock size={18} /><span>{formatTime(source.start)}–{formatTime(source.end)}</span><strong>{source.label}</strong><small>{source.apps.join(", ")}</small></div>)}</div></> : <><span className="eyebrow">Примеры</span><h3>Можно спросить про утро, конкретное приложение, период или переходы между задачами.</h3><div className="prompt-chips"><span>Что заняло больше всего времени?</span><span>Когда я работал в Figma?</span><span>Где я часто переключался?</span></div></>}</div></div>;
}

function SkillsPage({ state, actions }) {
  const [exported, setExported] = useState("");
  return <div className="subpage"><div className="subpage-heading"><Sparkle size={29} /><div><h2>Навыки из рабочих потоков</h2><p>Черновики строятся локально по повторяющимся последовательностям приложений.</p></div></div><div className="skill-list">{state.skills.length ? state.skills.map((skill) => <article className="skill-card" key={skill.id}><div className="skill-icon"><Sparkle size={22} /></div><div><h3>{skill.title}</h3><p>{skill.description}</p><div className="app-sequence">{skill.apps.map((app, index) => <span key={app}><AppIcon app={app} size={22} />{index < skill.apps.length - 1 && <ArrowRight size={14} />}</span>)}</div></div><button onClick={async () => setExported(await actions.exportSkill(skill))}>Создать SKILL.md</button></article>) : <div className="empty-state"><Sparkle size={34} /><h3>Повторяющиеся потоки ещё не найдены</h3><p>Daytrace предложит навык после нескольких похожих рабочих сессий.</p></div>}</div>{exported && <div className="toast"><Check size={18} /> Навык сохранён: {exported}</div>}</div>;
}

function ExclusionsPage({ state, actions }) {
  const [value, setValue] = useState("");
  const apps = state.settings.excludedApps;
  function add() { const next = value.trim(); if (!next || apps.some((app) => app.toLowerCase() === next.toLowerCase())) return; actions.setExclusions([...apps, next]); setValue(""); }
  return <div className="subpage narrow-page"><div className="subpage-heading"><ShieldCheck size={29} /><div><h2>Исключения</h2><p>Эти приложения отбрасываются до того, как событие попадёт на диск.</p></div></div><div className="privacy-banner"><LockKey size={25} /><div><strong>Приватные окна браузера исключаются автоматически</strong><span>Daytrace распознаёт режимы Incognito, InPrivate и Private Browsing.</span></div></div><div className="settings-section"><h3>Не отслеживать приложения</h3><div className="add-exclusion"><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="Например, Signal" /><button onClick={add}><Plus size={18} /> Добавить</button></div><div className="exclusion-list">{apps.map((app) => <div key={app}><span>{app}</span><button onClick={() => actions.setExclusions(apps.filter((item) => item !== app))} title="Убрать исключение"><X size={18} /></button></div>)}</div></div></div>;
}

function SettingsPage({ state, actions, isDesktop }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="subpage narrow-page"><div className="subpage-heading"><Gear size={29} /><div><h2>Настройки</h2><p>Контроль записи, хранения и локальных данных.</p></div></div><div className="settings-section"><h3>Сбор активности</h3><label className="setting-row"><div><strong>Записывать активность</strong><span>Переключения окон, клики и обезличенные счётчики ввода</span></div><input type="checkbox" checked={state.settings.trackingEnabled} onChange={(event) => actions.setTracking(event.target.checked)} /></label><label className="setting-row"><div><strong>Исключать приватные окна</strong><span>Всегда включено для поддерживаемых браузеров</span></div><input type="checkbox" checked={state.settings.excludePrivateWindows} readOnly /></label></div><div className="settings-section"><h3>Данные</h3><div className="data-facts"><div><Database size={21} /><span><strong>{state.eventCount} событий</strong><small>Автоудаление через {state.settings.retentionHours} часов</small></span></div><div><FolderOpen size={21} /><span><strong>Только на устройстве</strong><small>{state.dataPath}</small></span></div></div>{isDesktop && <button className="secondary-button" onClick={actions.revealData}><FolderOpen size={18} /> Открыть папку данных</button>}</div><div className="danger-zone"><h3>Очистить историю</h3><p>Все локальные события будут удалены немедленно и безвозвратно.</p>{confirming ? <div className="confirm-row"><button onClick={() => { actions.deleteAll(); setConfirming(false); }}><Trash size={18} /> Удалить всё</button><button className="cancel" onClick={() => setConfirming(false)}>Отмена</button></div> : <button onClick={() => setConfirming(true)}><Trash size={18} /> Очистить локальный журнал</button>}</div></div>;
}

export function App() {
  const { state, actions, isDesktop } = useDaytrace();
  const [page, setPage] = useState("history");
  const date = useMemo(russianDate, []);
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} state={state} actions={actions} /><div className="app-main"><header className="date-header"><h1>Сегодня, {date.date}</h1><span>{date.weekday}</span></header>{page === "history" && <HistoryPage state={state} actions={actions} setPage={setPage} />}{page === "ask" && <AskPage actions={actions} setPage={setPage} />}{page === "skills" && <SkillsPage state={state} actions={actions} />}{page === "settings" && <SettingsPage state={state} actions={actions} isDesktop={isDesktop} />}{page === "exclusions" && <ExclusionsPage state={state} actions={actions} />}</div></div>;
}
