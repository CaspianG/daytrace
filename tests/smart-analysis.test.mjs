import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import worker from "../electron/lib/smart-analysis-worker.cjs";
import smart from "../electron/lib/smart-analysis-service.cjs";

const modelFile = new URL("../models/daytrace-smart-v1.json", import.meta.url);

test("smart model download is pinned to the installed release tag", () => {
  const urls = smart.modelUrlsForVersion("0.5.6");
  assert.equal(urls.modelUrl, "https://github.com/CaspianG/daytrace/releases/download/v0.5.6/daytrace-smart-v1.json");
  assert.equal(urls.checksumUrl, `${urls.modelUrl}.sha256`);
  assert.throws(() => smart.modelUrlsForVersion("main"), /version is invalid/i);
  assert.equal(smart.checksum(fs.readFileSync(modelFile)), smart.MODEL_SHA256);
  assert.equal(smart.MODEL_VERSION, "1.1.0");
  assert.equal(smart.isVersionOlder("1.0.0"), true);
  assert.equal(smart.isVersionOlder("1.1.0"), false);
  assert.equal(smart.isVersionOlder("2.0.0"), false);
});

test("compact smart model validates and returns explainable exact-context rules", () => {
  const model = worker.loadModel(modelFile);
  const result = worker.classifyContext({ app: "Telegram Desktop", title: "Netflix episode club" }, model);
  assert.equal(result.intent, "entertainment");
  assert.equal(result.scope, "context");
  assert.equal(result.source, "smart-model");
  assert.ok(result.confidenceScore >= 0.55);
  assert.match(result.evidence, /netflix|episode/);
  assert.equal(worker.classifyContext({ app: "Telegram Desktop", title: "General chat" }, model), null);
  assert.equal(worker.classifyContext({ app: "Google Chrome", title: "Blank page" }, model), null, "home must not match inside Chrome");
  assert.equal(worker.hasSignal(worker.normalizeForMatch("Chrome home — API docs"), "home"), true);
  assert.equal(worker.hasSignal(worker.normalizeForMatch("Chrome home — API docs"), "rome"), false);
  assert.equal(worker.classifyContext({ app: "Chrome", title: "Code review for database migration" }, model)?.intent, "work");
  assert.equal(worker.classifyContext({ app: "Safari", title: "Как работает сборщик мусора" }, model)?.intent, "learning");
  assert.equal(worker.classifyContext({ app: "Chrome", title: "Delivery tracking for a family gift" }, model)?.intent, "personal");
  assert.equal(worker.classifyContext({ app: "Chrome", title: "Прохождение игры — смешное видео" }, model)?.intent, "entertainment");
});

test("smart service verifies the pack, runs in a short-lived worker, and persists no raw input", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-smart-service-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = new smart.SmartAnalysisService(root);
  const body = fs.readFileSync(modelFile);
  const installed = service.installBuffer(body, smart.checksum(body));
  assert.equal(installed.version, "1.1.0");
  assert.equal(service.status().sizeBytes, body.length);
  assert.equal(service.status().updateAvailable, false);
  const fakeStore = {
    smartRules: [],
    state: () => ({ sessions: [{ activities: [{ app: "Telegram Desktop", title: "Netflix episode club", intent: "unknown", intentConfidenceScore: 0.25 }] }] }),
    replaceSmartRules(rules) { this.smartRules = rules; },
  };
  const result = await service.analyze(fakeStore);
  assert.equal(result.status, "complete");
  assert.equal(result.candidates, 1);
  assert.equal(result.refined, 1);
  assert.equal(result.changed, 1);
  assert.equal(fakeStore.smartRules[0].intent, "entertainment");
  assert.equal(service.status().running, false);
  assert.equal(service.status().lastResult.totalRules, 1);
  assert.equal(fs.readFileSync(service.modelPath, "utf8").includes("Netflix episode club"), false);
});

test("an installed 1.0 signal pack surfaces a 1.1 update without disabling it", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-smart-legacy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = Buffer.from(JSON.stringify({
    format: "daytrace-smart-model",
    version: "1.0.0",
    minimumScore: 2.2,
    minimumMargin: 0.75,
    weights: { work: { project: 2.3 }, entertainment: { movie: 2.6 } },
  }));
  const service = new smart.SmartAnalysisService(root);
  service.installBuffer(legacy);
  assert.equal(service.status().installed, true);
  assert.equal(service.status().version, "1.0.0");
  assert.equal(service.status().updateAvailable, true);
});

test("smart model download requires a matching SHA-256 checksum", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-smart-download-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const body = fs.readFileSync(modelFile);
  const responses = [
    { ok: true, headers: { get: () => String(body.length) }, arrayBuffer: async () => body },
    { ok: true, text: async () => `${smart.checksum(body)}  daytrace-smart-v1.json` },
  ];
  const optionsSeen = [];
  const service = new smart.SmartAnalysisService(root, { fetch: async (_url, options) => { optionsSeen.push(options); return responses.shift(); } });
  assert.equal((await service.download()).sha256, smart.checksum(body));
  assert.deepEqual(optionsSeen.map((options) => options.redirect), ["follow", "follow"]);
  const failed = new smart.SmartAnalysisService(path.join(root, "bad"), { fetch: async (url) => url.endsWith(".sha256") ? { ok: true, text: async () => `${"0".repeat(64)}  model` } : { ok: true, headers: { get: () => String(body.length) }, arrayBuffer: async () => body } });
  await assert.rejects(failed.download(), /checksum mismatch/i);
});
