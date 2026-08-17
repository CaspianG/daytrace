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
    status: { paused: "Tracking paused", retention: "Keeping {period}", deletion: "Stored since {time}", pause: "Pause", resume: "Resume", update: "Update to {version}", updateChecking: "Checking for updates", updateDownloading: "Downloading {progress}%", updateReady: "Update verified", updateInstalling: "Installing update", updateRestarting: "Restarting Daytrace", updateMacOpened: "DMG opened — finish in Finder", updateFailed: "Update needs attention" },
    question: { placeholder: "Ask about your day, for example: “What was I working on this morning?”", label: "Question about your workday", fallback: "What was I working on this morning?", searching: "Searching…", ask: "Ask" },
    session: { focus: "Activity", intent: "Purpose", delete: "Delete session" },
    intent: {
      unknown: "Unknown purpose",
      labels: { work: "Work", learning: "Learning", personal: "Personal", entertainment: "Entertainment", unknown: "Unknown purpose", mixed: "Mixed purpose" },
      classify: "Correct this context locally",
      reasons: { "custom-rule": "Your local rule for this app or exact context", "window-title": "Meaning of the active title", service: "Recognized active service", "application-category": "Specialized application category", "sequence-context": "Matching automatic evidence on both sides", "session-context": "Several matching automatic signals in this work block", "repeated-context": "Purpose learned from this repeated local context", "best-effort-work-app": "Low-confidence prior for a work tool", "best-effort-research": "Low-confidence research prior", "best-effort-messaging": "Best local estimate for an opaque chat", "best-effort-browser": "Best local estimate for an opaque browser page", "best-effort-application": "Best local estimate from the application type", "needs-context": "General-purpose app needs more context", "conflicting-title-signals": "Conflicting signals", "insufficient-evidence": "Not enough evidence", insufficient: "Not enough evidence" },
    },
    summary: {
      title: "Day summary", generated: "Updated locally, {time}",
      default: "The leading inferred purpose was {intent}. Most observed time was spent in {app}.",
      empty: "Once activity appears, a clear summary of your day will be shown here.",
      how: "How this summary is made", explanation: "Purpose is inferred locally from the active service, the meaning of its visible title, specialized app signals, repeated contexts, and your rules. Opaque contexts receive a visible low-confidence best estimate; a manual correction stays limited to that app or exact browser/chat context.",
      private: "Private browser windows are excluded", excluded: "Selected applications are not tracked",
      grouped: "Grouped by active application and window.",
      details: {
        planning: "Observed time in planning and document applications.",
        development: "Observed time in editors, terminals, developer tools, and clearly identified development pages.",
        communication: "Observed foreground time in messaging, email, and meeting applications. Message contents are not read.",
        design: "Observed time in design and visual-production applications.",
        research: "Browser activity classified as research only when the active title provides supporting evidence.",
        browser: "Foreground browser time that could not be classified more specifically with confidence.",
        ai: "Observed time in AI assistant applications; conversation contents are not read.",
        audio: "Observed time in audio-production applications.",
        remote: "Observed time in remote-desktop or virtual-machine applications.",
        files: "Observed time in local file managers.",
        other: "Foreground activity that Daytrace could not classify confidently.",
        mixed: "A work block containing several categories without one clearly dominant activity.",
      },
      intentDetails: {
        work: "Strong work-related title, surrounding-sequence, or local-rule evidence.",
        learning: "Observed documentation, course, tutorial, research, or study context.",
        personal: "Observed personal context such as family, shopping, health, or travel.",
        entertainment: "Observed entertainment context such as games, streams, films, or series.",
        unknown: "The app and title do not provide enough evidence. Daytrace deliberately does not guess.",
        mixed: "Several purposes were observed without one clearly dominating the period.",
      },
    },
    history: { title: "Latest activity", newestFirst: "Newest first", emptyTitle: "No activity for this day", emptyText: "Leave tracking enabled and switch between your work applications. The first sessions will appear here automatically.", checkSettings: "Check settings" },
    calendar: { title: "Choose a day", previousMonth: "Previous month", nextMonth: "Next month", dataHint: "A dot marks days with stored activity" },
    overview: {
      previousDay: "Previous day", nextDay: "Next day", backToday: "Today",
      activeTime: "Active time", activeTimeHint: "Away time excluded", apps: "Applications", appsHint: "Used this day",
      switches: "Context switches", switchesHint: "Between active windows", tabs: "Browser tabs", tabsHint: "Maximum observed",
      focusTitle: "Activity types", focusSubtitle: "What kind of application was active", intentTitle: "How the time was used", intentSubtitle: "Adaptive local classification with visible confidence", appsTitle: "Top applications", appsSubtitle: "Observed foreground time",
      rhythmTitle: "Activity rhythm", rhythmSubtitle: "Observed minutes by hour", rhythmAction: "Select an hour", rhythmHourTitle: "{time} · {duration}", activeInHour: "{duration} of active time", noActivity: "No observed activity", hourPurpose: "Leading purpose: {purpose}", noTabs: "Not observed",
      tabsCount: "{count} tabs", inputCount: "{count} active seconds", latestContext: "Latest visible context",
    },
    ask: {
      title: "Ask about your day", subtitle: "The answer is built on this device from events stored during the last {period}.", skills: "Skills from workflows",
      localAnswer: "Local answer", examples: "Examples", examplesText: "Ask about the morning, a specific application, a time period, or task switching.",
      understood: "Understood as:", engineNote: "No LLM is used: a local rule engine recognizes the period, application, purpose, and question type, then calculates the answer from your journal.", demoInterpretation: "summary · today morning",
      prompts: ["How long did I work?", "How long did I study?", "What did I do in Telegram?"],
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
      activity: "Activity tracking", record: "Record activity", recordText: "Window switches, foreground context, and local present/away boundaries", private: "Exclude private windows", privateText: "Incognito, InPrivate, and Private Browsing titles are discarded before saving", privateWarning: "Disabled: private-window titles may be recorded locally",
      titles: "Window titles", titlesText: "Adds the active document, tab, or chat name; never reads its contents", inputs: "Anonymous activity samples", inputsText: "Controls aggregate activity counters; away detection stays enabled and never records keys, coordinates, or typed text", tabs: "Browser tab count", tabsText: "Samples only the number of visible browser tabs once per minute",
      analysis: "Local purpose analysis", analysisText: "Daytrace recognizes popular services, understands the active title, uses specialized app categories, and learns only from repeated or strongly confirmed context. Timeline corrections stay scoped to one native app or the exact browser/chat context. Add a broader text rule here only when a private name has one stable meaning.", rulePlaceholder: "For example: Project Atlas or Netflix", rulePurpose: "Purpose", ruleEmpty: "No custom rules yet. Automatic local classification remains active.", removeRule: "Remove rule",
      system: "System", autostart: "Launch at login", autostartText: "Starts quietly in the tray and begins local tracking", autostartUnavailable: "Available in the installed desktop application", runtimeText: "Native collector runs separately and writes only local events", accessibility: "Accessibility permission required", accessibilityText: "macOS requires permission to read the active application and window title.", grantAccess: "Open permission settings",
      updates: "Updates", currentVersion: "Installed version: {version}", availableVersion: "Version {version} is ready", lastChecked: "Last checked: {time}", checkUpdates: "Check for updates", checking: "Checking…", installUpdate: "Update to {version}", downloadMac: "Download {version}", updateError: "The update service could not complete the request. Try again when the internet connection is available.", updatePrivacy: "Daytrace automatically checks GitHub Releases at startup and every six hours. Only the installed version and a standard network request are sent; activity data never leaves the device.",
      updateStatuses: { disabled: "Available in the installed desktop application", idle: "Not checked yet", checking: "Checking GitHub Releases…", available: "A new version is available", "up-to-date": "You have the latest version", offline: "No internet connection; Daytrace will retry automatically", downloading: "Downloading and verifying the update…", ready: "Update verified and ready", installing: "Installing the verified update…", restarting: "Installation started; Daytrace will reopen automatically", "installer-opened": "The macOS installer is open", error: "Update check failed" },
      statuses: { running: "Collector is running", starting: "Collector is starting…", paused: "Tracking is paused", stopped: "Collector is stopped", error: "Collector needs attention", unavailable: "Native collector is unavailable", "permission-required": "Accessibility permission required" },
      data: "Data", events: "{count} recently analyzed events", autoDelete: "Automatically deleted after {period}", deviceOnly: "On this device only", openData: "Open data folder",
      retentionTitle: "History retention", retentionText: "Choose how far back the calendar can open. Longer history stays local and older days are loaded only when selected.", retentionWarning: "Shortening this period immediately deletes events outside the new window. Increasing it cannot restore events already removed.", retentionDurations: { "48": "48 hours", "168": "7 days", "720": "30 days", "2160": "90 days", "8760": "1 year" }, retentionCustom: "{days} days",
      clear: "Clear history", clearText: "All local events will be deleted immediately and permanently.", deleteAll: "Delete everything", clearJournal: "Clear local journal",
    },
    onboarding: {
      eyebrow: "Private by design", title: "Choose your language", subtitle: "Daytrace works entirely on this computer. You can change the language at any time in Settings.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Your activity stays on this device", privacyText: "No screenshots, audio, typed text, account, or cloud storage.", continue: "Continue in English",
      permissionEyebrow: "One required macOS permission", permissionTitle: "Allow Daytrace to observe the active window", permissionSubtitle: "Without Accessibility access, macOS does not let Daytrace see which application and window are active, so the timeline remains empty.",
      permissionStepOne: "Click Allow access below.", permissionStepTwo: "Turn on Daytrace in Privacy & Security → Accessibility.", permissionStepThree: "Return to Daytrace — tracking starts automatically.",
      permissionPrivacy: "Daytrace reads only safe active-window metadata. It never records keys, typed text, screenshots, audio, or clipboard contents.", permissionGrant: "Allow access", permissionWaiting: "Waiting for macOS permission…", permissionLater: "Continue without tracking",
    },
    demo: {
      dataPath: "Local Daytrace folder",
      titles: ["studio-tasks.md, roadmap.md, app.ts", "Google Docs — task plan", "Project Atlas — team chat", "models/task.ts, services/api.ts", "components/TaskList.vue, styles.css", "Local documentation, MDN Web Docs", "UI Kit — Task Board", "Friends", "Release checklist"],
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
    status: { paused: "Сбор на паузе", retention: "Храню {period}", deletion: "Данные с {time}", pause: "Приостановить", resume: "Продолжить", update: "Обновить до {version}", updateChecking: "Проверяю обновления", updateDownloading: "Скачиваю {progress}%", updateReady: "Обновление проверено", updateInstalling: "Устанавливаю обновление", updateRestarting: "Перезапускаю Daytrace", updateMacOpened: "DMG открыт — завершите в Finder", updateFailed: "Обновлению нужно внимание" },
    question: { placeholder: "Спросить о дне, например: «Над чем я работал сегодня с утра?»", label: "Вопрос о рабочем дне", fallback: "Над чем я работал сегодня с утра?", searching: "Ищу…", ask: "Спросить" },
    session: { focus: "Активность", intent: "Цель", delete: "Удалить сессию" },
    intent: {
      unknown: "Цель не определена",
      labels: { work: "Работа", learning: "Обучение", personal: "Личное", entertainment: "Развлечения", unknown: "Цель не определена", mixed: "Смешанная цель" },
      classify: "Исправить этот контекст локально",
      reasons: { "custom-rule": "Ваше локальное правило для приложения или точного контекста", "window-title": "Смысл активного заголовка", service: "Распознан активный сервис", "application-category": "Категория специализированного приложения", "sequence-context": "Совпадающие автоматические сигналы с обеих сторон", "session-context": "Несколько совпадающих автоматических сигналов в этом блоке", "repeated-context": "Цель изучена по повторяющемуся локальному контексту", "best-effort-work-app": "Предварительная оценка рабочего инструмента", "best-effort-research": "Предварительная оценка исследования", "best-effort-messaging": "Лучшая локальная оценка непрозрачного чата", "best-effort-browser": "Лучшая локальная оценка непрозрачной страницы", "best-effort-application": "Лучшая локальная оценка по типу приложения", "needs-context": "Универсальному приложению нужен дополнительный контекст", "conflicting-title-signals": "Противоречивые сигналы", "insufficient-evidence": "Недостаточно данных", insufficient: "Недостаточно данных" },
    },
    summary: {
      title: "Итог дня", generated: "Обновлено локально, {time}",
      default: "Главная предполагаемая цель — «{intent}». Больше всего наблюдаемого времени заняло приложение {app}.",
      empty: "Как только появится активность, здесь будет аккуратный итог дня.",
      how: "Как формируется итог", explanation: "Цель определяется локально по активному сервису, смыслу видимого заголовка, категории специализированного приложения, повторяющемуся контексту и вашим правилам. Непрозрачные записи получают видимую предварительную оценку с низкой уверенностью, а ручная правка остаётся в пределах приложения или точного контекста браузера/чата.",
      private: "Приватные окна браузера исключены", excluded: "Заданные приложения не отслеживаются",
      grouped: "Сгруппировано по активному приложению и окну.",
      details: {
        planning: "Наблюдаемое время в приложениях для планирования и документов.",
        development: "Наблюдаемое время в редакторах, терминалах, инструментах разработчика и явно распознанных страницах разработки.",
        communication: "Наблюдаемое время активного окна мессенджеров, почты и встреч. Содержимое сообщений не читается.",
        design: "Наблюдаемое время в приложениях для дизайна и визуальной работы.",
        research: "Браузер относится к исследованию только при наличии подтверждающих слов в активном заголовке.",
        browser: "Активное время браузера, которое нельзя уверенно отнести к более точной категории.",
        ai: "Наблюдаемое время в приложениях ИИ-ассистентов. Содержимое диалогов не читается.",
        audio: "Наблюдаемое время в приложениях для работы со звуком.",
        remote: "Наблюдаемое время в удалённом рабочем столе или виртуальной машине.",
        files: "Наблюдаемое время в локальных файловых менеджерах.",
        other: "Активность, которую Daytrace не смог уверенно классифицировать.",
        mixed: "Рабочий блок с несколькими категориями, среди которых нет одной явно преобладающей.",
      },
      intentDetails: {
        work: "Есть явные рабочие признаки в заголовке, соседней последовательности или локальном правиле.",
        learning: "Наблюдался контекст документации, курса, урока, исследования или изучения.",
        personal: "Наблюдался личный контекст: семья, покупки, здоровье, поездки и подобное.",
        entertainment: "Наблюдался развлекательный контекст: игры, стримы, фильмы или сериалы.",
        unknown: "Приложение и заголовок не дают достаточных оснований. Daytrace намеренно не угадывает.",
        mixed: "Наблюдалось несколько целей без одной явно преобладающей.",
      },
    },
    history: { title: "Последняя активность", newestFirst: "Сначала новое", emptyTitle: "За этот день активности нет", emptyText: "Оставьте сбор включённым и переключитесь между рабочими приложениями. Первые сессии появятся здесь автоматически.", checkSettings: "Проверить настройки" },
    calendar: { title: "Выбрать день", previousMonth: "Предыдущий месяц", nextMonth: "Следующий месяц", dataHint: "Точкой отмечены дни с сохранённой активностью" },
    overview: {
      previousDay: "Предыдущий день", nextDay: "Следующий день", backToday: "Сегодня",
      activeTime: "Активное время", activeTimeHint: "Без времени отсутствия", apps: "Приложения", appsHint: "Использовано за день",
      switches: "Смены контекста", switchesHint: "Между активными окнами", tabs: "Вкладки браузера", tabsHint: "Наблюдавшийся максимум",
      focusTitle: "Типы активности", focusSubtitle: "Какое приложение было активно", intentTitle: "Как использовалось время", intentSubtitle: "Адаптивная локальная классификация с видимой уверенностью", appsTitle: "Главные приложения", appsSubtitle: "Наблюдаемое время активного окна",
      rhythmTitle: "Ритм активности", rhythmSubtitle: "Наблюдаемые минуты по часам", rhythmAction: "Выберите час", rhythmHourTitle: "{time} · {duration}", activeInHour: "{duration} активного времени", noActivity: "Активность не наблюдалась", hourPurpose: "Главная цель: {purpose}", noTabs: "Не наблюдались",
      tabsCount: "{count} вкладок", inputCount: "{count} активных секунд", latestContext: "Последний видимый контекст",
    },
    ask: {
      title: "Спросить о дне", subtitle: "Ответ строится на этом устройстве из событий за последние {period}.", skills: "Навыки из потоков",
      localAnswer: "Локальный ответ", examples: "Примеры", examplesText: "Можно спросить про утро, конкретное приложение, период или переходы между задачами.",
      understood: "Понял вопрос как:", engineNote: "LLM не используется: локальный набор правил распознаёт период, приложение, цель и тип вопроса, затем рассчитывает ответ по журналу.", demoInterpretation: "сводка · сегодня утром",
      prompts: ["Сколько времени я работал?", "Сколько времени я учился?", "Что я делал в Telegram?"],
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
      activity: "Сбор активности", record: "Записывать активность", recordText: "Переключения окон, активный контекст и локальные границы присутствия и отсутствия", private: "Исключать приватные окна", privateText: "Incognito, InPrivate и Private Browsing отбрасываются до записи", privateWarning: "Выключено: названия приватных окон могут сохраняться локально",
      titles: "Названия окон", titlesText: "Добавляет название активного документа, вкладки или чата, но не читает содержимое", inputs: "Обезличенный сигнал активности", inputsText: "Управляет суммарными счётчиками активности; определение отсутствия остаётся включённым и не записывает клавиши, координаты и введённый текст", tabs: "Число вкладок браузера", tabsText: "Раз в минуту считывает только количество видимых вкладок браузера",
      analysis: "Локальный анализ цели", analysisText: "Daytrace распознаёт популярные сервисы, понимает активный заголовок, учитывает категории специализированных программ и учится только по повторяющемуся или надёжно подтверждённому контексту. Правка в таймлайне действует только для одного нативного приложения или точного контекста браузера/чата. Более широкое правило добавляйте здесь, только если приватное название всегда имеет один смысл.", rulePlaceholder: "Например: Проект Атлас или Netflix", rulePurpose: "Цель", ruleEmpty: "Пользовательских правил пока нет. Автоматическая локальная классификация продолжает работать.", removeRule: "Удалить правило",
      system: "Система", autostart: "Запускать при входе", autostartText: "Тихо запускается в трее и начинает локальный сбор", autostartUnavailable: "Доступно в установленном приложении", runtimeText: "Нативный сборщик работает отдельно и пишет только локальные события", accessibility: "Нужен доступ к Универсальному доступу", accessibilityText: "macOS требует разрешение для чтения активного приложения и названия окна.", grantAccess: "Открыть настройки доступа",
      updates: "Обновления", currentVersion: "Установленная версия: {version}", availableVersion: "Доступна версия {version}", lastChecked: "Последняя проверка: {time}", checkUpdates: "Проверить обновления", checking: "Проверяю…", installUpdate: "Обновить до {version}", downloadMac: "Скачать {version}", updateError: "Не удалось завершить проверку или установку. Повторите, когда интернет будет доступен.", updatePrivacy: "Daytrace автоматически проверяет GitHub Releases при запуске и раз в шесть часов. Передаётся только установленная версия и обычный сетевой запрос; данные активности никогда не покидают устройство.",
      updateStatuses: { disabled: "Доступно в установленном приложении", idle: "Обновления ещё не проверялись", checking: "Проверяю GitHub Releases…", available: "Доступна новая версия", "up-to-date": "Установлена последняя версия", offline: "Нет интернета; Daytrace повторит проверку автоматически", downloading: "Скачиваю и проверяю обновление…", ready: "Обновление проверено и готово", installing: "Устанавливаю проверенное обновление…", restarting: "Установка запущена; Daytrace откроется автоматически", "installer-opened": "Установщик macOS открыт", error: "Не удалось проверить обновления" },
      statuses: { running: "Сборщик работает", starting: "Сборщик запускается…", paused: "Сбор на паузе", stopped: "Сборщик остановлен", error: "Сборщику нужно внимание", unavailable: "Нативный сборщик недоступен", "permission-required": "Нужен доступ macOS" },
      data: "Данные", events: "{count} недавно проанализированных событий", autoDelete: "Автоудаление через {period}", deviceOnly: "Только на устройстве", openData: "Открыть папку данных",
      retentionTitle: "Срок хранения истории", retentionText: "Выберите, насколько далеко можно возвращаться в календаре. Долгая история остаётся локальной, а старые дни загружаются только при выборе.", retentionWarning: "Уменьшение срока сразу удалит события за пределами нового периода. Увеличение не восстановит уже удалённые данные.", retentionDurations: { "48": "48 часов", "168": "7 дней", "720": "30 дней", "2160": "90 дней", "8760": "1 год" }, retentionCustom: "{days} дней",
      clear: "Очистить историю", clearText: "Все локальные события будут удалены немедленно и безвозвратно.", deleteAll: "Удалить всё", clearJournal: "Очистить локальный журнал",
    },
    onboarding: {
      eyebrow: "Приватность по умолчанию", title: "Выберите язык", subtitle: "Daytrace полностью работает на этом компьютере. Язык в любой момент можно изменить в настройках.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Ваша активность остаётся на устройстве", privacyText: "Без скриншотов, аудио, введённого текста, аккаунта и облачного хранения.", continue: "Продолжить на русском",
      permissionEyebrow: "Одно обязательное разрешение macOS", permissionTitle: "Разрешите Daytrace видеть активное окно", permissionSubtitle: "Без доступа к Универсальному доступу macOS не сообщает Daytrace, какое приложение и окно активно, поэтому история остаётся пустой.",
      permissionStepOne: "Нажмите «Разрешить доступ» ниже.", permissionStepTwo: "Включите Daytrace в разделе «Конфиденциальность и безопасность» → «Универсальный доступ».", permissionStepThree: "Вернитесь в Daytrace — сбор запустится автоматически.",
      permissionPrivacy: "Daytrace читает только безопасные метаданные активного окна. Нажатия клавиш, введённый текст, скриншоты, аудио и буфер обмена не записываются.", permissionGrant: "Разрешить доступ", permissionWaiting: "Ожидаю разрешение macOS…", permissionLater: "Продолжить без сбора",
    },
    demo: {
      dataPath: "Локальная папка Daytrace",
      titles: ["studio-tasks.md, roadmap.md, app.ts", "Google Документы — план задач", "Проект Атлас — командный чат", "models/task.ts, services/api.ts", "components/TaskList.vue, styles.css", "Локальная документация, MDN Web Docs", "UI Kit — Task Board", "Друзья", "Чек-лист релиза"],
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
