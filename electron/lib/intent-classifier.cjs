const INTENT_LABELS = {
  en: {
    work: "Work",
    learning: "Learning",
    personal: "Personal",
    entertainment: "Entertainment",
    unknown: "Ambiguous purpose",
    mixed: "Mixed purpose",
  },
  ru: {
    work: "Работа",
    learning: "Обучение",
    personal: "Личное",
    entertainment: "Развлечения",
    unknown: "Неоднозначная цель",
    mixed: "Смешанная цель",
  },
};

const ALLOWED_INTENTS = new Set(["work", "learning", "personal", "entertainment", "unknown"]);

// These rules use only the foreground application's name and its visible window
// title. They never inspect page bodies, messages, URLs, typed text, or hidden
// browser tabs. More specific patterns deliberately score higher than broad
// application priors so, for example, a YouTube lecture is learning while an
// ordinary YouTube video is entertainment.
const TITLE_SIGNALS = {
  work: [
    { weight: 5, pattern: /\b(project|client|customer|task|ticket|issue|pull request|merge request|standup|sprint|meeting|brief|proposal|invoice|contract|deadline|roadmap|release|deploy(?:ment)?|production|requirements?|workspace|repository|commit|branch|code review|dashboard|analytics|campaign|crm|sales|payroll|accounting|business)\b/i },
    { weight: 5, pattern: /(?:проект|клиент|заказчик|заказ\b|задач|тикет|созвон|встреч|бриф|коммерческ(?:ое|ие) предложен|предложение клиенту|сч[её]т|договор|дедлайн|релиз|деплой|продакш|требован|макет|репозитор|коммит|ветк|код-ревью|рабоч(?:ая|ий|ее)|аналитик|кампан|продаж|бухгалтер)/i },
    { weight: 4, pattern: /\b(fix|bug|error|debug|build|test suite|ci\/cd|workflow|api|database|backend|frontend|server|website|application|installer|update service|security review|performance|configuration|integration|implementation)\b/i },
    { weight: 4, pattern: /(?:исправ|ошибк|баг\b|отлад|сборк|тесты|тестирован|api\b|баз[аы] данных|бэкенд|фронтенд|сервер|сайт\b|приложен|установщик|обновлен|безопасност|производительност|конфигурац|интеграц|реализац|настройк)/i },
    { weight: 4, pattern: /\b(jira|linear|github|gitlab|bitbucket|figma|confluence|salesforce|hubspot|asana|trello|monday\.com|clickup|miro|airtable|office 365|google workspace|vercel|sentry|datadog)\b/i },
    { weight: 4, pattern: /(?:техзадан|техническ(?:ое|ая) задани|план работ|рабочий чат|командный чат|обсуждение api|тестирован|отладк|разработк|программирован)/i },
    { weight: 3, pattern: /\b([\w.-]+\.(?:js|jsx|ts|tsx|py|go|rs|java|kt|swift|cs|cpp|c|h|vue|svelte|sql|yaml|yml|toml|json|md)|localhost|127\.0\.0\.1|devtools|terminal)\b/i },
  ],
  learning: [
    { weight: 6, pattern: /\b(tutorial|course|lesson|lecture|documentation|docs|stack overflow|mdn|wikipedia|research paper|study|learn(?:ing)?|textbook|guide|manual|how to|workshop|webinar|masterclass|explained|beginner|certification|training)\b/i },
    { weight: 6, pattern: /(?:курс|урок|лекц|обуч|изуч|документац|учебник|научн(?:ая|ое) стать|исследован|гайд|инструкц|руководств|вебинар|воркшоп|мастер-класс|как сделать|как настроить|разбор темы|подготовка к экзамен|повышение квалификац)/i },
    { weight: 4, pattern: /\b(coursera|udemy|edx|khan academy|stepik|skillbox|netology|geekbrains|duolingo|quizlet|anki|leetcode|codewars)\b/i },
    { weight: 3, pattern: /(?:статья|энциклопед|словар|справочник|объяснение|обзор технолог|новости науки|экономик|финанс|инвестиц|криптовалют|биткоин)/i },
    { weight: 3, pattern: /\b(search results?|google search|yandex search|comparison|overview|reference|examples?|what is|why does|best way to)\b|(?:результаты поиска|поиск google|яндекс поиск|сравнение|что такое|почему|примеры|лучший способ)/i },
  ],
  personal: [
    { weight: 5, pattern: /\b(family|friends?|personal|bank(?:ing)?|shopping|checkout|order|delivery|travel|vacation|health|doctor|appointment|rent|mortgage|insurance|pharmacy|fitness|recipe|weather|maps|booking|hotel|flight|train tickets?)\b/i },
    { weight: 5, pattern: /(?:семь|мам[а-я]?\b|пап[а-я]?\b|родител|друз|личн|банк|покупк|магазин|корзин|заказ еды|доставк|путешеств|отпуск|здоров|врач|поликлиник|домашн|квартир|страхов|аптек|фитнес|рецепт|погод|карт[ыа]\b|бронирован|отел|авиабилет|билеты на поезд)/i },
    { weight: 4, pattern: /\b(amazon|ebay|aliexpress|booking\.com|airbnb|uber|wise|paypal|revolut|google maps|yandex maps)\b/i },
    { weight: 4, pattern: /(?:озон|вайлдберриз|яндекс маркет|авито|госуслуг|сбербанк|тинькофф|альфа-банк)/i },
  ],
  entertainment: [
    { weight: 6, pattern: /\b(movie|film|series|season|episode|trailer|comedy|meme|funny|stream|playlist|music video|official video|concert|karaoke|gameplay|lets play|walkthrough|highlights|reaction|podcast)\b/i },
    { weight: 6, pattern: /(?:фильм|кино(?=\s|$|[—:,.!?])|сериал|сезон|эпизод|серия(?=\s|$|[—:,.!?])|трейлер|комеди|мем|прикол|смешн|стрим|плейлист|клип|концерт|караоке|геймплей|прохождение игр|летсплей|нарезк|реакци|подкаст)/i },
    { weight: 5, pattern: /\b(netflix|twitch|tiktok|steam|epic games|battle\.net|riot games|playstation|xbox|spotify|soundcloud|apple music|youtube music|prime video|disney\+|hbo max|crunchyroll)\b/i },
    { weight: 5, pattern: /(?:кинопоиск|иви\b|okko|рутуб|вк видео|вк клипы|яндекс музыка|музыка вк|амедиатек|kion|wink|start\.ru|premier)/i },
    { weight: 4, pattern: /\b(gaming|video game|matchmaking|ranked match|multiplayer)\b|(?:видеоигр|игровой стрим|игровая сесси|рейтинговый матч)/i },
  ],
};

