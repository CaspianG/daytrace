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
    status: { paused: "Tracking paused", retention: "Keeping {period}", historyStart: "History starts {time}", historyEmpty: "No history recorded yet", pause: "Pause", resume: "Resume", update: "Update to {version}", updateChecking: "Checking for updates", updateDownloading: "Downloading {progress}%", updateReady: "Update verified", updateInstalling: "Installing update", updateRestarting: "Restarting Daytrace", updateMacOpened: "Automatic replacement blocked — finish in Finder", updateWindowsOpened: "Automatic replacement needs confirmation — installer opened", updateFailed: "Update needs attention" },
    question: { placeholder: "Ask about your day, for example: “What was I working on this morning?”", label: "Question about your workday", fallback: "What was I working on this morning?", searching: "Searching…", ask: "Ask" },
    session: { focus: "Activity", intent: "Purpose", delete: "Delete session" },
    intent: {
      unknown: "Ambiguous purpose",
      labels: { work: "Work", learning: "Learning", personal: "Personal", entertainment: "Entertainment", unknown: "Ambiguous purpose", mixed: "Mixed purpose" },
      classify: "Correct this context locally", fact: "Observed fact", why: "Why Daytrace inferred this purpose", confidence: "Confidence: {percent}%", factPurposeNote: "The observed context is factual metadata. Purpose is a local inference and can be corrected.",
      evidenceKinds: { application: "Application", "window-title": "Visible title", domain: "Domain", "classification-signal": "Matched signal", activity: "Observed context" },
      previewTitle: "Review the effect of this rule", previewText: "This local correction will change {count} activities ({duration}) across {days} stored days.", applyRule: "Apply correction", applying: "Applying…", ruleApplied: "Correction applied only to its selected scope.", undo: "Undo", undoLastRuleChange: "Undo the last rule change", reviewCount: "{count} contexts need review", reviewHint: "Factual activity is preserved; only uncertain purpose needs your decision.",
      reasons: { "custom-rule": "Your local rule for this app or exact context", "smart-model": "Optional local signal pack; processed only safe stored metadata", "semantic-model": "Optional local semantic model; matched the meaning of this exact context", "window-title": "Meaning of the active title", service: "Recognized active service", "application-category": "Specialized application category", "sequence-context": "Matching automatic evidence on both sides", "session-context": "Several matching automatic signals in this work block", "repeated-context": "Purpose learned from this repeated local context", "best-effort-work-app": "Low-confidence prior for a work tool", "best-effort-research": "Low-confidence research prior", "best-effort-messaging": "Best local estimate for an opaque chat", "best-effort-browser": "Best local estimate for an opaque browser page", "best-effort-application": "Best local estimate from the application type", "needs-context": "General-purpose app needs more context", "conflicting-title-signals": "Conflicting signals", "insufficient-evidence": "Not enough evidence", insufficient: "Not enough evidence" },
    },
    summary: {
      title: "Day summary", generated: "Updated locally, {time}",
      default: "The leading inferred purpose was {intent}. Most observed time was spent in {app}.",
      empty: "Once activity appears, a clear summary of your day will be shown here.",
      how: "How this summary is made", explanation: "Observed application, title, domain, and active time stay factual. Purpose is inferred separately from local signals; ambiguous contexts remain visibly ambiguous. A manual correction is previewed and stays limited to its selected app or exact browser/chat context.",
      private: "Private browser windows are excluded", excluded: "Selected applications are not tracked", themes: "Main contexts", completed: "Likely completed", openLoops: "Still open", interruptions: "Long breaks and returns", interruptionItem: "{duration} away; returned to {context}",
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
      understood: "Understood as:", engineNote: "The base mode uses no LLM: a local parser handles dates, comparisons, applications, purposes, and question types. If the optional signal pack is enabled, it runs only on safe stored metadata in a short-lived local worker.", demoInterpretation: "summary · today morning",
      prompts: ["Compare this week with last week", "What did I do on August 12?", "What did I do in Telegram?"],
    },
    skills: {
      title: "Skills from work patterns", subtitle: "Drafts are built locally from repeated application sequences.", create: "Create SKILL.md",
      emptyTitle: "No repeated workflows found yet", emptyText: "Daytrace will suggest a skill after several similar work sessions.", saved: "Skill saved: {path}", draft: "Local skill draft: {title}",
    },
    exclusions: {
      title: "Exclusions", subtitle: "These applications are discarded before an event can be written to disk.",
      privateTitle: "Private browser windows are excluded automatically", privateText: "Daytrace recognizes Chrome Incognito, Edge InPrivate, Firefox Private Browsing, and Safari Private Browsing.",
      appTitle: "Do not track applications", placeholder: "For example, Signal", remove: "Remove exclusion",
    },
    settings: {
      title: "Settings", subtitle: "Control recording, storage, language, and local data.", language: "Language", languageText: "The interface, timeline labels, local answers, tray menu, and exported skills use this language.",
      activity: "Activity tracking", actionFailed: "The setting was not changed. Try again; if this repeats, open the local data folder and check startup.log.", record: "Record activity", recordText: "Window switches, foreground context, and local present/away boundaries", private: "Exclude private windows", privateText: "Incognito, InPrivate, and Private Browsing titles are discarded before saving", privateWarning: "Disabled: private-window titles may be recorded locally",
      titles: "Window titles", titlesText: "Adds the active document, tab, or chat name; never reads its contents", inputs: "Anonymous activity samples", inputsText: "Controls aggregate activity counters; away detection stays enabled and never records keys, coordinates, or typed text", tabs: "Browser tab count", tabsText: "Samples only the number of visible browser tabs once per minute",
      analysis: "Local purpose analysis", analysisText: "Daytrace recognizes popular services, understands the active title, uses specialized app categories, and learns only from repeated or strongly confirmed context. Timeline corrections stay scoped to one native app or the exact browser/chat context. Add a broader text rule here only when a private name has one stable meaning.", rulePlaceholder: "For example: Project Atlas or Netflix", rulePurpose: "Purpose", ruleEmpty: "No custom rules yet. Automatic local classification remains active.", removeRule: "Remove rule",
      reviewTitle: "Low-confidence review journal", reviewText: "Ambiguous purposes stay here instead of being silently labeled personal.", reviewEmpty: "No recent contexts need review.",
      smartAnalysis: "Local analysis mode", smartTitle: "Choose how Daytrace interprets activity", smartText: "The built-in classifier stays instant and lightweight. Two optional local refiners can improve ambiguous titles without sending activity data anywhere.", analysisMode: "Analysis mode", analysisBuiltin: "Built-in", analysisBuiltinText: "Fast deterministic rules for known apps, services, and context.", analysisNoDownload: "0 MB · always available", analysisSignals: "Signal pack 1.1", analysisSignalsText: "Transparent RU/EN word and phrase weights. Useful for clear keywords.", analysisSignalsSize: "about 6 KB", analysisSemantic: "Semantic model 1.0", analysisSemanticText: "Small RU+EN sentence encoders compare meaning, not only exact words.", analysisBuiltinPrivacy: "No model is loaded in this mode. Classification happens immediately as an event is stored.", smartInstalled: "Signal pack {version} is installed locally ({size})", smartOutdated: "Signal pack {version} is installed; version 1.1 is available", smartNotInstalled: "The signal pack is not installed", smartRunning: "Analyzing locally…", smartDownload: "Download signal pack (~6 KB)", smartUpdate: "Update signal pack", smartFile: "Install signal-pack file", smartRun: "Analyze now", smartRemove: "Remove signal pack", smartApproxSize: "about 6 KB", semanticApproxSize: "about 48 MB", semanticInstalled: "Semantic model {version} is installed locally ({size})", semanticNotInstalled: "Semantic model is not installed ({size})", semanticDownloading: "Downloading and verifying…", semanticDownload: "Download semantic model (~48 MB)", semanticRemove: "Remove semantic model", semanticProgress: "Semantic model progress", kilobytes: "KB", megabytes: "MB", smartPrivacy: "The tiny download can finish almost instantly. Its request contains no activity data; analysis receives only the safe app, title, and domain metadata already stored by Daytrace.", semanticPrivacy: "This is not a chat or generative LLM. It runs only for a short batch of ambiguous titles, uses one CPU thread, then unloads. Model files are verified before use; activity never leaves this device.", analysisLastResult: "Last local pass", analysisResultMetrics: "Reviewed: {candidates} · refined: {refined} · changed: {changed}",
      browserCompanion: "Browser companion", browserTitle: "Foreground tab context", browserText: "Optional native-messaging extension adds domain, safe path, title, and an explicit private flag.", browserUnavailable: "Available in the installed Windows or macOS application", browserConnected: "Browser companion is connected", browserWaiting: "Local host is running; load the extension to connect", browserStopped: "Local host is stopped", browserInstallHost: "Install local host", browserOpenFolder: "Open extension folder", browserPrivacy: "Query strings, fragments, credentials, page contents, and private tabs are never stored. Incognito access is disabled by the extension and rejected again before disk.",
      system: "System", autostart: "Launch at login", autostartText: "Starts quietly in the tray and begins local tracking", autostartUnavailable: "Available in the installed desktop application", runtimeText: "Native collector runs separately and writes only local events", accessibility: "Accessibility permission required", accessibilityText: "This is the only required macOS permission. Daytrace checks it through the real native collector when you return from settings.", grantAccess: "Open permission settings", restartAfterAccess: "Restart only if needed",
      diagnosticsTitle: "Self-diagnostics", diagnosticsText: "Checks the collector, local storage, title signal, idle boundaries, private filtering, autostart, browser companion, and selected optional analysis engine.", diagnosticsRun: "Run checks", diagnosticStatuses: { pass: "Works", warn: "Needs observation", fail: "Needs attention", "not-applicable": "Not applicable" }, diagnosticChecks: { storage: "Local data is writable", tracker: "Native collector", collector: "Collector executable", accessibility: "macOS Accessibility", titles: "Active titles arrive", idle: "Away detection", private: "Private windows are rejected", autostart: "Launch at login", browser: "Browser companion", smart: "Optional analysis engine" },
      accessibilityInstallIssues: { "duplicate-copy": "This copy is named {name}. macOS can grant a different Daytrace copy instead. Remove duplicate Daytrace apps, keep /Applications/Daytrace.app, open that copy, and grant it access. Current path: {path}", "disk-image": "Daytrace is running from the mounted installer. Drag it to Applications, close this copy, open /Applications/Daytrace.app, and grant that installed copy access. Current path: {path}", "outside-applications": "Move this copy to /Applications/Daytrace.app before granting access so macOS keeps one stable permission. Current path: {path}", "unknown-location": "macOS cannot identify this Daytrace copy reliably. Keep one copy named Daytrace.app in Applications, reopen it, and grant that copy access." },
      updates: "Updates", currentVersion: "Installed version: {version}", availableVersion: "Version {version} is ready", lastChecked: "Last checked: {time}", checkUpdates: "Check for updates", checking: "Checking…", installUpdate: "Update to {version}", downloadMac: "Download {version}", updateError: "The update service could not complete the request. Try again when the internet connection is available.", updatePrivacy: "Daytrace automatically checks GitHub Releases at startup and every six hours. Only the installed version and a standard network request are sent; activity data never leaves the device.",
      updateStatuses: { disabled: "Available in the installed desktop application", idle: "Not checked yet", checking: "Checking GitHub Releases…", available: "A new version is available", "up-to-date": "You have the latest version", offline: "No internet connection; Daytrace will retry automatically", downloading: "Downloading and verifying the update…", ready: "Update verified and ready", installing: "Replacing the installed app with the verified update…", restarting: "Update installed; Daytrace will reopen automatically", "installer-opened": "macOS blocked automatic replacement, so the verified DMG is open as a fallback. Quit Daytrace, drag Daytrace.app to Applications, choose Replace — not Keep Both — then open it again.", "windows-installer-opened": "Daytrace could not safely replace this installation automatically. The verified Windows installer is open; follow its prompts, then reopen Daytrace.", error: "Update check failed" },
      statuses: { running: "Collector is running", starting: "Collector is starting…", paused: "Tracking is paused", stopped: "Collector is stopped", error: "Collector needs attention", unavailable: "Native collector is unavailable", "permission-required": "Collector is waiting for Accessibility permission" },
      data: "Data", events: "{count} recently analyzed events", autoDelete: "Automatically deleted after {period}", deviceOnly: "On this device only", openData: "Open data folder",
      backup: "Encrypted backup", restore: "Restore", backupText: "JSON and CSV are readable exports. A .daytrace backup encrypts settings, retained events, skills, and local smart context with AES-256-GCM before writing.", backupTitle: "Create an encrypted backup", restoreTitle: "Restore a backup transactionally", passphrase: "Passphrase", passphraseText: "At least 8 characters. It is never stored and cannot be recovered by Daytrace.", fileReady: "File ready: {path}",
      retentionTitle: "History retention", retentionText: "Choose how far back the calendar can open. Longer history stays local and older days are loaded only when selected.", retentionWarning: "Shortening this period immediately deletes events outside the new window. Increasing it cannot restore events already removed.", retentionDurations: { "48": "48 hours", "168": "7 days", "720": "30 days", "2160": "90 days", "8760": "1 year" }, retentionCustom: "{days} days",
      clear: "Clear history", clearText: "All local events will be deleted immediately and permanently.", deleteAll: "Delete everything", clearJournal: "Clear local journal",
    },
    onboarding: {
      eyebrow: "Private by design", title: "Choose your language", subtitle: "Daytrace works entirely on this computer. You can change the language at any time in Settings.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Your activity stays on this device", privacyText: "No screenshots, audio, typed text, account, or cloud storage.", continue: "Continue in English",
      permissionEyebrow: "One required macOS permission", permissionTitle: "Allow Daytrace to observe the active window", permissionSubtitle: "Without Accessibility access, macOS does not let Daytrace see which application and window are active, so the timeline remains empty.",
      permissionStepOne: "Click Allow access below.", permissionStepTwo: "Turn on the exact /Applications/Daytrace.app copy in Privacy & Security → Accessibility.", permissionStepThree: "Return to Daytrace. It checks the native collector automatically; no restart is normally needed.",
      permissionCopyTitle: "macOS sees more than one copy", permissionRepairTitle: "Already enabled it but still see this screen?", permissionRepairText: "In Accessibility, remove every old Daytrace or Daytrace 2 entry with the minus button. Click plus, select /Applications/Daytrace.app, turn it on, then return here and click Check again.", permissionPrivacy: "Daytrace reads only safe active-window metadata. It never records keys, typed text, screenshots, audio, or clipboard contents.", permissionGrant: "Allow access", permissionWaiting: "Opening macOS settings…", permissionCheck: "Check again", permissionChecking: "Checking the native collector…", permissionRestart: "Restart only if macOS still has not applied it", permissionLater: "Open Daytrace without tracking",
    },
    demo: {
      dataPath: "Local Daytrace folder",
      brief: "Three hours of observed active time. Main contexts: implementation, task plan, and team coordination.", completed: "Release checklist — completed", openLoop: "API review — in progress",
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
    status: { paused: "Сбор на паузе", retention: "Храню {period}", historyStart: "История началась {time}", historyEmpty: "История пока не записана", pause: "Приостановить", resume: "Продолжить", update: "Обновить до {version}", updateChecking: "Проверяю обновления", updateDownloading: "Скачиваю {progress}%", updateReady: "Обновление проверено", updateInstalling: "Устанавливаю обновление", updateRestarting: "Перезапускаю Daytrace", updateMacOpened: "Автозамена заблокирована — завершите в Finder", updateWindowsOpened: "Для автозамены нужно подтверждение — установщик открыт", updateFailed: "Обновлению нужно внимание" },
    question: { placeholder: "Спросить о дне, например: «Над чем я работал сегодня с утра?»", label: "Вопрос о рабочем дне", fallback: "Над чем я работал сегодня с утра?", searching: "Ищу…", ask: "Спросить" },
    session: { focus: "Активность", intent: "Цель", delete: "Удалить сессию" },
    intent: {
      unknown: "Неоднозначная цель",
      labels: { work: "Работа", learning: "Обучение", personal: "Личное", entertainment: "Развлечения", unknown: "Неоднозначная цель", mixed: "Смешанная цель" },
      classify: "Исправить этот контекст локально", fact: "Наблюдаемый факт", why: "Почему Daytrace предположил эту цель", confidence: "Уверенность: {percent}%", factPurposeNote: "Наблюдаемый контекст — фактические метаданные. Цель — локальное предположение, которое можно исправить.",
      evidenceKinds: { application: "Приложение", "window-title": "Видимый заголовок", domain: "Домен", "classification-signal": "Совпавший сигнал", activity: "Наблюдаемый контекст" },
      previewTitle: "Проверьте область действия правила", previewText: "Эта локальная правка изменит {count} записей ({duration}) за {days} сохранённых дней.", applyRule: "Применить правку", applying: "Применяю…", ruleApplied: "Правка применена только к выбранной области.", undo: "Отменить", undoLastRuleChange: "Отменить последнее изменение правил", reviewCount: "Нужно проверить контексты: {count}", reviewHint: "Фактическая активность сохранена; уточнения требует только предполагаемая цель.",
      reasons: { "custom-rule": "Ваше локальное правило для приложения или точного контекста", "smart-model": "Опциональный локальный пакет сигналов обработал только безопасные сохранённые метаданные", "semantic-model": "Опциональная локальная семантическая модель сопоставила смысл этого точного контекста", "window-title": "Смысл активного заголовка", service: "Распознан активный сервис", "application-category": "Категория специализированного приложения", "sequence-context": "Совпадающие автоматические сигналы с обеих сторон", "session-context": "Несколько совпадающих автоматических сигналов в этом блоке", "repeated-context": "Цель изучена по повторяющемуся локальному контексту", "best-effort-work-app": "Предварительная оценка рабочего инструмента", "best-effort-research": "Предварительная оценка исследования", "best-effort-messaging": "Лучшая локальная оценка непрозрачного чата", "best-effort-browser": "Лучшая локальная оценка непрозрачной страницы", "best-effort-application": "Лучшая локальная оценка по типу приложения", "needs-context": "Универсальному приложению нужен дополнительный контекст", "conflicting-title-signals": "Противоречивые сигналы", "insufficient-evidence": "Недостаточно данных", insufficient: "Недостаточно данных" },
    },
    summary: {
      title: "Итог дня", generated: "Обновлено локально, {time}",
      default: "Главная предполагаемая цель — «{intent}». Больше всего наблюдаемого времени заняло приложение {app}.",
      empty: "Как только появится активность, здесь будет аккуратный итог дня.",
      how: "Как формируется итог", explanation: "Приложение, заголовок, домен и активное время остаются наблюдаемыми фактами. Цель выводится отдельно из локальных сигналов; неоднозначный контекст так и помечается. Область ручной правки показывается заранее и ограничивается выбранным приложением или точным контекстом браузера/чата.",
      private: "Приватные окна браузера исключены", excluded: "Заданные приложения не отслеживаются", themes: "Главные контексты", completed: "Вероятно завершено", openLoops: "Осталось открытым", interruptions: "Долгие перерывы и возвраты", interruptionItem: "Перерыв {duration}; возврат к «{context}»",
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
      understood: "Понял вопрос как:", engineNote: "Базовый режим работает без LLM: локальный разборщик понимает даты, сравнения, приложения, цели и тип вопроса. Опциональный пакет сигналов запускается кратким локальным процессом только на безопасных сохранённых метаданных.", demoInterpretation: "сводка · сегодня утром",
      prompts: ["Сравни эту неделю с прошлой", "Что я делал 12 августа?", "Что я делал в Telegram?"],
    },
    skills: {
      title: "Навыки из рабочих потоков", subtitle: "Черновики строятся локально по повторяющимся последовательностям приложений.", create: "Создать SKILL.md",
      emptyTitle: "Повторяющиеся потоки ещё не найдены", emptyText: "Daytrace предложит навык после нескольких похожих рабочих сессий.", saved: "Навык сохранён: {path}", draft: "Локальный черновик навыка: {title}",
    },
    exclusions: {
      title: "Исключения", subtitle: "Эти приложения отбрасываются до того, как событие попадёт на диск.",
      privateTitle: "Приватные окна браузера исключаются автоматически", privateText: "Daytrace распознаёт Chrome Incognito, Edge InPrivate, приватные окна Firefox и Safari.",
      appTitle: "Не отслеживать приложения", placeholder: "Например, Signal", remove: "Убрать исключение",
    },
    settings: {
      title: "Настройки", subtitle: "Контроль записи, хранения, языка и локальных данных.", language: "Язык", languageText: "На этом языке отображаются интерфейс, таймлайн, локальные ответы, меню трея и экспортированные навыки.",
      activity: "Сбор активности", actionFailed: "Настройка не изменилась. Повторите попытку; если ошибка повторяется, откройте папку локальных данных и проверьте startup.log.", record: "Записывать активность", recordText: "Переключения окон, активный контекст и локальные границы присутствия и отсутствия", private: "Исключать приватные окна", privateText: "Incognito, InPrivate и Private Browsing отбрасываются до записи", privateWarning: "Выключено: названия приватных окон могут сохраняться локально",
      titles: "Названия окон", titlesText: "Добавляет название активного документа, вкладки или чата, но не читает содержимое", inputs: "Обезличенный сигнал активности", inputsText: "Управляет суммарными счётчиками активности; определение отсутствия остаётся включённым и не записывает клавиши, координаты и введённый текст", tabs: "Число вкладок браузера", tabsText: "Раз в минуту считывает только количество видимых вкладок браузера",
      analysis: "Локальный анализ цели", analysisText: "Daytrace распознаёт популярные сервисы, понимает активный заголовок, учитывает категории специализированных программ и учится только по повторяющемуся или надёжно подтверждённому контексту. Правка в таймлайне действует только для одного нативного приложения или точного контекста браузера/чата. Более широкое правило добавляйте здесь, только если приватное название всегда имеет один смысл.", rulePlaceholder: "Например: Проект Атлас или Netflix", rulePurpose: "Цель", ruleEmpty: "Пользовательских правил пока нет. Автоматическая локальная классификация продолжает работать.", removeRule: "Удалить правило",
      reviewTitle: "Журнал низкой уверенности", reviewText: "Неоднозначные цели остаются здесь, а не получают скрытую метку «Личное».", reviewEmpty: "Недавних контекстов для проверки нет.",
      smartAnalysis: "Режим локального анализа", smartTitle: "Как Daytrace будет понимать активность", smartText: "Встроенный классификатор остаётся мгновенным и лёгким. Два опциональных локальных режима могут уточнять неоднозначные заголовки, не отправляя активность наружу.", analysisMode: "Режим анализа", analysisBuiltin: "Встроенный", analysisBuiltinText: "Быстрые прозрачные правила для известных программ, сервисов и контекста.", analysisNoDownload: "0 МБ · доступен всегда", analysisSignals: "Пакет сигналов 1.1", analysisSignalsText: "Прозрачные веса RU/EN-слов и фраз. Полезен для явных ключевых слов.", analysisSignalsSize: "около 6 КБ", analysisSemantic: "Семантическая модель 1.0", analysisSemanticText: "Небольшие RU+EN-энкодеры сравнивают смысл, а не только точные слова.", analysisBuiltinPrivacy: "В этом режиме модель не загружается. Классификация выполняется сразу при сохранении события.", smartInstalled: "Пакет сигналов {version} установлен локально ({size})", smartOutdated: "Установлен пакет сигналов {version}; доступна версия 1.1", smartNotInstalled: "Пакет сигналов не установлен", smartRunning: "Анализирую локально…", smartDownload: "Скачать пакет (~6 КБ)", smartUpdate: "Обновить пакет сигналов", smartFile: "Установить файл пакета", smartRun: "Проанализировать сейчас", smartRemove: "Удалить пакет", smartApproxSize: "около 6 КБ", semanticApproxSize: "около 48 МБ", semanticInstalled: "Семантическая модель {version} установлена локально ({size})", semanticNotInstalled: "Семантическая модель не установлена ({size})", semanticDownloading: "Скачиваю и проверяю…", semanticDownload: "Скачать семантическую модель (~48 МБ)", semanticRemove: "Удалить модель", semanticProgress: "Прогресс семантической модели", kilobytes: "КБ", megabytes: "МБ", smartPrivacy: "Такой маленький файл может скачаться почти мгновенно. Данные активности при скачивании не отправляются; анализ получает только уже сохранённые безопасные названия приложения, окна и домена.", semanticPrivacy: "Это не чат и не генеративная LLM. Модель запускается коротким пакетом только для неоднозначных заголовков, использует один поток процессора и затем выгружается. Файлы проверяются перед запуском; активность не покидает устройство.", analysisLastResult: "Последний локальный проход", analysisResultMetrics: "Проверено: {candidates} · уточнено: {refined} · изменено: {changed}",
      browserCompanion: "Дополнение браузера", browserTitle: "Контекст активной вкладки", browserText: "Опциональное расширение через native messaging добавляет домен, безопасный путь, заголовок и явный признак приватного режима.", browserUnavailable: "Доступно в установленном приложении для Windows или macOS", browserConnected: "Дополнение браузера подключено", browserWaiting: "Локальный мост запущен; загрузите расширение для подключения", browserStopped: "Локальный мост остановлен", browserInstallHost: "Установить локальный мост", browserOpenFolder: "Открыть папку расширения", browserPrivacy: "Параметры URL, фрагменты, логины, содержимое страницы и приватные вкладки не сохраняются. Доступ в Incognito запрещён расширением и повторно блокируется перед записью.",
      system: "Система", autostart: "Запускать при входе", autostartText: "Тихо запускается в трее и начинает локальный сбор", autostartUnavailable: "Доступно в установленном приложении", runtimeText: "Нативный сборщик работает отдельно и пишет только локальные события", accessibility: "Нужен доступ к Универсальному доступу", accessibilityText: "Это единственное разрешение macOS. После возврата из настроек Daytrace проверяет его через настоящий нативный сборщик.", grantAccess: "Открыть настройки доступа", restartAfterAccess: "Перезапустить, только если нужно",
      diagnosticsTitle: "Самодиагностика", diagnosticsText: "Проверяет сборщик, локальное хранилище, заголовки, границы отсутствия, фильтр приватных окон, автозапуск, браузерное дополнение и выбранный опциональный режим анализа.", diagnosticsRun: "Запустить проверку", diagnosticStatuses: { pass: "Работает", warn: "Нужно понаблюдать", fail: "Нужно исправить", "not-applicable": "Не применимо" }, diagnosticChecks: { storage: "Локальные данные доступны для записи", tracker: "Нативный сборщик", collector: "Файл сборщика", accessibility: "Универсальный доступ macOS", titles: "Приходят активные заголовки", idle: "Определение отсутствия", private: "Приватные окна блокируются", autostart: "Запуск при входе", browser: "Дополнение браузера", smart: "Опциональный режим анализа" },
      accessibilityInstallIssues: { "duplicate-copy": "Эта копия называется {name}. macOS могла выдать доступ другой копии Daytrace. Удалите дубликаты, оставьте /Applications/Daytrace.app, откройте именно её и выдайте доступ. Текущий путь: {path}", "disk-image": "Daytrace запущен прямо из установочного образа. Перетащите приложение в «Программы», закройте эту копию, откройте /Applications/Daytrace.app и выдайте доступ установленной копии. Текущий путь: {path}", "outside-applications": "Перед выдачей доступа переместите эту копию в /Applications/Daytrace.app, чтобы macOS сохранила одно стабильное разрешение. Текущий путь: {path}", "unknown-location": "macOS не может надёжно определить эту копию Daytrace. Оставьте в «Программах» одну Daytrace.app, снова откройте её и выдайте доступ именно ей." },
      updates: "Обновления", currentVersion: "Установленная версия: {version}", availableVersion: "Доступна версия {version}", lastChecked: "Последняя проверка: {time}", checkUpdates: "Проверить обновления", checking: "Проверяю…", installUpdate: "Обновить до {version}", downloadMac: "Скачать {version}", updateError: "Не удалось завершить проверку или установку. Повторите, когда интернет будет доступен.", updatePrivacy: "Daytrace автоматически проверяет GitHub Releases при запуске и раз в шесть часов. Передаётся только установленная версия и обычный сетевой запрос; данные активности никогда не покидают устройство.",
      updateStatuses: { disabled: "Доступно в установленном приложении", idle: "Обновления ещё не проверялись", checking: "Проверяю GitHub Releases…", available: "Доступна новая версия", "up-to-date": "Установлена последняя версия", offline: "Нет интернета; Daytrace повторит проверку автоматически", downloading: "Скачиваю и проверяю обновление…", ready: "Обновление проверено и готово", installing: "Заменяю установленное приложение проверенным обновлением…", restarting: "Обновление установлено; Daytrace откроется автоматически", "installer-opened": "macOS заблокировала автоматическую замену, поэтому проверенный DMG открыт как запасной вариант. Завершите Daytrace, перенесите Daytrace.app в «Программы», выберите «Заменить», а не «Сохранить обе», и снова откройте приложение.", "windows-installer-opened": "Daytrace не смог безопасно заменить эту установку автоматически. Проверенный установщик Windows открыт: завершите установку по его подсказкам и снова откройте Daytrace.", error: "Не удалось проверить обновления" },
      statuses: { running: "Сборщик работает", starting: "Сборщик запускается…", paused: "Сбор на паузе", stopped: "Сборщик остановлен", error: "Сборщику нужно внимание", unavailable: "Нативный сборщик недоступен", "permission-required": "Сборщик ждёт разрешение «Универсальный доступ»" },
      data: "Данные", events: "{count} недавно проанализированных событий", autoDelete: "Автоудаление через {period}", deviceOnly: "Только на устройстве", openData: "Открыть папку данных",
      backup: "Зашифрованная копия", restore: "Восстановить", backupText: "JSON и CSV — читаемые экспорты. Копия .daytrace шифрует настройки, сохранённые события, навыки и локальный умный контекст через AES-256-GCM до записи на диск.", backupTitle: "Создать зашифрованную копию", restoreTitle: "Транзакционно восстановить копию", passphrase: "Парольная фраза", passphraseText: "Не менее 8 символов. Daytrace её не сохраняет и не сможет восстановить.", fileReady: "Файл готов: {path}",
      retentionTitle: "Срок хранения истории", retentionText: "Выберите, насколько далеко можно возвращаться в календаре. Долгая история остаётся локальной, а старые дни загружаются только при выборе.", retentionWarning: "Уменьшение срока сразу удалит события за пределами нового периода. Увеличение не восстановит уже удалённые данные.", retentionDurations: { "48": "48 часов", "168": "7 дней", "720": "30 дней", "2160": "90 дней", "8760": "1 год" }, retentionCustom: "{days} дней",
      clear: "Очистить историю", clearText: "Все локальные события будут удалены немедленно и безвозвратно.", deleteAll: "Удалить всё", clearJournal: "Очистить локальный журнал",
    },
    onboarding: {
      eyebrow: "Приватность по умолчанию", title: "Выберите язык", subtitle: "Daytrace полностью работает на этом компьютере. Язык в любой момент можно изменить в настройках.",
      english: "English", englishDetail: "Interface, timeline, local answers, and tray menu", russian: "Русский", russianDetail: "Интерфейс, таймлайн, локальные ответы и меню трея",
      privacyTitle: "Ваша активность остаётся на устройстве", privacyText: "Без скриншотов, аудио, введённого текста, аккаунта и облачного хранения.", continue: "Продолжить на русском",
      permissionEyebrow: "Одно обязательное разрешение macOS", permissionTitle: "Разрешите Daytrace видеть активное окно", permissionSubtitle: "Без доступа к Универсальному доступу macOS не сообщает Daytrace, какое приложение и окно активно, поэтому история остаётся пустой.",
      permissionStepOne: "Нажмите «Разрешить доступ» ниже.", permissionStepTwo: "Включите именно /Applications/Daytrace.app в разделе «Конфиденциальность и безопасность» → «Универсальный доступ».", permissionStepThree: "Вернитесь в Daytrace. Приложение само проверит нативный сборщик; обычно перезапуск не нужен.",
      permissionCopyTitle: "macOS видит несколько копий", permissionRepairTitle: "Уже включили, но всё равно видите этот экран?", permissionRepairText: "В «Универсальном доступе» удалите кнопкой «−» все старые Daytrace и Daytrace 2. Нажмите «+», выберите /Applications/Daytrace.app, включите её, вернитесь сюда и нажмите «Проверить снова».", permissionPrivacy: "Daytrace читает только безопасные метаданные активного окна. Нажатия клавиш, введённый текст, скриншоты, аудио и буфер обмена не записываются.", permissionGrant: "Разрешить доступ", permissionWaiting: "Открываю настройки macOS…", permissionCheck: "Проверить снова", permissionChecking: "Проверяю нативный сборщик…", permissionRestart: "Перезапустить, только если macOS не применила доступ", permissionLater: "Открыть Daytrace без сбора",
    },
    demo: {
      dataPath: "Локальная папка Daytrace",
      brief: "Три часа наблюдаемого активного времени. Главные контексты: реализация, план задач и координация команды.", completed: "Чек-лист релиза — завершено", openLoop: "Проверка API — в процессе",
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
