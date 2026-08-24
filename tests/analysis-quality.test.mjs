import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import qualityModule from "../electron/lib/analysis-quality.cjs";
import workerModule from "../electron/lib/analysis-quality-worker.cjs";
import serviceModule from "../electron/lib/analysis-quality-service.cjs";

const { evaluateActivities } = qualityModule;
const { evaluateDataRoot } = workerModule;
const { AnalysisQualityService } = serviceModule;

function fixtures(at = new Date().toISOString()) {
  const activities = [
    { at, kind: "foreground", app: "Google Chrome", title: "Alex", count: 1 },
    { at, kind: "heartbeat", app: "Google Chrome", title: "Alex", count: 1 },
    { at, kind: "foreground", app: "Google Chrome", title: "Atlas", count: 1 },
    { at, kind: "foreground", app: "Steam", title: "Library", count: 1 },
  ];
  const manualRules = [
    { id: "alex", scope: "context", app: "Google Chrome", title: "Alex", match: "Alex", intent: "personal" },
    { id: "atlas", scope: "context", app: "Google Chrome", title: "Atlas", match: "Atlas", intent: "work" },
  ];
  const smartRules = [
    { id: "signal-atlas", scope: "context", app: "Google Chrome", title: "Atlas", match: "Atlas", intent: "work", source: "smart-model", confidenceScore: .84 },
    { id: "semantic-alex", scope: "context", app: "Google Chrome", title: "Alex", match: "Alex", intent: "personal", source: "semantic-model", confidenceScore: .82 },
  ];
  return { activities, manualRules, smartRules };
}

test("quality separates benchmark-like coverage from agreement with explicit corrections", () => {
  const input = fixtures();
  const result = evaluateActivities(input.activities, input);
  assert.equal(result.eventRows, 4);
  assert.equal(result.contextCount, 3);
  assert.equal(result.labelledContextCount, 2);
  assert.equal(result.labelledOccurrences, 3);
  assert.equal(result.engines.builtin.history.covered, 1);
  assert.equal(result.engines.builtin.personal.correct, 0);
  assert.equal(result.engines.signals.history.covered, 2);
  assert.equal(result.engines.signals.personal.correct, 1);
  assert.equal(result.engines.signals.personal.accuracy, .5);
  assert.equal(result.engines.semantic.history.covered, 2);
  assert.equal(result.engines.semantic.personal.correct, 1);
  assert.equal(result.engines.semantic.personal.accuracy, .5);
});

test("background evaluator reads retained JSONL and returns aggregate counts without titles", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-analysis-quality-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "events"));
  const input = fixtures();
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ retentionHours: 8760, intentRules: input.manualRules }));
  fs.writeFileSync(path.join(root, "smart-contexts.json"), JSON.stringify(input.smartRules));
  const now = Date.now();
  const stamp = new Date(now);
  const file = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}.jsonl`;
  fs.writeFileSync(path.join(root, "events", file), `${input.activities.map((activity) => JSON.stringify({ ...activity, at: new Date(now).toISOString() })).join("\n")}\n`);
  const result = await evaluateDataRoot(root, now);
  assert.equal(result.fileCount, 1);
  assert.equal(result.contextCount, 3);
  assert.equal(result.labelledContextCount, 2);
  assert.equal(JSON.stringify(result).includes("Alex"), false);
  assert.equal(JSON.stringify(result).includes("Atlas"), false);
});

test("quality service persists only the aggregate snapshot and reuses it on startup", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-analysis-quality-service-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "events"));
  const input = fixtures();
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ retentionHours: 8760, intentRules: input.manualRules }));
  fs.writeFileSync(path.join(root, "smart-contexts.json"), JSON.stringify(input.smartRules));
  const stamp = new Date();
  const file = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}.jsonl`;
  fs.writeFileSync(path.join(root, "events", file), `${input.activities.map((activity) => JSON.stringify({ ...activity, at: stamp.toISOString() })).join("\n")}\n`);
  const service = new AnalysisQualityService(root);
  t.after(() => service.stop());
  const status = await service.refresh();
  assert.equal(status.personal.contextCount, 3);
  const persisted = fs.readFileSync(path.join(root, "analysis-quality.json"), "utf8");
  assert.equal(persisted.includes("Alex"), false);
  assert.equal(new AnalysisQualityService(root).status().personal.contextCount, 3);
});
