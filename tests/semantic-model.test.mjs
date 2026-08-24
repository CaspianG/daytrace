import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import semanticModule from "../electron/lib/semantic-model-service.cjs";
import { shouldSkipSemantic } from "../src/semantic-analysis-core.js";

const { MODEL_ASSETS, MODEL_VERSION, TOTAL_MODEL_BYTES, SEMANTIC_MODEL_QUALITY, SemanticModelService, checksum, releaseBase, shouldRejectActivity } = semanticModule;
const sourceRoot = path.resolve("models");

test("the optional RU/EN bundle is pinned by exact size and SHA-256", () => {
  assert.equal(MODEL_VERSION, "1.0.0");
  assert.equal(TOTAL_MODEL_BYTES, 49_821_594);
  assert.equal(MODEL_ASSETS.length, 10);
  for (const asset of MODEL_ASSETS) {
    const body = fs.readFileSync(path.join(sourceRoot, asset.sourcePath));
    assert.equal(body.length, asset.size, asset.bundlePath);
    assert.equal(checksum(body), asset.sha256, asset.bundlePath);
    assert.match(asset.releaseName, /^daytrace-semantic-(?:ru|en)-/);
  }
  assert.equal(releaseBase("0.5.7"), "https://github.com/CaspianG/daytrace/releases/download/v0.5.7");
  assert.throws(() => releaseBase("latest"), /invalid/);
});

test("semantic model installation is local, verified, and exposes no activity data", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-semantic-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = new SemanticModelService(root);
  service.installFromDirectory(sourceRoot);
  const status = service.status();
  assert.equal(status.installed, true);
  assert.equal(status.sizeBytes, TOTAL_MODEL_BYTES);
  assert.deepEqual(status.languages, ["ru", "en"]);
  assert.equal(status.runtimePolicy, "one-thread-short-lived-worker");
  assert.equal(status.quality.modelVersion, MODEL_VERSION);
  assert.equal(status.quality.benchmark.correct, 35);
  assert.equal(status.quality.benchmark.covered, 37);
  assert.equal(status.quality.benchmark.labelable, 48);
  assert.equal(status.quality.holdout.correct, 20);
  assert.deepEqual(status.quality, SEMANTIC_MODEL_QUALITY);
  const bundle = service.readBundle();
  assert.deepEqual(Object.keys(bundle).sort(), MODEL_ASSETS.map((asset) => asset.bundlePath).sort());
  assert.equal(JSON.stringify(bundle).includes("Telegram"), false);
});

test("semantic decisions become exact local context rules and preserve other engines", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-semantic-rules-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = new SemanticModelService(root);
  service.installFromDirectory(sourceRoot);
  const signalRule = { id: "signal-existing", match: "tutorial", intent: "learning", source: "smart-model", confidenceScore: 0.7, evidence: "tutorial" };
  const activities = [
    { app: "Google Chrome", title: "Quarterly plan for the team", domain: "docs.google.com", language: "en" },
    { app: "Telegram Desktop", title: "General chat", domain: "", language: "en" },
    { app: "Google Chrome", title: "Project movie night", domain: "example.test", intentReason: "conflicting-title-signals", language: "en" },
  ];
  const store = {
    smartRules: [signalRule],
    smartAnalysisCandidates: () => activities,
    replaceSmartRules(value) { this.smartRules = value; },
  };
  const session = service.begin(store);
  assert.equal(session.status, "ready");
  assert.equal(service.status().running, true);
  assert.notEqual(service.analysisTimer, null);
  const result = service.complete(session.token, [
    { index: 0, intent: "work", score: 0.66, margin: 0.2, confidenceScore: 0.8 },
    { index: 1, intent: "personal", score: 0.9, margin: 0.4, confidenceScore: 0.9 },
    { index: 2, intent: "entertainment", score: 0.9, margin: 0.4, confidenceScore: 0.9 },
    { index: 99, intent: "work", score: 1, margin: 1, confidenceScore: 1 },
  ], store);
  assert.equal(result.candidates, 3);
  assert.equal(result.refined, 1);
  assert.equal(result.changed, 1);
  assert.equal(store.smartRules.some((rule) => rule.id === "signal-existing"), true);
  const rule = store.smartRules.find((item) => item.source === "semantic-model");
  assert.equal(rule.app, "Google Chrome");
  assert.equal(rule.title, "Quarterly plan for the team");
  assert.equal(rule.domain, "docs.google.com");
  assert.equal(rule.intent, "work");
  assert.equal(service.status().running, false);
  assert.equal(service.analysisTimer, null);
  const schedulerState = fs.readFileSync(service.analysisStatePath, "utf8");
  assert.doesNotMatch(schedulerState, /Quarterly plan|General chat|Project movie night|docs\.google/i);
  assert.match(schedulerState, /reviewedContextHashes/);

  const reopened = new SemanticModelService(root);
  reopened.lastRunAt = Date.now() - semanticModule.AUTO_ANALYSIS_INTERVAL_MS - 1;
  const repeated = reopened.prepare({ ...store, latestEventAt: () => 100 }, false);
  assert.equal(repeated.status, "nothing-to-review");
  assert.equal(reopened.status().reviewedContexts, 3);
});

test("generic and conflicting contexts are rejected and corrupt models never leave a stuck run", (t) => {
  assert.equal(shouldRejectActivity({ title: "General chat" }), true);
  assert.equal(shouldRejectActivity({ title: "Project movie night", intentReason: "conflicting-title-signals" }), true);
  assert.equal(shouldRejectActivity({ title: "Specific project planning document" }), false);
  const weakContexts = [
    { app: "Google Chrome", title: "Notifications" },
    { app: "Telegram Desktop", title: "Alex @ Kandy" },
    { app: "Google Chrome", title: "▼ 77170 | Трейдинг BTCUSDT | Bybit Бессрочные контракты" },
    { app: "File Explorer", title: "019f4dea-c9c5-72e1-a1c9-9ea09a4fc050 — проводник" },
    { app: "Google Chrome", title: "gemini - Поиск в Google" },
    { app: "Google Chrome", title: "Входящие - Почта Mail" },
    { app: "Google Chrome", title: "ChatGPT: Chat, Work, Create & Code with AI" },
    { app: "Antigravity", title: "проаудируй сайт полностью..." },
  ];
  for (const activity of weakContexts) {
    assert.equal(shouldSkipSemantic(activity), true, activity.title);
    assert.equal(shouldRejectActivity(activity), true, activity.title);
  }
  const descriptiveContexts = [
    { app: "Google Chrome", title: "Как устроен сборщик мусора" },
    { app: "Telegram Desktop", title: "Согласуем структуру кабинета с командой" },
    { app: "Google Chrome", title: "Order groceries for home delivery" },
  ];
  for (const activity of descriptiveContexts) {
    assert.equal(shouldSkipSemantic(activity), false, activity.title);
    assert.equal(shouldRejectActivity(activity), false, activity.title);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-semantic-corrupt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = new SemanticModelService(root);
  service.installFromDirectory(sourceRoot);
  fs.truncateSync(path.join(service.modelRoot, MODEL_ASSETS[0].bundlePath), 1);
  assert.throws(() => service.begin({ smartAnalysisCandidates: () => [{ app: "Chrome", title: "Specific project planning" }] }), /not installed|mismatch/i);
  assert.equal(service.status().running, false);
});