const WORK_APPS = /(?:visual studio|\bcode\b|zcode|cursor|windsurf|terminal|powershell|windowsterminal|\bcmd\b|gitkraken|sourcetree|webstorm|idea64|intellij|pycharm|xcode|android studio|docker desktop|postman|insomnia|figma|photoshop|illustrator|after effects|premiere|davinci resolve|canva|sketch|blender|autocad|solidworks|fusion 360|fl64|fl studio|ableton|reaper|cubase|logic pro|pro tools|audition|word|excel|powerpoint|libreoffice|notion|obsidian|msrdc|remote desktop|parallels|vmware|virtualbox)/i;
const COMMUNICATION_WORK_APPS = /(?:slack|microsoft teams|\bteams\b|zoom|webex|outlook|thunderbird)/i;
const LEARNING_APPS = /(?:anki|duolingo|kindle|calibre|quizlet)/i;
const ENTERTAINMENT_APPS = /(?:steam|epicgames|epic games|battle\.net|riotclient|riot client|playstation|xbox|netflix|twitch|spotify|vlc|foobar2000|winamp)/i;
const GAME_APPS = /(?:scrapmechanic|scrap mechanic|minecraft|javaw.*minecraft|roblox|fortnite|valorant|leagueclient|league of legends|dota2|cs2|counter.?strike|gta|grand theft auto|cyberpunk|witcher|eldenring|elden ring|baldur.?s gate|terraria|stardew|factorio|satisfactory|overwatch|hearthstone|genshin|warframe|worldoftanks|world of tanks|worldofwarships|war thunder|r5apex|apex legends|pubg|rocketleague|rocket league|eu4|hoi4|civilization|cities.?skylines|rimworld|game\.exe|win64[_-]shipping)/i;
const PERSONAL_APPS = /(?:sber|сбер|tinkoff|тинькофф|revolut|wise|paypal|health|fitness|weather)/i;
const BROWSER_APPS = /(?:chrome|edge|firefox|brave|opera|vivaldi|safari|browser)/i;
const MESSENGER_APPS = /(?:telegram|whatsapp|signal|discord|viber|messenger)/i;

