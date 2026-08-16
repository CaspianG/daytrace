import test from "node:test";
import assert from "node:assert/strict";
import classifier from "../electron/lib/intent-classifier.cjs";
import sessionizer from "../electron/lib/sessionizer.cjs";

test("messengers and browsers stay unknown without semantic evidence", () => {
  assert.equal(classifier.inferIntentDetails({ app: "Telegram Desktop", title: "General chat" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "YouTube" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "Visual Studio Code", title: "main.jsx" }).intent, "unknown");
  assert.equal(classifier.inferIntentDetails({ app: "Microsoft Word", title: "Document 1" }).intent, "unknown");
});

test("clear title evidence distinguishes work, learning, personal and entertainment", () => {
  assert.equal(classifier.inferIntentDetails({ app: "Telegram Desktop", title: "Project Atlas — client meeting" }).intent, "work");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "React documentation tutorial" }).intent, "learning");
  assert.equal(classifier.inferIntentDetails({ app: "Telegram Desktop", title: "Family vacation" }).intent, "personal");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "Netflix — new series episode" }).intent, "entertainment");
});

test("custom local rules override heuristics and conflicting titles are not guessed", () => {
  const custom = classifier.inferIntentDetails(
    { app: "Telegram Desktop", title: "Team Banter" },
    [{ id: "banter", match: "Team Banter", intent: "entertainment" }],
  );
  assert.equal(custom.intent, "entertainment");
  assert.equal(custom.reason, "custom-rule");
  assert.equal(classifier.inferIntentDetails({ app: "Google Chrome", title: "Project movie night" }).intent, "unknown");
});

test("short ambiguous activity can inherit matching surrounding purpose with low confidence", () => {
  const base = new Date("2026-08-16T09:00:00+03:00").getTime();
  const events = [
    { at: new Date(base).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "Project Daytrace" },
    { at: new Date(base + 60_000).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "General chat", context: "messaging" },
    { at: new Date(base + 120_000).toISOString(), kind: "foreground", app: "Google Chrome", title: "GitHub pull request", context: "browser" },
  ];
  const [session] = sessionizer.sessionize(events, base + 180_000, "en");
  const telegram = session.activities.find((activity) => activity.app === "Telegram Desktop");
  assert.equal(telegram.intent, "work");
  assert.equal(telegram.intentConfidence, "low");
  assert.equal(telegram.intentReason, "sequence-context");
});
