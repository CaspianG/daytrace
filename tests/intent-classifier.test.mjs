import test from "node:test";
import assert from "node:assert/strict";
import classifier from "../electron/lib/intent-classifier.cjs";
import sessionizer from "../electron/lib/sessionizer.cjs";

test("general-purpose apps stay unknown only when no semantic or contextual signal exists", () => {
  assert.equal(classifier.inferIntentDetails({ app: "Telegram Desktop", title: "General chat" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "ChatGPT", title: "ChatGPT" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "New Tab" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "Visual Studio Code", title: "main.jsx" }).intent, "work");
  assert.equal(classifier.inferIntentDetails({ app: "Microsoft Word", title: "Document 1" }).intent, "work");
});

test("popular browser services distinguish consumption, learning, work, and errands", () => {
  const cases = [
    ["YouTube", "entertainment"],
    ["YouTube — React tutorial for beginners", "learning"],
    ["YouTube Studio — Channel analytics", "work"],
    ["Netflix — new series episode", "entertainment"],
    ["Кинопоиск — смотреть фильм", "entertainment"],
    ["Twitch — live stream", "entertainment"],
    ["Coursera — Machine Learning course", "learning"],
    ["MDN Web Docs — CSS grid guide", "learning"],
    ["GitHub — Daytrace pull request", "work"],
    ["Jira — DAY-42 release ticket", "work"],
    ["Figma — Client dashboard", "work"],
    ["Ozon — корзина", "personal"],
    ["Booking.com — hotel", "personal"],
    ["Google Maps — route home", "personal"],
    ["Reddit — funny memes", "entertainment"],
    ["LinkedIn — customer meeting", "work"],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title }).intent, expected, title);
  }
});

test("active chat titles are classified without reading message bodies", () => {
  const cases = [
    ["Project Atlas — client meeting", "work"],
    ["Командный чат — обсуждение API и релиза", "work"],
    ["Family vacation", "personal"],
    ["Мама — билеты на поезд", "personal"],
    ["Мемы и приколы", "entertainment"],
    ["Киноклуб — новый сериал", "entertainment"],
    ["Курс английского — урок 12", "learning"],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifier.inferIntentDetails({ app: "Telegram Desktop", title }).intent, expected, title);
  }
});

test("dedicated application priors cover common creative, office, development, and media tools", () => {
  const cases = [
    ["ZCode", "main.go", "work"],
    ["FL64", "Mix project", "work"],
    ["Adobe Premiere Pro", "Untitled project", "work"],
    ["Microsoft Excel", "Book1", "work"],
    ["Remote Desktop", "Desktop", "work"],
    ["Anki", "Deck", "learning"],
    ["Steam", "Library", "entertainment"],
    ["Spotify", "Home", "entertainment"],
    ["ScrapMechanic", "Scrap Mechanic", "entertainment"],
    ["FactoryGame-Win64-Shipping", "Satisfactory", "entertainment"],
  ];
  for (const [app, title, expected] of cases) {
    assert.equal(classifier.inferIntentDetails({ app, title }).intent, expected, `${app}: ${title}`);
  }
});

test("visible technical and search context is used before falling back to unknown", () => {
  const cases = [
    ["Google Chrome", "Fix installer restart after silent update", "work"],
    ["Telegram Desktop", "Ошибка интеграции API — настройка сервера", "work"],
    ["Google Chrome", "what is event sourcing - Google Search", "learning"],
    ["ChatGPT", "Сравнение локальных моделей и примеры", "learning"],
  ];
  for (const [app, title, expected] of cases) {
    assert.equal(classifier.inferIntentDetails({ app, title }).intent, expected, `${app}: ${title}`);
  }
});

test("custom local rules override heuristics and balanced conflicts are not forced", () => {
  const custom = classifier.inferIntentDetails(
    { app: "Telegram Desktop", title: "Team Banter" },
    [{ id: "banter", match: "Team Banter", intent: "entertainment" }],
  );
  assert.equal(custom.intent, "entertainment");
  assert.equal(custom.reason, "custom-rule");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "Project movie night" }).intent, "unknown");
});

test("ambiguous activity inherits matching surrounding purpose", () => {
  const base = new Date("2026-08-16T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Project Daytrace" },
    { at: new Date(base + 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "General chat", context: "messaging" },
    { at: new Date(base + 120_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "GitHub pull request", context: "browser" },
  ];
  const [session] = sessionizer.sessionize(events, base + 180_000, "en");
  const telegram = session.activities.find((activity) => activity.app === "Telegram Desktop");
  assert.equal(telegram.intent, "work");
  assert.equal(telegram.intentConfidence, "medium");
  assert.equal(telegram.intentReason, "sequence-context");
});

test("a learned active-chat context is reused locally across sessions", () => {
  const base = new Date("2026-08-16T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Client project" },
    { at: new Date(base + 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Atlas", context: "messaging" },
    { at: new Date(base + 120_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "GitHub pull request", context: "browser" },
    { at: new Date(base + 20 * 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "Atlas", context: "messaging" },
  ];
  const sessions = sessionizer.sessionize(events, base + 22 * 60_000, "en");
  const occurrences = sessions.flatMap((session) => session.activities).filter((activity) => activity.title === "Atlas");
  assert.equal(occurrences.length, 2);
  assert.equal(occurrences[0].intent, "work");
  assert.equal(occurrences[1].intent, "work");
  assert.equal(occurrences[1].intentReason, "repeated-context");
});

test("conflicting neighbors do not force an ambiguous chat into either purpose", () => {
  const base = new Date("2026-08-16T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Steam", title: "Library" },
    { at: new Date(base + 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "General chat", context: "messaging" },
    { at: new Date(base + 120_000).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "main.jsx" },
  ];
  const [session] = sessionizer.sessionize(events, base + 180_000, "en");
  const telegram = session.activities.find((activity) => activity.app === "Telegram Desktop");
  assert.equal(telegram.intent, "unknown");
  assert.equal(telegram.intentReason, "needs-context");
});
