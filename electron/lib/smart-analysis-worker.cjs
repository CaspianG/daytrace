const fs = require("node:fs");
const crypto = require("node:crypto");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");

const ALLOWED_INTENTS = new Set(["work", "learning", "personal", "entertainment"]);

function clean(value, limit = 300) {
  return String(value || "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeForMatch(value, limit = 720) {
  return clean(value, limit)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSignal(haystack, signal) {
  const normalizedSignal = normalizeForMatch(signal, 60);
  if (!normalizedSignal) return false;
  return ` ${haystack} `.includes(` ${normalizedSignal} `);
}

function validateModel(value) {
  if (!value || value.format !== "daytrace-smart-model" || typeof value.version !== "string") throw new Error("Unsupported smart model");
  const weights = {};
  for (const [intent, entries] of Object.entries(value.weights || {})) {
    if (!ALLOWED_INTENTS.has(intent) || !entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    weights[intent] = {};
    for (const [token, weight] of Object.entries(entries).slice(0, 1_000)) {
      const safeToken = clean(token.toLowerCase(), 60);
      const safeWeight = Number(weight);
      if (!safeToken || !Number.isFinite(safeWeight) || safeWeight <= 0 || safeWeight > 10) continue;
      weights[intent][safeToken] = safeWeight;
    }
  }
  if (Object.keys(weights).length < 2) throw new Error("Smart model has too few labels");
  return {
    format: value.format,
    version: clean(value.version, 40),
    minimumScore: Math.max(0.5, Math.min(20, Number(value.minimumScore) || 2.2)),
    minimumMargin: Math.max(0.1, Math.min(10, Number(value.minimumMargin) || 0.75)),
    weights,
  };
}

function loadModel(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 2 * 1024 * 1024) throw new Error("Smart model file is invalid");
  return validateModel(JSON.parse(fs.readFileSync(file, "utf8")));
}

function classifyContext(activity, model) {
  const app = clean(activity?.app, 120);
  const title = clean(activity?.title, 300);
  const domain = clean(activity?.domain, 180);
  const haystack = normalizeForMatch(`${app} ${domain} ${title}`);
  const scores = [];
  for (const [intent, weights] of Object.entries(model.weights)) {
    let score = 0;
    const evidence = [];
    for (const [token, weight] of Object.entries(weights)) {
      if (!hasSignal(haystack, token)) continue;
      score += weight;
      evidence.push(token);
    }
    scores.push({ intent, score, evidence });
  }
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  const runnerUp = scores[1];
  const margin = (winner?.score || 0) - (runnerUp?.score || 0);
  if (!winner || winner.score < model.minimumScore || margin < model.minimumMargin) return null;
  const confidenceScore = Math.min(0.96, 0.55 + Math.min(0.24, winner.score / 24) + Math.min(0.17, margin / 12));
  const exactApp = clean(activity?.app, 120);
  const exactTitle = clean(activity?.title, 140);
  if (!exactApp || !exactTitle || /^(?:active window|активное окно|new tab|новая вкладка)$/i.test(exactTitle)) return null;
  const id = crypto.createHash("sha256").update(`${exactApp.toLowerCase()}|${exactTitle.toLowerCase()}`).digest("hex").slice(0, 24);
  return {
    id: `smart-${id}`,
    scope: "context",
    app: exactApp,
    title: exactTitle,
    match: exactTitle,
    intent: winner.intent,
    source: "smart-model",
    confidenceScore: Number(confidenceScore.toFixed(3)),
    evidence: winner.evidence.slice(0, 4).join(", "),
  };
}

function analyzeContexts(activities, model) {
  const unique = new Map();
  for (const activity of Array.isArray(activities) ? activities.slice(0, 5_000) : []) {
    const result = classifyContext(activity, model);
    if (result) unique.set(result.id, result);
  }
  return [...unique.values()];
}

if (!isMainThread) {
  try {
    const model = loadModel(workerData.modelPath);
    const rules = analyzeContexts(workerData.activities, model);
    parentPort.postMessage({ ok: true, version: model.version, rules });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: String(error?.message || error) });
  } finally {
    parentPort.close();
  }
}

module.exports = { analyzeContexts, classifyContext, hasSignal, loadModel, normalizeForMatch, validateModel };
