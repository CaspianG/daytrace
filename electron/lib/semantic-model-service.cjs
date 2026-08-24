const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { SEMANTIC_MODEL_QUALITY } = require("./semantic-model-quality.cjs");

const MODEL_VERSION = "1.0.0";
const MAX_ACTIVITY_COUNT = 160;
const MAX_REVIEWED_CONTEXTS = 5_000;
const MAX_ASSET_BYTES = 35 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 3 * 60_000;
const AUTO_ANALYSIS_INTERVAL_MS = 30 * 60_000;
const ALLOWED_INTENTS = new Set(["work", "learning", "personal", "entertainment"]);

const MODEL_ASSETS = [
  { bundlePath: "semantic/config.json", sourcePath: "semantic/config.json", releaseName: "daytrace-semantic-ru-config.json", size: 639, sha256: "7b160d5fb765f25d11106fa6b73dd5b6cb674088414f084af3a2d30e04672bc2" },
  { bundlePath: "semantic/tokenizer.json", sourcePath: "semantic/tokenizer.json", releaseName: "daytrace-semantic-ru-tokenizer.json", size: 2413691, sha256: "139995a730139fb2158226e69c5879159c020a71c33c87d65124914663f618ad" },
  { bundlePath: "semantic/tokenizer_config.json", sourcePath: "semantic/tokenizer_config.json", releaseName: "daytrace-semantic-ru-tokenizer-config.json", size: 1457, sha256: "d00e52df51e242331b0a0a33925b36a39b40aabba4d6cfb44a94f5608ebf0c98" },
  { bundlePath: "semantic/special_tokens_map.json", sourcePath: "semantic/special_tokens_map.json", releaseName: "daytrace-semantic-ru-special-tokens.json", size: 695, sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a" },
  { bundlePath: "semantic/onnx/model_quantized.onnx", sourcePath: "semantic/onnx/model_quantized.onnx", releaseName: "daytrace-semantic-ru-int8.onnx", size: 29240209, sha256: "7fbf34ac4575057182f0ee05664fb6bfe65f0ba80b25ccdda64eed91307adf90" },
  { bundlePath: "semantic-en/config.json", sourcePath: "semantic-en/config.json", releaseName: "daytrace-semantic-en-config.json", size: 657, sha256: "c8bcaca23b245d64047ee04fa2edcc55867064b67cbbe2772f660cdbdfb1978c" },
  { bundlePath: "semantic-en/tokenizer.json", sourcePath: "semantic-en/tokenizer.json", releaseName: "daytrace-semantic-en-tokenizer.json", size: 711649, sha256: "2fc687b11de0bc1b3d8348f92e3b49ef1089a621506c7661fbf3248fcd54947e" },
  { bundlePath: "semantic-en/tokenizer_config.json", sourcePath: "semantic-en/tokenizer_config.json", releaseName: "daytrace-semantic-en-tokenizer-config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
  { bundlePath: "semantic-en/special_tokens_map.json", sourcePath: "semantic-en/special_tokens_map.json", releaseName: "daytrace-semantic-en-special-tokens.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
  { bundlePath: "semantic-en/onnx/model_quantized.onnx", sourcePath: "semantic-en/onnx/model_quantized.onnx", releaseName: "daytrace-semantic-en-int8.onnx", size: 17452106, sha256: "b190f50dd46296b9895ae8f274c3455762d08610f8788f4a9bd15019f4f7160c" },
];
const TOTAL_MODEL_BYTES = MODEL_ASSETS.reduce((total, asset) => total + asset.size, 0);

function secureMode(target, mode) {
  if (process.platform === "win32") return;
  try { fs.chmodSync(target, mode); } catch { }
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function releaseBase(version) {
  const normalized = String(version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) throw new Error("Semantic model release version is invalid");
  return `https://github.com/CaspianG/daytrace/releases/download/v${normalized}`;
}

async function responseBuffer(response, asset, onChunk) {
  if (!response?.ok) throw new Error(`Semantic model download failed (${response?.status || "network"})`);
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared && declared !== asset.size) throw new Error(`Semantic model asset size mismatch: ${asset.releaseName}`);
  if (!response.body?.getReader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length !== asset.size || body.length > MAX_ASSET_BYTES) throw new Error(`Semantic model asset size mismatch: ${asset.releaseName}`);
    onChunk(body.length);
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value || []);
    total += chunk.length;
    if (total > asset.size || total > MAX_ASSET_BYTES) throw new Error(`Semantic model asset is too large: ${asset.releaseName}`);
    chunks.push(chunk);
    onChunk(chunk.length);
  }
  const body = Buffer.concat(chunks);
  if (body.length !== asset.size) throw new Error(`Semantic model asset size mismatch: ${asset.releaseName}`);
  return body;
}

function safeRuleText(value, limit) {
  return String(value || "").replace(/\p{Cf}/gu, "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function contextKey(activity) {
  return `${safeRuleText(activity?.app, 120).toLowerCase()}|${safeRuleText(activity?.title, 140).toLowerCase()}|${safeRuleText(activity?.domain, 180).toLowerCase()}`;
}

function contextHash(activity) {
  const key = contextKey(activity);
  return key ? crypto.createHash("sha256").update(key).digest("hex") : "";
}

function readAnalysisState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value?.schemaVersion !== 1 || value?.modelVersion !== MODEL_VERSION) return null;
    const reviewed = Array.isArray(value.reviewedContextHashes)
      ? value.reviewedContextHashes.filter((item) => /^[0-9a-f]{64}$/.test(String(item))).slice(-MAX_REVIEWED_CONTEXTS)
      : [];
    return {
      reviewed,
      lastObservedEventAt: Math.max(0, Number(value.lastObservedEventAt) || 0),
      lastRunAt: Math.max(0, Number(value.lastRunAt) || 0),
      lastResult: value.lastResult && typeof value.lastResult === "object" ? value.lastResult : null,
    };
  } catch { return null; }
}

