export const SEMANTIC_INTENTS = ["work", "learning", "personal", "entertainment"];

export const SEMANTIC_PROTOTYPES = {
  work: [
    "Рабочий проект, задачи команды и требования заказчика",
    "Разработка программы, написание кода и исправление ошибок",
    "Деловая встреча, планирование и обсуждение результата",
    "Рабочий документ, отчёт, таблица или презентация",
    "Согласование структуры продукта и решений с командой",
    "Подготовка квартального плана для рабочего отдела",
    "Professional project, team tasks and customer requirements",
    "Software development, coding, debugging and deployment",
    "Business meeting, planning and discussing deliverables",
    "Professional document, report, spreadsheet or presentation",
    "Aligning product structure and decisions with the team",
    "Preparing a quarterly plan for a business department",
  ],
  learning: [
    "Изучение новой темы и поиск объяснения",
    "Учебный курс, лекция, урок или тренировка навыка",
    "Чтение документации, руководства или научной статьи",
    "Разбор принципа работы и получение новых знаний",
    "Понимание программных концепций и принципов работы кода",
    "Научная теория и образовательное объяснение простыми словами",
    "Learning a new topic and looking for an explanation",
    "Course, lecture, lesson or skills training",
    "Reading documentation, a guide or a research paper",
    "Understanding how something works and gaining knowledge",
    "Understanding programming concepts and how code works",
    "Science, theory and an educational explanation in simple words",
  ],
  personal: [
    "Личные дела, семья, друзья и домашние планы",
    "Покупки, банковские операции, счета и доставка",
    "Здоровье, врач, спорт и забота о себе",
    "Путешествие, бронирование, билеты и маршрут",
    "Выбор подарка и подготовка личного праздника",
    "Семейная поездка и планы на свободное время",
    "Personal matters, family, friends and household plans",
    "Shopping, banking, bills and delivery",
    "Health, doctor, fitness and self care",
    "Travel, booking, tickets and route planning",
    "Choosing a gift and preparing a personal celebration",
    "A family trip and plans for personal free time",
  ],
  entertainment: [
    "Просмотр фильма, сериала или развлекательного видео",
    "Компьютерная игра, игровой матч или стрим",
    "Музыка, юмор, мемы и отдых",
    "Социальная лента и развлекательный контент",
    "Спортивный матч, турнир и лучшие моменты игры",
    "Обсуждение вчерашней игры ради отдыха",
    "Watching a movie, series or entertainment video",
    "Video game, gaming match or live stream",
    "Music, comedy, memes and leisure",
    "Social feed and entertainment content",
    "Sports match, tournament and the best moments of the game",
    "Talking about last night's game for fun",
  ],
};

export function semanticText(activity) {
  return [activity?.title, activity?.domain]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ")
    .slice(0, 420);
}

export function semanticPrototypes(language) {
  return Object.fromEntries(SEMANTIC_INTENTS.map((intent) => {
    const entries = SEMANTIC_PROTOTYPES[intent];
    const count = Math.floor(entries.length / 2);
    const offset = String(language || "").toLowerCase().startsWith("ru") ? 0 : count;
    return [intent, entries.slice(offset, offset + count)];
  }));
}

export function shouldSkipSemantic(activity) {
  const title = String(activity?.title || "").replace(/\s+/g, " ").trim();
  const app = String(activity?.app || "").replace(/\s+/g, " ").trim();
  const domain = String(activity?.domain || "").replace(/\s+/g, " ").trim();
  if (!title || /^(?:active window|активное окно|home|new tab|новая вкладка|general chat|общий чат|notifications?|уведомления|setup|установка|program manager|plugin manager|open workspace|pricing|цены|вход|login|sign in|почта|mail|inbox|входящие|sent|отправленные|extensions?|расширения|translation|перевод|opening|открытие|contacts?(?: and)? addresses|контакты и адреса)$/i.test(title)) return true;
  if (/(?:^|\s)@\s*[\p{L}\p{N}_+.-]+$/u.test(title) || /(?:^|\s)@[\p{L}\p{N}_+.-]+$/u.test(title)) return true;
  if (/^[▲▼]?\s*[\d.,]+\s*\|.*\b(?:trade|trading|contracts?|perpetual)\b/i.test(title) || /^[▲▼]?\s*[\d.,]+\s*\|.*(?:трейдинг|контракт)/i.test(title)) return true;
  if (/(?:file explorer|проводник|finder)/i.test(app) && /(?:[0-9a-f]{8}-[0-9a-f-]{20,}|\s[—-]\s*(?:проводник|file explorer|finder)$)/i.test(title)) return true;
  if (/^(?:chatgpt(?::.*)?|daytrace|bybit)$/i.test(title) || /(?:gmail|почта mail)$/i.test(title) || /(?:landing page|целевая страница|internet speed test|интернетометр)/i.test(title)) return true;
  if (/(?:\.\.\.|…)$/.test(title)) return true;
  const searchMatch = title.match(/^(.*?)\s*[—-]\s*(?:поиск в google|google search|search results?)$/i);
  const meaningfulTitle = (searchMatch?.[1] || title).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = meaningfulTitle.match(/[\p{L}\p{N}]{2,}/gu) || [];
  if (!domain && words.length < 3) return true;
  return activity?.intentReason === "conflicting-title-signals";
}

export function unitVector(values) {
  const vector = Array.from(values || [], Number);
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

export function cosine(left, right) {
  const count = Math.min(left?.length || 0, right?.length || 0);
  let result = 0;
  for (let index = 0; index < count; index += 1) result += left[index] * right[index];
  return result;
}

export function scoreSemanticVector(vector, prototypeVectors) {
  const scores = SEMANTIC_INTENTS.map((intent) => {
    const similarities = (prototypeVectors[intent] || []).map((prototype) => cosine(vector, prototype)).sort((left, right) => right - left);
    const score = (similarities[0] || 0) * 0.58 + (similarities[1] || 0) * 0.27 + (similarities[2] || 0) * 0.15;
    return { intent, score, closest: similarities[0] || 0 };
  }).sort((left, right) => right.score - left.score);
  const winner = scores[0];
  const runnerUp = scores[1];
  return { scores, winner, runnerUp, margin: (winner?.score || 0) - (runnerUp?.score || 0) };
}

export function semanticDecision(vector, prototypeVectors, options = {}) {
  const result = scoreSemanticVector(vector, prototypeVectors);
  const minimumScore = Number(options.minimumScore ?? 0.59);
  const minimumMargin = Number(options.minimumMargin ?? 0.035);
  if (!result.winner || result.winner.score < minimumScore || result.margin < minimumMargin) return null;
  const confidenceScore = Math.min(0.9, 0.55 + Math.max(0, result.winner.score - 0.55) * 0.65 + Math.min(0.18, result.margin * 0.9));
  return {
    intent: result.winner.intent,
    score: Number(result.winner.score.toFixed(4)),
    margin: Number(result.margin.toFixed(4)),
    confidenceScore: Number(confidenceScore.toFixed(3)),
  };
}