const SERVICE_RULES = [
  { intent: "work", confidence: "high", priority: true, pattern: /\b(google cloud|cloud console|aws console|amazon web services|azure portal|digitalocean|cloudflare|vercel|heroku|virustotal|chatcut)\b|(?:консоль google cloud|облачн(?:ая|ый) консоль)/i },
  { intent: "work", confidence: "medium", priority: true, pattern: /\b(aeza|aéza|яндекс телемост|yandex telemost)\b/i },
  { intent: "work", confidence: "high", pattern: /\b(youtube studio|creator studio|google analytics|search console|ads manager|meta business suite)\b|(?:творческая студия youtube|кабинет рекламодателя)/i },
  { intent: "entertainment", confidence: "medium", pattern: /\b(youtube|youtu\.be|netflix|twitch|tiktok|prime video|disney\+|hbo max|crunchyroll)\b|(?:кинопоиск|иви\b|okko|рутуб|вк видео|яндекс музыка|амедиатек|kion|wink)/i },
  { intent: "learning", confidence: "high", pattern: /\b(coursera|udemy|edx|khan academy|stepik|skillbox|netology|geekbrains|duolingo|quizlet|leetcode|codewars|stack overflow|mdn web docs)\b/i },
  { intent: "work", confidence: "high", pattern: /\b(github|gitlab|bitbucket|jira|linear|confluence|figma|miro|asana|trello|clickup|hubspot|salesforce|vercel|sentry|datadog)\b/i },
  { intent: "personal", confidence: "high", pattern: /\b(amazon|ebay|aliexpress|booking\.com|airbnb|google maps|yandex maps)\b|(?:озон|вайлдберриз|яндекс маркет|авито|госуслуг)/i },
  { intent: "entertainment", confidence: "medium", pattern: /\b(instagram|facebook|reddit|pinterest|x \/ twitter|twitter)\b|(?:вконтакте|одноклассники|дзен)/i },
  { intent: "work", confidence: "medium", pattern: /\b(linkedin)\b/i },
];

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function normalizeIntentRules(value, limit = 100) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const safeLimit = Math.max(1, Math.min(2_000, Number(limit) || 100));
  for (const item of value.slice(-safeLimit)) {
    const match = String(item?.match || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const intent = String(item?.intent || "").toLowerCase();
    if (!match || !ALLOWED_INTENTS.has(intent)) continue;
    const rule = {
      id: String(item?.id || `${Date.now()}-${result.length}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      match,
      intent,
    };
    if (item?.scope === "context" || item?.scope === "application") {
      const app = String(item?.app || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const title = String(item?.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!app) continue;
      rule.scope = item.scope;
      rule.app = app;
      if (item.scope === "context") rule.title = title;
    }
    if (item?.source === "smart-model") {
      rule.source = "smart-model";
      rule.confidenceScore = Math.max(0.5, Math.min(0.99, Number(item.confidenceScore) || 0.5));
      rule.evidence = String(item?.evidence || match).replace(/\s+/g, " ").trim().slice(0, 120);
    }
    result.push(rule);
  }
  return result;
}

function scoreTitle(title) {
  const scores = new Map();
  for (const [intent, signals] of Object.entries(TITLE_SIGNALS)) {
    let score = 0;
    const evidence = [];
    for (const signal of signals) {
      const match = title.match(signal.pattern);
      if (!match) continue;
      score += signal.weight;
      evidence.push(match[0].slice(0, 80));
    }
    if (score) scores.set(intent, { score, evidence });
  }
  return [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
}

function semanticClassification(title) {
  const ranked = scoreTitle(title);
  if (!ranked.length) return null;
  const [winner, runnerUp] = ranked;
  const margin = winner[1].score - (runnerUp?.[1].score || 0);
  if (runnerUp && margin < 3) {
    return { intent: "unknown", confidence: "low", reason: "conflicting-title-signals", evidence: ranked.map(([intent]) => intent).join(",") };
  }
  return {
    intent: winner[0],
    confidence: winner[1].score >= 6 || margin >= 5 ? "high" : "medium",
    reason: "window-title",
    evidence: [...new Set(winner[1].evidence)].join(", ").slice(0, 120),
  };
}

function serviceClassification(title, semantic) {
  const service = SERVICE_RULES.find((rule) => rule.pattern.test(title));
  if (!service) return semantic;
  // A specific semantic signal beats a broad service prior: a lecture on
  // YouTube is learning, while YouTube without such evidence is entertainment.
  if (service.priority) return { intent: service.intent, confidence: service.confidence, reason: "service", evidence: title.match(service.pattern)?.[0]?.slice(0, 120) || "" };
  if (semantic?.intent === "unknown") return semantic;
  if (semantic && semantic.intent !== "unknown" && semantic.confidence === "high") return semantic;
  if (semantic && semantic.intent !== "unknown" && semantic.intent !== service.intent) return semantic;
  return { intent: service.intent, confidence: service.confidence, reason: "service", evidence: title.match(service.pattern)?.[0]?.slice(0, 120) || "" };
}

function inferIntentDetails(activity, rules = []) {
  const app = `${activity.app || ""} ${activity.process || ""}`.toLowerCase();
  const exactApp = String(activity.app || activity.process || "").toLowerCase().replace(/\s+/g, " ").trim();
  const title = String(activity.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const domain = String(activity.domain || "").toLowerCase().replace(/\s+/g, " ").trim();
  const urlPath = String(activity.urlPath || "").toLowerCase().replace(/\s+/g, " ").trim();
  const combined = `${app} ${title} ${domain} ${urlPath}`.replace(/\s+/g, " ");
  const normalizedRules = normalizeIntentRules(rules);
  const custom = [...normalizedRules].reverse().find((rule) => {
    if (rule.scope === "application") return exactApp === rule.app.toLowerCase().replace(/\s+/g, " ").trim();
    if (rule.scope !== "context") return combined.includes(rule.match.toLowerCase());
    const ruleApp = rule.app.toLowerCase().replace(/\s+/g, " ").trim();
    const ruleTitle = rule.title.toLowerCase().replace(/\s+/g, " ").trim();
    return exactApp === ruleApp && title === ruleTitle;
  });
  if (custom) return custom.source === "smart-model"
    ? { intent: custom.intent, confidence: custom.confidenceScore >= 0.82 ? "high" : "medium", reason: "smart-model", evidence: custom.evidence || custom.match, score: custom.confidenceScore }
    : { intent: custom.intent, confidence: "high", reason: "custom-rule", evidence: custom.match, score: 1 };

  const visibleContext = `${title} ${domain} ${urlPath}`.trim();
  const semantic = semanticClassification(visibleContext);
  const classified = BROWSER_APPS.test(app) ? serviceClassification(visibleContext, semantic) : semantic;
  if (classified) return classified;

  if (ENTERTAINMENT_APPS.test(app) || GAME_APPS.test(app)) return { intent: "entertainment", confidence: "high", reason: "application-category", evidence: activity.app || activity.process || "" };
  if (LEARNING_APPS.test(app)) return { intent: "learning", confidence: "medium", reason: "application-category", evidence: activity.app || activity.process || "" };
  if (PERSONAL_APPS.test(app)) return { intent: "personal", confidence: "medium", reason: "application-category", evidence: activity.app || activity.process || "" };
  if (WORK_APPS.test(app) || COMMUNICATION_WORK_APPS.test(app)) return { intent: "work", confidence: "medium", reason: "application-category", evidence: activity.app || activity.process || "" };

  // Generic browsers, general-purpose AI assistants, and consumer messengers
  // are resolved later from repeated-title and sequence context. App identity
  // alone is not enough to decide whether Telegram or ChatGPT was work or fun.
  if (BROWSER_APPS.test(app) || MESSENGER_APPS.test(app) || /(?:chatgpt|claude|perplexity|copilot)/i.test(app)) {
    return { intent: "unknown", confidence: "low", reason: "needs-context", evidence: "" };
  }
  return { intent: "unknown", confidence: "low", reason: "insufficient-evidence", evidence: "" };
}

function contextKey(activity) {
  const app = String(activity.app || activity.process || "").toLowerCase().replace(/\s+/g, " ").trim();
  const title = String(activity.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const domain = String(activity.domain || "").toLowerCase().replace(/\s+/g, " ").trim();
  const urlPath = String(activity.urlPath || "").toLowerCase().replace(/\s+/g, " ").trim();
  const genericTitle = /^(active window|активное окно|home|new tab|новая вкладка)$/i.test(title);
  if (!app || ((!title || genericTitle) && !domain)) return "";
  return `${app}|${genericTitle ? "" : title}|${domain}|${urlPath}`.slice(0, 500);
}

function labelForIntent(intent, language = "en") {
  const lang = normalizeLanguage(language);
  return INTENT_LABELS[lang][intent] || INTENT_LABELS[lang].unknown;
}

module.exports = {
  ALLOWED_INTENTS,
  INTENT_LABELS,
  contextKey,
  inferIntentDetails,
  labelForIntent,
  normalizeIntentRules,
  scoreTitle,
};
