import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import answers from "../electron/lib/local-answer.cjs";
import sessionizer from "../electron/lib/sessionizer.cjs";
import storeModule from "../electron/lib/event-store.cjs";
import { formatDuration, normalizeLanguage, translations } from "../src/i18n.js";

const base = new Date("2026-08-15T09:00:00+03:00").getTime();
const events = [
  { at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Daytrace project - App.jsx" },
  { at: new Date(base + 20 * 60_000).toISOString(), kind: "input", app: "Visual Studio Code", count: 12 },
  { at: new Date(base + 30 * 60_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "Electron documentation" },
  { at: new Date(base + 50 * 60_000).toISOString(), kind: "click", app: "Google Chrome", count: 3 },
];

test("renderer translations have the same complete key structure", () => {
  function keys(value, prefix = "") {
    return Object.entries(value).flatMap(([key, item]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return item && typeof item === "object" && !Array.isArray(item) ? keys(item, name) : [name];
    }).sort();
  }
  assert.deepEqual(keys(translations.en), keys(translations.ru));
  assert.equal(normalizeLanguage("ru-RU"), "ru");
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(formatDuration(90 * 60_000, "en"), "1 h 30 min");
  assert.equal(formatDuration(90 * 60_000, "ru"), "1 ч 30 мин");
});
test("sessions and local answers are fully localized", () => {
  const enSessions = sessionizer.sessionize(events, base + 60 * 60_000, "en");
  const ruSessions = sessionizer.sessionize(events, base + 60 * 60_000, "ru");
  assert.equal(enSessions[0].label, "Development");
  assert.equal(ruSessions[0].label, "Разработка");
  assert.deepEqual(enSessions[0].activities.map((item) => item.focus), ["development"]);

  const now = new Date("2026-08-15T11:00:00+03:00");
  const english = answers.answerQuestion("What was I working on this morning?", events, now, "en");
  const russian = answers.answerQuestion("Над чем я работал утром?", events, now, "ru");
  assert.match(english.answer, /^Work:/);
  assert.doesNotMatch(english.answer, /[А-Яа-яЁё]/);
  assert.match(russian.answer, /^Работа:/);
  assert.match(russian.answer, /[А-Яа-яЁё]/);
  assert.equal(english.points[0].duration.includes("min") || english.points[0].duration.includes("h"), true);
  assert.equal(russian.points[0].duration.includes("мин") || russian.points[0].duration.includes("ч"), true);
});

test("first run follows the OS language and persists onboarding choice", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-i18n-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(root, () => {}, { defaultLanguage: "ru-RU" });
  assert.equal(store.settings.language, "ru");
  assert.equal(store.settings.onboardingComplete, false);
  store.updateSettings({ language: "en", onboardingComplete: true });

  const reopened = new storeModule.EventStore(root, () => {}, { defaultLanguage: "ru-RU" });
  assert.equal(reopened.settings.language, "en");
  assert.equal(reopened.settings.onboardingComplete, true);
});

test("local answers use browser and Telegram context without message content", () => {
  const contextEvents = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Google Chrome", title: "Daytrace docs - Google Chrome", context: "browser", tabCount: 8 },
    { at: new Date(base + 10 * 60_000).toISOString(), kind: "heartbeat", app: "Google Chrome", title: "Daytrace docs - Google Chrome", context: "browser", tabCount: 12 },
    { at: new Date(base + 20 * 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project chat - Telegram Desktop", context: "messaging" },
  ];
  const now = new Date(base + 30 * 60_000);
  const browser = answers.answerQuestion("How many browser tabs did I use?", contextEvents, now, "en");
  const telegram = answers.answerQuestion("Что я делал в Телеграме?", contextEvents, now, "ru");
  assert.match(browser.answer, /12 tabs/);
  assert.match(telegram.answer, /Project chat/);
  assert.match(telegram.answer, /содержимое сообщений не записывается/);
});

test("local answers filter work, learning, and entertainment by inferred purpose", () => {
  const purposeEvents = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Project Atlas — client meeting", context: "messaging" },
    { at: new Date(base + 10 * 60_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "React documentation tutorial", context: "browser" },
    { at: new Date(base + 20 * 60_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "Netflix — series episode", context: "browser" },
  ];
  const now = new Date(base + 30 * 60_000);
  const work = answers.answerQuestion("Сколько времени я работал?", purposeEvents, now, "ru");
  const learning = answers.answerQuestion("How long did I study?", purposeEvents, now, "en");
  const entertainment = answers.answerQuestion("Сколько я развлекался?", purposeEvents, now, "ru");
  assert.match(work.answer, /^Работа:/);
  assert.deepEqual(work.points.map((point) => point.label), ["Работа"]);
  assert.match(learning.answer, /^Learning:/);
  assert.deepEqual(learning.points.map((point) => point.label), ["Learning"]);
  assert.match(entertainment.answer, /^Развлечения:/);
  assert.deepEqual(entertainment.points.map((point) => point.label), ["Развлечения"]);
});

test("local question parser handles combined dates, explicit times and meaningful switches", () => {
  const now = new Date("2026-08-15T18:00:00+03:00");
  const yesterdayMorning = answers.interpretQuestion("What did I do yesterday morning?", now, "en");
  assert.equal(new Date(yesterdayMorning.window.start).getDate(), 14);
  assert.equal(new Date(yesterdayMorning.window.start).getHours(), 4);
  const explicit = answers.interpretQuestion("Что делал с 10 до 12 в Telegram?", now, "ru");
  assert.equal(explicit.intent, "app");
  assert.equal(new Date(explicit.window.start).getHours(), 10);
  assert.equal(new Date(explicit.window.end).getHours(), 12);
  assert.equal(answers.meaningfulTransitions([
    { start: 1, app: "Telegram", context: "messaging" },
    { start: 2, app: "Telegram", context: "messaging" },
    { start: 3, app: "Chrome", context: "browser" },
  ]), 1);
});

test("English and Russian READMEs use only their matching localized visuals", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const englishReadme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const russianReadme = fs.readFileSync(path.join(root, "README_RU.md"), "utf8");

  assert.match(englishReadme, /daytrace-cover-en\.png/);
  assert.match(englishReadme, /timeline-en\.png/);
  assert.match(englishReadme, /settings-en\.png/);
  assert.match(englishReadme, /purpose-en\.png/);
  assert.match(englishReadme, /rules-en\.png/);
  assert.doesNotMatch(englishReadme, /(?:daytrace-cover|timeline)-ru\.png/);

  assert.match(russianReadme, /daytrace-cover-ru\.png/);
  assert.match(russianReadme, /timeline-ru\.png/);
  assert.match(russianReadme, /settings-ru\.png/);
  assert.match(russianReadme, /purpose-ru\.png/);
  assert.match(russianReadme, /rules-ru\.png/);
  assert.doesNotMatch(russianReadme, /(?:daytrace-cover|timeline)-en\.png/);

  for (const relativePath of [
    "docs/assets/daytrace-cover-en.png",
    "docs/assets/daytrace-cover-ru.png",
    "docs/assets/screenshots/timeline-en.png",
    "docs/assets/screenshots/timeline-ru.png",
    "docs/assets/screenshots/settings-en.png",
    "docs/assets/screenshots/settings-ru.png",
    "docs/assets/screenshots/purpose-en.png",
    "docs/assets/screenshots/purpose-ru.png",
    "docs/assets/screenshots/rules-en.png",
    "docs/assets/screenshots/rules-ru.png",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`);
  }
});
