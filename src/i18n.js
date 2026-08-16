export const SUPPORTED_LANGUAGES = ["en", "ru"];

export function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

export const translations = {
  en: {
    locale: "en-US",
    languageName: "English",
    nav: { history: "Day overview", ask: "Ask about your day", settings: "Settings", exclusions: "Exclusions" },
    common: { activeWindow: "Active window", cancel: "Cancel", add: "Add", today: "Today", local: "Local", minutes: "min", hours: "h" },
    status: { paused: "Tracking paused", retention: "Stored for {hours} hours", deletion: "Deletion by {time}", pause: "Pause", resume: "Resume" },
    question: { placeholder: "Ask about your day, for example: “What was I working on this morning?”", label: "Question about your workday", fallback: "What was I working on this morning?", searching: "Searching…", ask: "Ask" },
    session: { focus: "Focus", delete: "Delete session" },
    summary: {
      title: "Day summary", generated: "Updated locally, {time}",
      default: "Your day was centered on {focus}. Most time was spent in {app}.",
      empty: "Once activity appears, a clear summary of your day will be shown here.",
      how: "How this summary is made", explanation: "Based on local application and browser events. No screenshots, audio, or typed content.",
      private: "Private browser windows are excluded", excluded: "Selected applications are not tracked",
      grouped: "Grouped by active application and window.",
      details: {
        planning: "Task planning, project structure, and team discussion.",
        development: "Code, models, services, components, documentation, and interface engineering.",
        communication: "Requirements discussion and follow-up messages about the API.",
        design: "Layouts, components, and visual interface structure.",
        research: "Documentation, examples, and materials for the current task.",
        files: "Local files and folders used during the work session.",
        other: "Activity grouped from the active application and window.",
      },
    },
    history: { title: "Latest activity", newestFirst: "Newest first", emptyTitle: "No activity for this day", emptyText: "Leave tracking enabled and switch between your work applications. The first sessions will appear here automatically.", checkSettings: "Check settings" },
    overview: {
      previousDay: "Previous day", nextDay: "Next day", backToday: "Today",
      activeTime: "Active time", activeTimeHint: "Observed in foreground", apps: "Applications", appsHint: "Used this day",
      switches: "Context switches", switchesHint: "Between active windows", tabs: "Browser tabs", tabsHint: "Maximum observed",
      focusTitle: "Where the day went", focusSubtitle: "Share of observed active time", appsTitle: "Top applications", appsSubtitle: "Time in the foreground",
      rhythmTitle: "Activity rhythm", rhythmSubtitle: "Observed minutes by hour", noTabs: "Not observed",
      tabsCount: "{count} tabs", inputCount: "{count} actions", latestContext: "Latest visible context",
    },
    ask: {
      title: "Ask about your day", subtitle: "The answer is built on this device from events stored during the last 48 hours.", skills: "Skills from workflows",
      localAnswer: "Local answer", examples: "Examples", examplesText: "Ask about the morning, a specific application, a time period, or task switching.",
      understood: "Understood as:", engineNote: "No LLM is used: a local rule engine recognizes the period, application, and question type, then calculates the answer from your journal.", demoInterpretation: "summary · today morning",
      prompts: ["What took the most time?", "When did I work in Figma?", "Where did I switch often?"],
    },
    skills: {
      title: "Skills from work patterns", subtitle: "Drafts are built locally from repeated application sequences.", create: "Create SKILL.md",
      emptyTitle: "No repeated workflows found yet", emptyText: "Daytrace will suggest a skill after several similar work sessions.", saved: "Skill saved: {path}", draft: "Local skill draft: {title}",
    },
    exclusions: {
      title: "Exclusions", subtitle: "These applications are discarded before an event can be written to disk.",
      privateTitle: "Private browser windows are excluded automatically", privateText: "Daytrace recognizes Incognito, InPrivate, and Private Browsing modes.",
      appTitle: "Do not track applications", placeholder: "For example, Signal", remove: "Remove exclusion",
    },
    settings: {
      title: "Settings", subtitle: "Control recording, storage, language, and local data.", language: "Language", languageText: "The interface, timeline labels, local answers, tray menu, and exported skills use this language.",
      activity: "Activity tracking", record: "Record activity", recordText: "Window switches and the enabled anonymous signals below", private: "Exclude private windows", privateText: "Incognito, InPrivate, and Private Browsing titles are discarded before saving", privateWarning: "Disabled: private-window titles may be recorded locally",
      titles: "Window titles", titlesText: "Adds the active document, tab, or chat name; never reads its contents", inputs: "Anonymous input counts", inputsText: "Counts keyboard and mouse actions without recording keys, coordinates, or typed text", tabs: "Browser tab count", tabsText: "Samples only the number of visible browser tabs once per minute",
      system: "System", autostart: "Launch at login", autostartText: "Starts quietly in the tray and begins local tracking", autostartUnavailable: "Available in the installed desktop application", runtimeText: "Native collector runs separately and writes only local events", accessibility: "Accessibility permission required", accessibilityText: "macOS requires permission to read the active application and window title.", grantAccess: "Open permission settings",
      statuses: { running: "Collector is running", starting: "Collector is starting…", paused: "Tracking is paused", stopped: "Collector is stopped", error: "Collector needs attention", unavailable: "Native collector is unavailable", "permission-required": "Accessibility permission required" },
      data: "Data", events: "{count} events", autoDelete: "Automatically deleted after {hours} hours", deviceOnly: "On this device only", openData: "Open data folder",
      clear: "Clear history", clearText: "All local events will be deleted immediately and permanently.", deleteAll: "Delete everything", clearJournal: "Clear local journal",
    },
    onboarding: {
      eyebrow: "Private by design", title: "Choose your language", subtitle: "Daytrace works entirely on this computer. You can change the language at any time in Settings.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Your activity stays on this device", privacyText: "No screenshots, audio, typed text, account, or cloud storage.", continue: "Continue in English",
    },
    demo: {
      dataPath: "Local Daytrace folder",
      titles: ["studio-tasks.md, roadmap.md, app.ts", "Google Docs — task plan", "Task discussion in the work chat", "models/task.ts, services/api.ts", "components/TaskList.vue, styles.css", "Local documentation, MDN Web Docs", "UI Kit — Task Board", "Requirements sync", "Email: API clarifications"],
      skills: [
        ["Morning project start", "Repeated workflow: plan → code → documentation check.", "2 h 40 min"],
        ["Requirements sync", "Repeated workflow: work chat → mockup → summary email.", "1 h 15 min"],
      ],
    },
  },
  ru: {
    locale: "ru-RU",
    languageName: "Русский",
    nav: { history: "Обзор дня", ask: "Спросить о дне", settings: "Настройки", exclusions: "Исключения" },
    common: { activeWindow: "Активное окно", cancel: "Отмена", add: "Добавить", today: "Сегодня", local: "Локально", minutes: "мин", hours: "ч" },
    status: { paused: "Сбор на паузе", retention: "Хранение {hours} часов", deletion: "Удаление до {time}", pause: "Приостановить", resume: "Продолжить" },
    question: { placeholder: "Спросить о дне, например: «Над чем я работал сегодня с утра?»", label: "Вопрос о рабочем дне", fallback: "Над чем я работал сегодня с утра?", searching: "Ищу…", ask: "Спросить" },
    session: { focus: "Фокус", delete: "Удалить сессию" },
    summary: {
      title: "Итог дня", generated: "Обновлено локально, {time}",
      default: "День был сосредоточен на направлении «{focus}». Больше всего времени заняло приложение {app}.",
      empty: "Как только появится активность, здесь будет аккуратный итог дня.",
      how: "Как формируется итог", explanation: "На основе локальных событий приложений и браузера. Без скриншотов, аудио и содержимого ввода.",
      private: "Приватные окна браузера исключены", excluded: "Заданные приложения не отслеживаются",
      grouped: "Сгруппировано по активному приложению и окну.",
      details: {
        planning: "План задач, структура проекта, обсуждение в команде.",
        development: "Код: модели, сервисы, компоненты. Документация и проектирование интерфейса.",
        communication: "Обсуждение требований и письмо с уточнениями по API.",
        design: "Макеты, компоненты и визуальная структура интерфейса.",
        research: "Документация, примеры и материалы по текущей задаче.",
        files: "Локальные файлы и папки, использованные во время работы.",
        other: "Активность сгруппирована по активному приложению и окну.",
      },
    },
    history: { title: "Последняя активность", newestFirst: "Сначала новое", emptyTitle: "За этот день активности нет", emptyText: "Оставьте сбор включённым и переключитесь между рабочими приложениями. Первые сессии появятся здесь автоматически.", checkSettings: "Проверить настройки" },
    overview: {
      previousDay: "Предыдущий день", nextDay: "Следующий день", backToday: "Сегодня",
      activeTime: "Активное время", activeTimeHint: "В активном окне", apps: "Приложения", appsHint: "Использовано за день",
      switches: "Смены контекста", switchesHint: "Между активными окнами", tabs: "Вкладки браузера", tabsHint: "Наблюдавшийся максимум",
      focusTitle: "На что ушёл день", focusSubtitle: "Доля наблюдаемого активного времени", appsTitle: "Главные приложения", appsSubtitle: "Время на переднем плане",
      rhythmTitle: "Ритм активности", rhythmSubtitle: "Наблюдаемые минуты по часам", noTabs: "Не наблюдались",
      tabsCount: "{count} вкладок", inputCount: "{count} действий", latestContext: "Последний видимый контекст",
    },
    ask: {
      title: "Спросить о дне", subtitle: "Ответ строится на этом устройстве из событий последних 48 часов.", skills: "Навыки из потоков",
      localAnswer: "Локальный ответ", examples: "Примеры", examplesText: "Можно спросить про утро, конкретное приложение, период или переходы между задачами.",
      understood: "Понял вопрос как:", engineNote: "LLM не используется: локальный набор правил распознаёт период, приложение и тип вопроса, затем рассчитывает ответ по журналу.", demoInterpretation: "сводка · сегодня утром",
      prompts: ["Что заняло больше всего времени?", "Когда я работал в Figma?", "Где я часто переключался?"],
    },
    skills: {
      title: "Навыки из рабочих потоков", subtitle: "Черновики строятся локально по повторяющимся последовательностям приложений.", create: "Создать SKILL.md",
      emptyTitle: "Повторяющиеся потоки ещё не найдены", emptyText: "Daytrace предложит навык после нескольких похожих рабочих сессий.", saved: "Навык сохранён: {path}", draft: "Локальный черновик навыка: {title}",
    },
    exclusions: {
      title: "Исключения", subtitle: "Эти приложения отбрасываются до того, как событие попадёт на диск.",
      privateTitle: "Приватные окна браузера исключаются автоматически", privateText: "Daytrace распознаёт режимы Incognito, InPrivate и Private Browsing.",
      appTitle: "Не отслеживать приложения", placeholder: "Например, Signal", remove: "Убрать исключение",
    },
    settings: {
      title: "Настройки", subtitle: "Контроль записи, хранения, языка и локальных данных.", language: "Язык", languageText: "На этом языке отображаются интерфейс, таймлайн, локальные ответы, меню трея и экспортированные навыки.",
      activity: "Сбор активности", record: "Записывать активность", recordText: "Переключения окон и включённые обезличенные сигналы ниже", private: "Исключать приватные окна", privateText: "Incognito, InPrivate и Private Browsing отбрасываются до записи", privateWarning: "Выключено: названия приватных окон могут сохраняться локально",
      titles: "Названия окон", titlesText: "Добавляет название активного документа, вкладки или чата, но не читает содержимое", inputs: "Обезличенные счётчики ввода", inputsText: "Считает действия клавиатуры и мыши без записи клавиш, координат и введённого текста", tabs: "Число вкладок браузера", tabsText: "Раз в минуту считывает только количество видимых вкладок браузера",
      system: "Система", autostart: "Запускать при входе", autostartText: "Тихо запускается в трее и начинает локальный сбор", autostartUnavailable: "Доступно в установленном приложении", runtimeText: "Нативный сборщик работает отдельно и пишет только локальные события", accessibility: "Нужен доступ к Универсальному доступу", accessibilityText: "macOS требует разрешение для чтения активного приложения и названия окна.", grantAccess: "Открыть настройки доступа",
      statuses: { running: "Сборщик работает", starting: "Сборщик запускается…", paused: "Сбор на паузе", stopped: "Сборщик остановлен", error: "Сборщику нужно внимание", unavailable: "Нативный сборщик недоступен", "permission-required": "Нужен доступ macOS" },
      data: "Данные", events: "{count} событий", autoDelete: "Автоудаление через {hours} часов", deviceOnly: "Только на устройстве", openData: "Открыть папку данных",
      clear: "Очистить историю", clearText: "Все локальные события будут удалены немедленно и безвозвратно.", deleteAll: "Удалить всё", clearJournal: "Очистить локальный журнал",
    },
    onboarding: {
      eyebrow: "Приватность по умолчанию", title: "Выберите язык", subtitle: "Daytrace полностью работает на этом компьютере. Язык в любой момент можно изменить в настройках.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Ваша активность остаётся на устройстве", privacyText: "Без скриншотов, аудио, введённого текста, аккаунта и облачного хранения.", continue: "Продолжить на русском",
    },
    demo: {
      dataPath: "Локальная папка Daytrace",
      titles: ["studio-tasks.md, roadmap.md, app.ts", "Google Документы — план задач", "Обсуждение задачи в рабочем чате", "models/task.ts, services/api.ts", "components/TaskList.vue, styles.css", "Локальная документация, MDN Web Docs", "UI Kit — Task Board", "Синхронизация по требованиям", "Письмо: уточнения по API"],
      skills: [
        ["Утренний старт проекта", "Повторяющийся поток: план → код → проверка документации.", "2 ч 40 мин"],
        ["Синхронизация требований", "Повторяющийся поток: рабочий чат → макет → письмо с итогом.", "1 ч 15 мин"],
      ],
    },
  },
};

export function text(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ""));
}

export function formatTime(value, language) {
  const t = translations[normalizeLanguage(language)];
  return new Intl.DateTimeFormat(t.locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDuration(ms, language) {
  const lang = normalizeLanguage(language);
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === "ru") return hours ? `${hours} ч${rest ? ` ${rest} мин` : ""}` : `${minutes} мин`;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${minutes} min`;
}

export function formatDay(value, language) {
  const t = translations[normalizeLanguage(language)];
  const day = new Date(value);
  let date = new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "long", year: "numeric" }).format(day).replace(/\s*г\.$/, "");
  let weekday = new Intl.DateTimeFormat(t.locale, { weekday: "long" }).format(day);
  date = date.replace(/^./, (letter) => letter.toUpperCase());
  weekday = weekday.replace(/^./, (letter) => letter.toUpperCase());
  return { date, weekday };
}

export function formatToday(language) {
  return formatDay(Date.now(), language);
}