function shouldRejectActivity(activity) {
  const title = safeRuleText(activity?.title, 140);
  const app = safeRuleText(activity?.app, 120);
  const domain = safeRuleText(activity?.domain, 180);
  if (!title || /^(?:active window|активное окно|home|new tab|новая вкладка|general chat|общий чат|notifications?|уведомления|setup|установка|program manager|plugin manager|open workspace|pricing|цены|вход|login|sign in|почта|mail|inbox|входящие|sent|отправленные|extensions?|расширения|translation|перевод|opening|открытие|contacts?(?: and)? addresses|контакты и адреса)$/i.test(title)) return true;
  if (/(?:^|\s)@\s*[\p{L}\p{N}_+.-]+$/u.test(title) || /(?:^|\s)@[\p{L}\p{N}_+.-]+$/u.test(title)) return true;
  if (/^[▲▼]?\s*[\d.,]+\s*\|.*\b(?:trade|trading|contracts?|perpetual)\b/i.test(title) || /^[▲▼]?\s*[\d.,]+\s*\|.*(?:трейдинг|контракт)/i.test(title)) return true;
  if (/(?:file explorer|проводник|finder)/i.test(app) && /(?:[0-9a-f]{8}-[0-9a-f-]{20,}|\s[—-]\s*(?:проводник|file explorer|finder)$)/i.test(title)) return true;
  if (/^(?:chatgpt(?::.*)?|daytrace|bybit)$/i.test(title) || /(?:gmail|почта mail)$/i.test(title) || /(?:landing page|целевая страница|internet speed test|интернетометр)/i.test(title)) return true;
  if (/(?:\.\.\.|…)$/.test(title)) return true;
  const searchMatch = title.match(/^(.*?)\s*[—-]\s*(?:поиск в google|google search|search results?)$/i);
  const meaningfulTitle = (searchMatch?.[1] || title).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = meaningfulTitle.match(/[\p{L}\p{N}]{2,}/gu) || [];
  return (!domain && words.length < 3) || activity?.intentReason === "conflicting-title-signals";
}

class SemanticModelService {
  constructor(root, options = {}) {
    this.root = root;
    this.modelRoot = path.join(root, "models", "daytrace-semantic-v1");
    this.receiptPath = path.join(this.modelRoot, "receipt.json");
    this.analysisStatePath = path.join(root, "semantic-analysis-state.json");
    this.fetch = options.fetch || globalThis.fetch;
    this.baseUrl = options.baseUrl || releaseBase(options.version || "0.5.9");
    this.developmentAssetRoot = options.developmentAssetRoot || "";
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    this.downloading = false;
    this.progress = 0;
    this.stage = "idle";
    this.running = false;
    const analysisState = readAnalysisState(this.analysisStatePath);
    this.lastRunAt = analysisState?.lastRunAt || null;
    this.lastError = "";
    this.lastResult = analysisState?.lastResult || { status: "never", candidates: 0, refined: 0, changed: 0, totalRules: 0 };
    this.lastObservedEventAt = analysisState?.lastObservedEventAt || 0;
    this.reviewedContextHashes = new Set(analysisState?.reviewed || []);
    this.prepared = null;
    this.active = null;
    this.analysisTimer = null;
    this.installedCache = { checkedAt: 0, value: false };
    fs.mkdirSync(path.dirname(this.modelRoot), { recursive: true, mode: 0o700 });
    secureMode(path.dirname(this.modelRoot), 0o700);
  }

