import test from "node:test";
import assert from "node:assert/strict";
import answers from "../electron/lib/local-answer.cjs";

test("local date parser handles arbitrary RU/EN dates, ranges, and comparisons", () => {
  const now = new Date("2026-08-23T14:30:00+03:00");
  const russian = answers.questionWindow("Что я делал 12 августа 2026 утром?", now, "ru");
  assert.equal(new Date(russian.start).getDate(), 12);
  assert.equal(new Date(russian.start).getHours(), 4);
  assert.equal(new Date(russian.end).getHours(), 12);
  const english = answers.questionWindow("What did I do on August 14, 2026?", now, "en");
  assert.equal(new Date(english.start).getDate(), 14);
  const comparison = answers.questionWindow("Compare this week with last week", now, "en");
  assert.ok(comparison.comparison);
  assert.equal(comparison.start - comparison.comparison.start, 7 * 24 * 60 * 60_000);
  assert.equal(answers.interpretQuestion("Сравни эту неделю с прошлой", now, "ru").intent, "comparison");
});

test("comparison answer calculates both periods locally", () => {
  const now = new Date("2026-08-23T14:30:00+03:00");
  const window = answers.questionWindow("Compare this week with last week", now, "en");
  const current = [
    { at: new Date(window.start + 10_000).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "project.ts" },
    { at: new Date(window.start + 70_000).toISOString(), kind: "idle", app: "Visual Studio Code", title: "project.ts" },
  ];
  const previous = [
    { at: new Date(window.comparison.start + 10_000).toISOString(), kind: "foreground", app: "Visual Studio Code", title: "project.ts" },
    { at: new Date(window.comparison.start + 40_000).toISOString(), kind: "idle", app: "Visual Studio Code", title: "project.ts" },
  ];
  const result = answers.answerQuestion("Compare this week with last week", current, now, "en", [], { comparisonEvents: previous });
  assert.equal(result.intent, "comparison");
  assert.match(result.answer, /this week/i);
  assert.match(result.answer, /last week/i);
  assert.match(result.answer, /more/i);
});
