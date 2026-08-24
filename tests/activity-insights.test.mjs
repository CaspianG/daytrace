import test from "node:test";
import assert from "node:assert/strict";
import sessionizer from "../electron/lib/sessionizer.cjs";
import insights from "../electron/lib/activity-insights.cjs";

test("observed activity and inferred purpose remain separate", () => {
  const base = new Date("2026-08-20T09:00:00+03:00").getTime();
  const sessions = sessionizer.sessionize([
    { at: new Date(base).toISOString(), kind: "foreground", app: "Telegram Desktop", title: "General chat", context: "messaging" },
    { at: new Date(base + 40_000).toISOString(), kind: "heartbeat", app: "Telegram Desktop", title: "General chat", context: "messaging" },
  ], base + 60_000, "en");
  const activity = sessions[0].activities[0];
  assert.equal(activity.observedLabel, "General chat");
  assert.equal(activity.intent, "unknown");
  assert.equal(activity.intentLabel, "Ambiguous purpose");
  assert.equal(activity.needsReview, true);
  assert.ok(activity.intentEvidenceItems.some((item) => item.kind === "window-title" && item.value === "General chat"));
  assert.equal(insights.buildReviewQueue(sessions, "en")[0].observedLabel, "General chat");
});

test("day brief extracts themes, likely completion, open loops, and real away gaps", () => {
  const base = new Date("2026-08-20T09:00:00+03:00").getTime();
  const sessions = [{ activities: [
    { start: base, end: base + 30 * 60_000, durationMs: 30 * 60_000, app: "Visual Studio Code", title: "Installer rollback — fixed", intent: "work", intentConfidence: "high", intentReason: "window-title" },
    { start: base + 45 * 60_000, end: base + 65 * 60_000, durationMs: 20 * 60_000, app: "Microsoft Word", title: "Release notes — draft review", intent: "work", intentConfidence: "medium", intentReason: "window-title" },
    { start: base + 70 * 60_000, end: base + 80 * 60_000, durationMs: 10 * 60_000, app: "Visual Studio Code", title: "Installer rollback — fixed", intent: "work", intentConfidence: "high", intentReason: "window-title" },
  ] }];
  insights.annotateSessions(sessions, "en");
  const brief = insights.buildDayBrief(sessions, "en");
  assert.equal(brief.themes[0].label, "Installer rollback — fixed");
  assert.deepEqual(brief.completed, ["Installer rollback — fixed"]);
  assert.deepEqual(brief.openLoops, ["Release notes — draft review"]);
  assert.equal(brief.interruptions[0].durationMs, 15 * 60_000);
  assert.equal(brief.interruptions[0].returned, "Installer rollback — fixed");
  assert.match(brief.narrative, /observed active time/i);
});

test("day brief recognizes explicit Russian completed and open-loop markers", () => {
  const sessions = [{ activities: [
    { start: 1, end: 2, durationMs: 60_000, app: "Code", title: "Релиз готово", intent: "work", intentConfidence: "high" },
    { start: 3, end: 4, durationMs: 60_000, app: "Code", title: "Проверка в процессе", intent: "work", intentConfidence: "high" },
  ] }];
  const brief = insights.buildDayBrief(sessions, "ru");
  assert.deepEqual(brief.completed, ["Релиз готово"]);
  assert.deepEqual(brief.openLoops, ["Проверка в процессе"]);
});

test("review journal groups repeated contexts into one remembered decision", () => {
  const base = Date.now() - 60_000;
  const sessions = [{ activities: [
    { start: base, end: base + 5_000, durationMs: 5_000, app: "Telegram Desktop", title: "General chat", intent: "unknown", intentConfidence: "low" },
    { start: base + 10_000, end: base + 20_000, durationMs: 10_000, app: "Telegram Desktop", title: "General chat", intent: "unknown", intentConfidence: "low" },
    { start: base + 25_000, end: base + 30_000, durationMs: 5_000, app: "Telegram Desktop", title: "Project chat", intent: "unknown", intentConfidence: "low" },
    { start: base + 35_000, end: base + 40_000, durationMs: 5_000, app: "Visual Studio Code", title: "one.txt", intent: "unknown", intentConfidence: "low" },
    { start: base + 45_000, end: base + 50_000, durationMs: 5_000, app: "Visual Studio Code", title: "two.txt", intent: "unknown", intentConfidence: "low" },
  ] }];
  insights.annotateSessions(sessions, "en");
  const queue = insights.buildReviewQueue(sessions, "en");
  assert.equal(queue.length, 3);
  assert.equal(queue.find((item) => item.title === "General chat").occurrenceCount, 2);
  assert.equal(queue.find((item) => item.app === "Visual Studio Code").occurrenceCount, 2);
  assert.equal(queue.find((item) => item.title === "Project chat").scope, "context");
});

test("review reminder waits for a real backlog and respects a seven-day snooze", () => {
  const queue = Array.from({ length: 4 }, (_, index) => ({ id: `${index}`, occurrenceCount: 3, durationMs: 12 * 60_000 }));
  const now = Date.now();
  const due = insights.buildReviewBacklog(queue, { reviewLearningExplained: false }, now);
  assert.equal(due.uniqueCount, 4);
  assert.equal(due.occurrenceCount, 12);
  assert.equal(due.thresholdReached, true);
  assert.equal(due.notificationDue, true);
  assert.equal(due.firstExplanation, true);
  const snoozed = insights.buildReviewBacklog(queue, { reviewLearningExplained: true, reviewReminderSnoozedUntil: now + 7 * 24 * 60 * 60_000 }, now);
  assert.equal(snoozed.notificationDue, false);
  assert.equal(snoozed.firstExplanation, false);
});
