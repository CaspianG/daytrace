const fs = require("node:fs");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { ANALYSIS_ENGINE_QUALITY } = require("./semantic-model-quality.cjs");

const REFRESH_INTERVAL_MS = 6 * 60 * 60_000;

function secureMode(target, mode) {
  if (process.platform === "win32") return;
  try { fs.chmodSync(target, mode); } catch { }
}

function readCache(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value?.schemaVersion === 1 && value.engines ? value : null;
  } catch { return null; }
}

class AnalysisQualityService {
  constructor(root, options = {}) {
    this.root = root;
    this.cachePath = path.join(root, "analysis-quality.json");
    this.workerPath = options.workerPath || path.join(__dirname, "analysis-quality-worker.cjs");
    this.onChange = options.onChange || (() => {});
    this.canRun = options.canRun || (() => true);
    this.worker = null;
    this.timer = null;
    this.running = false;
    this.error = "";
    this.personal = readCache(this.cachePath);
  }

  status() {
    return {
      benchmark: ANALYSIS_ENGINE_QUALITY,
      personal: this.personal,
      running: this.running,
      error: this.error,
    };
  }

  schedule(delay = 1_500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.canRun()) { this.schedule(60_000); return; }
      void this.refresh().catch(() => {});
    }, Math.max(0, Number(delay) || 0));
    this.timer.unref?.();
  }

  refresh() {
    if (this.running) return Promise.resolve(this.status());
    this.running = true;
    this.error = "";
    this.onChange();
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, { workerData: { root: this.root, now: Date.now() } });
      this.worker = worker;
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (this.worker === worker) this.worker = null;
        this.running = false;
        if (error) {
          this.error = String(error?.message || error).slice(0, 240);
          this.onChange();
          this.schedule(30 * 60_000);
          reject(error);
          return;
        }
        this.personal = result;
        this.error = "";
        const temporary = `${this.cachePath}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(result, null, 2), { encoding: "utf8", mode: 0o600 });
        fs.renameSync(temporary, this.cachePath);
        secureMode(this.cachePath, 0o600);
        this.onChange();
        this.schedule(REFRESH_INTERVAL_MS);
        resolve(this.status());
      };
      worker.once("message", (message) => message?.ok ? finish(null, message.result) : finish(new Error(message?.error || "Analysis quality check failed")));
      worker.once("error", (error) => finish(error));
      worker.once("exit", (code) => { if (code !== 0) finish(new Error(`Analysis quality worker stopped (${code})`)); });
    });
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.worker?.terminate();
    this.worker = null;
    this.running = false;
  }
}

module.exports = { AnalysisQualityService, REFRESH_INTERVAL_MS, readCache };
