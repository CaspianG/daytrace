const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { loadModel } = require("./smart-analysis-worker.cjs");

const MODEL_NAME = "daytrace-smart-v1.json";
const MODEL_VERSION = "1.1.0";
const MODEL_SHA256 = "5cae2963db2fd88ccac1117a789d5bf3b78c0d63caf6273d55c9e509cf7e1beb";
const MAX_MODEL_BYTES = 2 * 1024 * 1024;

function modelUrlsForVersion(version) {
  const normalized = String(version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) throw new Error("Smart model release version is invalid");
  const base = `https://github.com/CaspianG/daytrace/releases/download/v${normalized}`;
  return { modelUrl: `${base}/${MODEL_NAME}`, checksumUrl: `${base}/${MODEL_NAME}.sha256` };
}

function secureMode(target, mode) {
  if (process.platform === "win32") return;
  try { fs.chmodSync(target, mode); } catch { }
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseChecksum(text) {
  const match = String(text || "").match(/\b([a-f0-9]{64})\b/i);
  if (!match) throw new Error("Smart model checksum is missing");
  return match[1].toLowerCase();
}

function isVersionOlder(version, currentVersion = MODEL_VERSION) {
  const parse = (value) => /^\d+\.\d+\.\d+$/.test(String(value || "")) ? String(value).split(".").map(Number) : null;
  const left = parse(version);
  const right = parse(currentVersion);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

async function responseBuffer(response, limit = MAX_MODEL_BYTES) {
  if (!response?.ok) throw new Error(`Smart model download failed (${response?.status || "network"})`);
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (contentLength > limit) throw new Error("Smart model is too large");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > limit) throw new Error("Smart model is empty or too large");
  return buffer;
}

class SmartAnalysisService {
  constructor(root, options = {}) {
    this.root = root;
    this.modelDir = path.join(root, "models");
    this.modelPath = path.join(this.modelDir, MODEL_NAME);
    this.workerPath = options.workerPath || path.join(__dirname, "smart-analysis-worker.cjs");
    this.fetch = options.fetch || globalThis.fetch;
    const urls = modelUrlsForVersion(options.version || "0.5.11");
    this.modelUrl = options.modelUrl || urls.modelUrl;
    this.checksumUrl = options.checksumUrl || urls.checksumUrl;
    this.expectedChecksum = String(options.expectedChecksum || MODEL_SHA256).toLowerCase();
    this.running = false;
    this.lastRunAt = null;
    this.lastError = "";
    this.lastResult = { status: "never", candidates: 0, refined: 0, changed: 0, totalRules: 0 };
    this.modelCache = null;
    fs.mkdirSync(this.modelDir, { recursive: true, mode: 0o700 });
    secureMode(this.modelDir, 0o700);
  }

  status() {
    let model = null;
    let sizeBytes = 0;
    try {
      if (fs.existsSync(this.modelPath)) {
        const stat = fs.statSync(this.modelPath);
        const key = `${stat.size}:${stat.mtimeMs}`;
        if (this.modelCache?.key === key) model = this.modelCache.model;
        else {
          model = loadModel(this.modelPath);
          this.modelCache = { key, model };
        }
      } else this.modelCache = null;
    } catch (error) {
      this.modelCache = null;
      this.lastError = String(error?.message || error);
    }
    try { if (model) sizeBytes = fs.statSync(this.modelPath).size; } catch { sizeBytes = 0; }
    return {
      installed: Boolean(model),
      version: model?.version || "",
      updateAvailable: Boolean(model && isVersionOlder(model.version)),
      sizeBytes,
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastResult: { ...this.lastResult },
      error: this.lastError,
      downloadBytesMaximum: MAX_MODEL_BYTES,
      dataPolicy: "safe-window-metadata-only",
    };
  }

  installBuffer(buffer, expectedChecksum = "") {
    const body = Buffer.from(buffer || []);
    if (!body.length || body.length > MAX_MODEL_BYTES) throw new Error("Smart model is empty or too large");
    const actual = checksum(body);
    if (expectedChecksum && actual !== String(expectedChecksum).toLowerCase()) throw new Error("Smart model checksum mismatch");
    const temporary = `${this.modelPath}.tmp`;
    fs.writeFileSync(temporary, body, { mode: 0o600 });
    try {
      const model = loadModel(temporary);
      fs.renameSync(temporary, this.modelPath);
      secureMode(this.modelPath, 0o600);
      this.modelCache = null;
      this.lastError = "";
      return { installed: true, version: model.version, sha256: actual };
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch { }
      throw error;
    }
  }

  installFile(source) {
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size > MAX_MODEL_BYTES) throw new Error("Smart model file is invalid");
    return this.installBuffer(fs.readFileSync(source));
  }

  async download() {
    if (typeof this.fetch !== "function") throw new Error("Downloads are unavailable");
    const [modelResponse, checksumResponse] = await Promise.all([
      this.fetch(this.modelUrl, { redirect: "follow", headers: { Accept: "application/json" } }),
      this.fetch(this.checksumUrl, { redirect: "follow", headers: { Accept: "text/plain" } }),
    ]);
    const [body, checksumText] = await Promise.all([
      responseBuffer(modelResponse),
      checksumResponse?.ok ? checksumResponse.text() : Promise.reject(new Error("Smart model checksum download failed")),
    ]);
    const releaseChecksum = parseChecksum(checksumText);
    if (releaseChecksum !== this.expectedChecksum) throw new Error("Smart model release checksum mismatch");
    return this.installBuffer(body, this.expectedChecksum);
  }

  remove() {
    fs.rmSync(this.modelPath, { force: true });
    this.modelCache = null;
    this.lastError = "";
    return this.status();
  }

  analyze(store) {
    if (this.running) return Promise.resolve({ status: "busy", rules: [] });
    const status = this.status();
    if (!status.installed) return Promise.resolve({ status: "model-required", rules: [] });
    const sessions = store.state().sessions || [];
    const activities = typeof store.smartAnalysisCandidates === "function"
      ? store.smartAnalysisCandidates(1_000, 30)
      : sessions
        .flatMap((session) => session.activities || [])
        .filter((activity) => activity.intent === "unknown" || Number(activity.intentConfidenceScore || 0) < 0.55)
        .map((activity) => ({ app: activity.app, title: activity.title, domain: activity.domain || "" }));
    if (!activities.length) {
      this.lastRunAt = Date.now();
      this.lastResult = { status: "nothing-to-review", candidates: 0, refined: 0, changed: 0, totalRules: Array.isArray(store.smartRules) ? store.smartRules.length : 0 };
      return Promise.resolve({ ...this.lastResult, rules: [] });
    }
    this.running = true;
    this.lastError = "";
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, { workerData: { modelPath: this.modelPath, activities } });
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        this.running = false;
        this.lastRunAt = Date.now();
        if (error) {
          this.lastError = String(error?.message || error);
          reject(error);
          return;
        }
        if (!result?.ok) {
          const failure = new Error(result?.error || "Smart analysis failed");
          this.lastError = failure.message;
          reject(failure);
          return;
        }
        const previousRules = Array.isArray(store.smartRules) ? store.smartRules : [];
        const merged = new Map(previousRules.map((rule) => [rule.id, rule]));
        let changed = 0;
        for (const rule of result.rules || []) {
          const previous = merged.get(rule.id);
          if (!previous || previous.intent !== rule.intent || previous.confidenceScore !== rule.confidenceScore || previous.evidence !== rule.evidence) changed += 1;
          merged.set(rule.id, rule);
        }
        const persisted = [...merged.values()].slice(-2_000);
        store.replaceSmartRules(persisted);
        this.lastResult = {
          status: "complete",
          candidates: activities.length,
          refined: (result.rules || []).length,
          changed,
          totalRules: persisted.length,
        };
        resolve({ ...this.lastResult, version: result.version, rules: result.rules || [] });
      };
      worker.once("message", (message) => finish(null, message));
      worker.once("error", (error) => finish(error));
      worker.once("exit", (code) => { if (code !== 0) finish(new Error(`Smart analysis worker stopped (${code})`)); });
    });
  }
}

module.exports = {
  MAX_MODEL_BYTES,
  MODEL_NAME,
  MODEL_VERSION,
  MODEL_SHA256,
  SmartAnalysisService,
  checksum,
  isVersionOlder,
  modelUrlsForVersion,
  parseChecksum,
};
