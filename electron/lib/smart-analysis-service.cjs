const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { loadModel } = require("./smart-analysis-worker.cjs");

const MODEL_NAME = "daytrace-smart-v1.json";
const MODEL_SHA256 = "e4174c17c689e2dcf2fe427f6544917581cb0c502fe00b5d6498342577dc1e35";
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
    const urls = modelUrlsForVersion(options.version || "0.5.6");
    this.modelUrl = options.modelUrl || urls.modelUrl;
    this.checksumUrl = options.checksumUrl || urls.checksumUrl;
    this.expectedChecksum = String(options.expectedChecksum || MODEL_SHA256).toLowerCase();
    this.running = false;
    this.lastRunAt = null;
    this.lastError = "";
    fs.mkdirSync(this.modelDir, { recursive: true, mode: 0o700 });
    secureMode(this.modelDir, 0o700);
  }

  status() {
    let model = null;
    try { if (fs.existsSync(this.modelPath)) model = loadModel(this.modelPath); } catch (error) { this.lastError = String(error?.message || error); }
    return {
      installed: Boolean(model),
      version: model?.version || "",
      running: this.running,
      lastRunAt: this.lastRunAt,
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
      return Promise.resolve({ status: "nothing-to-review", rules: [] });
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
        const merged = new Map(store.smartRules.map((rule) => [rule.id, rule]));
        for (const rule of result.rules || []) merged.set(rule.id, rule);
        store.replaceSmartRules([...merged.values()].slice(-2_000));
        resolve({ status: "complete", version: result.version, rules: result.rules || [] });
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
  MODEL_SHA256,
  SmartAnalysisService,
  checksum,
  modelUrlsForVersion,
  parseChecksum,
};