  notify() { try { this.onChange(); } catch { } }

  persistAnalysisState() {
    const temporary = `${this.analysisStatePath}.tmp`;
    const body = {
      schemaVersion: 1,
      modelVersion: MODEL_VERSION,
      lastObservedEventAt: this.lastObservedEventAt,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      // Only irreversible hashes are retained. Window titles and domains are
      // never copied into this scheduler ledger.
      reviewedContextHashes: [...this.reviewedContextHashes].slice(-MAX_REVIEWED_CONTEXTS),
    };
    fs.writeFileSync(temporary, JSON.stringify(body, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.analysisStatePath);
    secureMode(this.analysisStatePath, 0o600);
  }

  installed(force = false) {
    if (!force && Date.now() - this.installedCache.checkedAt < 60_000) return this.installedCache.value;
    let value = false;
    try {
      const receipt = JSON.parse(fs.readFileSync(this.receiptPath, "utf8"));
      value = receipt.version === MODEL_VERSION
        && MODEL_ASSETS.every((asset) => fs.statSync(path.join(this.modelRoot, asset.bundlePath)).size === asset.size);
    } catch { value = false; }
    this.installedCache = { checkedAt: Date.now(), value };
    return value;
  }

  status() {
    return {
      installed: this.installed(),
      version: MODEL_VERSION,
      sizeBytes: TOTAL_MODEL_BYTES,
      downloading: this.downloading,
      progress: this.progress,
      stage: this.stage,
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastResult: { ...this.lastResult },
      error: this.lastError,
      dataPolicy: "safe-window-metadata-only",
      languages: ["ru", "en"],
      runtimePolicy: "one-thread-short-lived-worker",
      automaticPolicy: "idle-charging-new-contexts-only",
      reviewedContexts: this.reviewedContextHashes.size,
      quality: SEMANTIC_MODEL_QUALITY,
    };
  }

  verifyAsset(asset, body) {
    if (body.length !== asset.size || checksum(body) !== asset.sha256) throw new Error(`Semantic model checksum mismatch: ${asset.releaseName}`);
  }

  installBodies(bodies) {
    const staging = `${this.modelRoot}.staging-${process.pid}-${Date.now()}`;
    fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
    try {
      for (const asset of MODEL_ASSETS) {
        const body = Buffer.from(bodies[asset.bundlePath] || []);
        this.verifyAsset(asset, body);
        const destination = path.join(staging, asset.bundlePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        fs.writeFileSync(destination, body, { mode: 0o600 });
        secureMode(destination, 0o600);
      }
      fs.writeFileSync(path.join(staging, "receipt.json"), JSON.stringify({ version: MODEL_VERSION, installedAt: Date.now(), assets: MODEL_ASSETS.map(({ bundlePath, size, sha256 }) => ({ bundlePath, size, sha256 })) }, null, 2), { mode: 0o600 });
      fs.rmSync(this.modelRoot, { recursive: true, force: true });
      fs.renameSync(staging, this.modelRoot);
      secureMode(this.modelRoot, 0o700);
      this.installedCache = { checkedAt: 0, value: false };
      this.lastError = "";
      return this.status();
    } catch (error) {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch { }
      throw error;
    }
  }

  installFromDirectory(sourceRoot) {
    const bodies = {};
    for (const asset of MODEL_ASSETS) bodies[asset.bundlePath] = fs.readFileSync(path.join(sourceRoot, asset.sourcePath));
    return this.installBodies(bodies);
  }

  async download() {
    if (this.downloading) return this.status();
    if (this.developmentAssetRoot && MODEL_ASSETS.every((asset) => fs.existsSync(path.join(this.developmentAssetRoot, asset.sourcePath)))) {
      this.stage = "installing";
      this.progress = 20;
      this.notify();
      const result = this.installFromDirectory(this.developmentAssetRoot);
      this.progress = 100;
      this.stage = "ready";
      this.notify();
      return result;
    }
    if (typeof this.fetch !== "function") throw new Error("Semantic model downloads are unavailable");
    this.downloading = true;
    this.progress = 0;
    this.stage = "downloading";
    this.lastError = "";
    this.notify();
    const bodies = {};
    let received = 0;
    try {
      for (const asset of MODEL_ASSETS) {
        const response = await this.fetch(`${this.baseUrl}/${asset.releaseName}`, { redirect: "follow", headers: { Accept: "application/octet-stream" } });
        const body = await responseBuffer(response, asset, (count) => {
          received += count;
          this.progress = Math.min(96, Math.round((received / TOTAL_MODEL_BYTES) * 96));
          this.notify();
        });
        this.verifyAsset(asset, body);
        bodies[asset.bundlePath] = body;
      }
      this.stage = "installing";
      this.progress = 98;
      this.notify();
      this.installBodies(bodies);
      this.stage = "ready";
      this.progress = 100;
      return this.status();
    } catch (error) {
      this.lastError = String(error?.message || error);
      this.stage = "error";
      throw error;
    } finally {
      this.downloading = false;
      this.notify();
    }
  }

  remove() {
    this.cancel("removed");
    fs.rmSync(this.modelRoot, { recursive: true, force: true });
    fs.rmSync(this.analysisStatePath, { force: true });
    this.installedCache = { checkedAt: 0, value: false };
    this.reviewedContextHashes.clear();
    this.lastObservedEventAt = 0;
    this.lastRunAt = null;
    this.lastResult = { status: "never", candidates: 0, refined: 0, changed: 0, totalRules: 0 };
    this.prepared = null;
    this.progress = 0;
    this.stage = "idle";
    this.lastError = "";
    this.notify();
    return this.status();
  }

  readBundle(languages = ["ru", "en"]) {
    if (!this.installed(true)) throw new Error("Semantic model is not installed");
    const selected = new Set(Array.isArray(languages) ? languages : [languages]);
    const files = {};
    for (const asset of MODEL_ASSETS) {
      const language = asset.bundlePath.startsWith("semantic-en/") ? "en" : "ru";
      if (!selected.has(language)) continue;
      const body = fs.readFileSync(path.join(this.modelRoot, asset.bundlePath));
      this.verifyAsset(asset, body);
      files[asset.bundlePath] = body;
    }
    return files;
  }

  prepare(store, force = false) {
    if (!this.installed()) return { status: "model-required", candidates: 0 };
    if (this.running) return { status: "busy", candidates: 0 };
    const now = Date.now();
    const latestEventAt = Math.max(0, Number(typeof store?.latestEventAt === "function" ? store.latestEventAt() : 0) || 0);
    if (!force && this.lastRunAt && now - this.lastRunAt < AUTO_ANALYSIS_INTERVAL_MS) return { status: "cooldown", candidates: 0 };
    if (!force && latestEventAt && latestEventAt <= this.lastObservedEventAt) return { status: "unchanged", candidates: 0 };
    const source = typeof store?.smartAnalysisCandidates === "function"
      ? store.smartAnalysisCandidates(MAX_ACTIVITY_COUNT * 2, 30)
      : [];
    const activities = [];
    const batchHashes = new Set();
    for (const activity of source) {
      const hash = contextHash(activity);
      if (!hash || this.reviewedContextHashes.has(hash) || batchHashes.has(hash)) continue;
      batchHashes.add(hash);
      activities.push(activity);
      if (activities.length >= MAX_ACTIVITY_COUNT) break;
    }
    if (!activities.length) {
      this.lastObservedEventAt = Math.max(this.lastObservedEventAt, latestEventAt);
      this.lastRunAt = now;
      this.lastResult = { status: "nothing-to-review", candidates: 0, refined: 0, changed: 0, totalRules: Array.isArray(store?.smartRules) ? store.smartRules.length : 0 };
      this.prepared = null;
      this.persistAnalysisState();
      return { ...this.lastResult };
    }
    this.prepared = { activities, latestEventAt, preparedAt: now };
    return { status: "ready", candidates: activities.length };
  }

  begin(store) {
    if (this.running) return { status: "busy" };
    const prepared = this.prepared && Date.now() - this.prepared.preparedAt < 5 * 60_000
      ? { status: "ready", candidates: this.prepared.activities.length }
      : this.prepare(store, true);
    if (prepared.status !== "ready") return prepared;
    const activities = this.prepared.activities;
    const observedEventAt = this.prepared.latestEventAt;
    // Verify every asset before marking the service as running. If a model file
    // was changed or truncated, the UI must receive a normal error instead of a
    // permanently stuck "analyzing" state.
    const languages = [...new Set(activities.map((activity) => /\p{Script=Cyrillic}/u.test(String(activity?.title || "")) ? "ru" : "en"))];
    const files = this.readBundle(languages);
    const token = crypto.randomUUID();
    this.running = true;
    this.progress = 1;
    this.stage = "preparing";
    this.lastError = "";
    this.active = { token, activities, observedEventAt, startedAt: Date.now() };
    this.prepared = null;
    clearTimeout(this.analysisTimer);
    this.analysisTimer = setTimeout(() => {
      if (this.active?.token === token) this.cancel("Semantic analysis timed out");
    }, ANALYSIS_TIMEOUT_MS);
    this.analysisTimer.unref?.();
    this.notify();
    return { status: "ready", token, activities, files, languages, modelVersion: MODEL_VERSION };
  }

  report(token, progress, stage) {
    if (!this.active || token !== this.active.token) return false;
    this.progress = Math.max(this.progress, Math.min(99, Math.round(Number(progress) || 0)));
    this.stage = safeRuleText(stage, 40) || "analyzing";
    this.notify();
    return true;
  }

  complete(token, decisions, store) {
    if (!this.active || token !== this.active.token || Date.now() - this.active.startedAt > ANALYSIS_TIMEOUT_MS) throw new Error("Semantic analysis session expired");
    const activities = this.active.activities;
    const observedEventAt = this.active.observedEventAt;
    const previousRules = Array.isArray(store.smartRules) ? store.smartRules : [];
    const merged = new Map(previousRules.map((rule) => [rule.id, rule]));
    let refined = 0;
    let changed = 0;
    for (const decision of Array.isArray(decisions) ? decisions.slice(0, activities.length) : []) {
      const index = Math.round(Number(decision?.index));
      const activity = activities[index];
      const intent = String(decision?.intent || "");
      if (!activity || !ALLOWED_INTENTS.has(intent) || shouldRejectActivity(activity)) continue;
      const score = Math.max(0, Math.min(1, Number(decision?.score) || 0));
      const margin = Math.max(0, Math.min(1, Number(decision?.margin) || 0));
      const confidenceScore = Math.max(0.55, Math.min(0.9, Number(decision?.confidenceScore) || 0.55));
      const key = contextKey(activity);
      if (!key) continue;
      const id = `semantic-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
      const rule = {
        id,
        scope: "context",
        app: safeRuleText(activity.app, 120),
        title: safeRuleText(activity.title, 140),
        domain: safeRuleText(activity.domain, 180).toLowerCase(),
        match: safeRuleText(activity.title, 120),
        intent,
        source: "semantic-model",
        confidenceScore,
        evidence: `semantic ${score.toFixed(3)} / margin ${margin.toFixed(3)}`,
      };
      const previous = merged.get(id);
      if (!previous || previous.intent !== rule.intent || previous.confidenceScore !== rule.confidenceScore) changed += 1;
      merged.set(id, rule);
      refined += 1;
    }
    const persisted = [...merged.values()].slice(-2_000);
    store.replaceSmartRules(persisted);
    clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
    this.running = false;
    this.progress = 100;
    this.stage = "complete";
    this.lastRunAt = Date.now();
    this.lastResult = { status: "complete", candidates: activities.length, refined, changed, totalRules: persisted.length };
    for (const activity of activities) {
      const hash = contextHash(activity);
      if (hash) this.reviewedContextHashes.add(hash);
    }
    while (this.reviewedContextHashes.size > MAX_REVIEWED_CONTEXTS) this.reviewedContextHashes.delete(this.reviewedContextHashes.values().next().value);
    this.lastObservedEventAt = Math.max(this.lastObservedEventAt, Number(observedEventAt) || 0);
    this.active = null;
    this.persistAnalysisState();
    this.notify();
    return { ...this.lastResult };
  }

  cancel(error = "") {
    clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
    this.running = false;
    this.active = null;
    this.prepared = null;
    this.progress = 0;
    this.stage = error ? "error" : "idle";
    this.lastError = safeRuleText(error, 240);
    this.notify();
    return this.status();
  }
}

module.exports = {
  MODEL_ASSETS,
  MODEL_VERSION,
  TOTAL_MODEL_BYTES,
  AUTO_ANALYSIS_INTERVAL_MS,
  SemanticModelService,
  checksum,
  contextHash,
  releaseBase,
  shouldRejectActivity,
  SEMANTIC_MODEL_QUALITY,
};
