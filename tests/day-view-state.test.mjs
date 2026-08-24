import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createDayViewCache, dayViewRevision, nextActivityLimit, normalizeDayTimestamp, selectedDayRefreshToken } from "../src/day-view-cache.js";

const require = createRequire(import.meta.url);
const { compactRendererState } = require("../electron/lib/renderer-state.cjs");

test("day view cache survives page remounts without crossing day or analysis revisions", () => {
  const cache = createDayViewCache(2);
  const first = new Date(2026, 7, 24, 8).getTime();
  const second = new Date(2026, 7, 25, 8).getTime();
  const revision = dayViewRevision({ language: "ru", analysisEngine: "semantic", intentRulesChangedAt: 4 }, { smartAnalysis: { semantic: { lastRunAt: 8 } } });
  const day = { day: normalizeDayTimestamp(first), sessions: [{ id: "one", activities: [] }] };

  cache.set(first, revision, day);
  assert.strictEqual(cache.get(first, revision), day);
  assert.equal(cache.get(second, revision), null);
  assert.equal(cache.get(first, `${revision}:new`), null);
});
test("only a selected day containing the newest event receives live refreshes", () => {
  const selected = new Date(2026, 7, 24, 0, 0).getTime();
  const sameDay = new Date(2026, 7, 24, 18, 30).toISOString();
  const nextDay = new Date(2026, 7, 25, 0, 1).toISOString();
  assert.match(selectedDayRefreshToken(selected, sameDay, 42), /:42$/);
  assert.equal(selectedDayRefreshToken(selected, nextDay, 43), "historical");
});

test("long activity lists grow in bounded batches", () => {
  assert.equal(nextActivityLimit(0, 800), 12);
  assert.equal(nextActivityLimit(12, 800), 24);
  assert.equal(nextActivityLimit(792, 800), 800);
  assert.equal(nextActivityLimit(0, 5), 5);
});

test("renderer state omits multi-megabyte session detail but keeps shell data", () => {
  const source = {
    settings: { language: "ru" },
    sessions: [{ id: "large", activities: Array.from({ length: 2_000 }, (_, index) => ({ title: `context-${index}` })) }],
    brief: { narrative: "full aggregate" },
    reviewQueue: [{ id: "review" }],
    eventCount: 2_000,
  };
  const compact = compactRendererState(source);
  assert.deepEqual(compact.sessions, []);
  assert.equal(compact.brief, null);
  assert.deepEqual(compact.reviewQueue, source.reviewQueue);
  assert.equal(compact.eventCount, 2_000);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(source).length / 10);
});
