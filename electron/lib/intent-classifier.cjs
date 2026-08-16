const INTENT_LABELS = {
  en: {
    work: "Work",
    learning: "Learning",
    personal: "Personal",
    entertainment: "Entertainment",
    unknown: "Unknown purpose",
    mixed: "Mixed purpose",
  },
  ru: {
    work: "Работа",
    learning: "Обучение",
    personal: "Личное",
    entertainment: "Развлечения",
    unknown: "Цель не определена",
    mixed: "Смешанная цель",
  },
};

const ALLOWED_INTENTS = new Set(["work", "learning", "personal", "entertainment", "unknown"]);

const TITLE_SIGNALS = {
  work: [
    /\b(project|client|customer|task|ticket|issue|pull request|merge request|standup|sprint|meeting|brief|proposal|invoice|contract|deadline|roadmap|release|deploy|production)\b/i,
    /\b(jira|linear|github|gitlab|figma|confluence|salesforce|hubspot)\b/i,
    /(?:проект|клиент|заказчик|задач|тикет|созвон|встреч|бриф|предложен|сч[её]т|договор|дедлайн|релиз|деплой|продакш|требован|макет)/i,
  ],
  learning: [
    /\b(tutorial|course|lesson|lecture|documentation|docs|stack overflow|mdn|wikipedia|research|study|learn|guide|manual|how to|workshop|webinar)\b/i,
    /(?:курс|урок|лекц|обуч|изуч|документац|исследован|гайд|инструкц|руководств|вебинар|воркшоп|как сделать|как настроить)/i,
  ],
  personal: [
    /\b(family|friends|personal|bank|shopping|travel|vacation|health|doctor|appointment|home|delivery)\b/i,
    /(?:семь|друз|личн|банк|покупк|магазин|путешеств|отпуск|здоров|врач|дом|доставк)/i,
  ],
  entertainment: [
    /\b(netflix|twitch|tiktok|steam|game|gaming|movie|series|episode|meme|stream|playlist|music video)\b/i,
    /(?:фильм|сериал|эпизод|игр(?:а|ы|е|у)|мем|развлеч|стрим|плейлист|клип)/i,
  ],
};

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function normalizeIntentRules(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value.slice(-100)) {
    const match = String(item?.match || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const intent = String(item?.intent || "").toLowerCase();
    if (!match || !ALLOWED_INTENTS.has(intent)) continue;
    result.push({
      id: String(item?.id || `${Date.now()}-${result.length}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      match,
      intent,
    });
  }
  return result;
}

function matchingSignals(title) {
  const matches = [];
  for (const [intent, patterns] of Object.entries(TITLE_SIGNALS)) {
    if (patterns.some((pattern) => pattern.test(title))) matches.push(intent);
  }
  return matches;
}

function inferIntentDetails(activity, rules = []) {
  const app = `${activity.app || ""} ${activity.process || ""}`.toLowerCase();
  const title = String(activity.title || "").toLowerCase();
  const combined = `${app} ${title}`.replace(/\s+/g, " ");
  const normalizedRules = normalizeIntentRules(rules);
  const custom = [...normalizedRules].reverse().find((rule) => combined.includes(rule.match.toLowerCase()));
  if (custom) return { intent: custom.intent, confidence: "high", reason: "custom-rule", evidence: custom.match };

  const signals = matchingSignals(title);
  if (signals.length === 1) return { intent: signals[0], confidence: "high", reason: "window-title", evidence: title.slice(0, 120) };
  if (signals.length > 1) return { intent: "unknown", confidence: "low", reason: "conflicting-title-signals", evidence: signals.join(",") };

  if (/(steam|epicgames|battle\.net|riotclient|netflix|twitch)/.test(app)) return { intent: "entertainment", confidence: "medium", reason: "application", evidence: activity.app };

  // Browsers, messengers, editors, office/design/audio tools, AI assistants,
  // and file managers can all be used for work, learning, personal tasks, or
  // entertainment. Without title evidence or a local rule, guessing would be
  // misleading, so they intentionally remain unknown.
  return { intent: "unknown", confidence: "low", reason: "insufficient-evidence", evidence: "" };
}

function labelForIntent(intent, language = "en") {
  const lang = normalizeLanguage(language);
  return INTENT_LABELS[lang][intent] || INTENT_LABELS[lang].unknown;
}

module.exports = { ALLOWED_INTENTS, INTENT_LABELS, inferIntentDetails, labelForIntent, normalizeIntentRules };
