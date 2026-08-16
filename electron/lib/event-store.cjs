const fs = require("node:fs");
const path = require("node:path");
const { shouldRecord } = require("./privacy.cjs");
const { sessionize } = require("./sessionizer.cjs");
const { answerQuestion, suggestSkills } = require("./local-answer.cjs");
const { normalizeIntentRules } = require("./intent-classifier.cjs");

const DEFAULT_SETTINGS = {
  trackingEnabled: true,
  retentionHours: 48,
  excludePrivateWindows: true,
  collectWindowTitles: true,
  collectInputCounts: true,
  collectBrowserTabCount: true,
  autoStartEnabled: false,
  excludedApps: ["1Password", "Bitwarden", "KeePass"],
  intentRules: [],
  language: "en",
  onboardingComplete: false,
};

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function sanitizeMetadata(value, limit) {
  return String(value || "").replace(/\p{Cf}/gu, "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

class EventStore {
  constructor(root, onChange = () => {}, options = {}) {
    this.root = root;
    this.eventsDir = path.join(root, "events");
    this.skillsDir = path.join(root, "skills");
    this.settingsFile = path.join(root, "settings.json");
    this.onChange = onChange;
    this.eventsCache = null;
    this.stateCache = null;
    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.mkdirSync(this.skillsDir, { recursive: true });
    const defaults = { ...DEFAULT_SETTINGS, language: normalizeLanguage(options.defaultLanguage || DEFAULT_SETTINGS.language) };
    this.settings = { ...defaults, ...readJson(this.settingsFile, {}) };
    this.settings.language = normalizeLanguage(this.settings.language);
    this.settings.onboardingComplete = Boolean(this.settings.onboardingComplete);
    this.settings.intentRules = normalizeIntentRules(this.settings.intentRules);
    for (const key of ["trackingEnabled", "excludePrivateWindows", "collectWindowTitles", "collectInputCounts", "collectBrowserTabCount", "autoStartEnabled"]) {
      this.settings[key] = Boolean(this.settings[key]);
    }
    this.saveSettings();
    this.prune();
  }

  saveSettings() {
    const temporary = `${this.settingsFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.settings, null, 2), "utf8");
    fs.renameSync(temporary, this.settingsFile);
  }

  invalidate() {
    this.stateCache = null;
  }

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.settings.language = normalizeLanguage(this.settings.language);
    this.settings.intentRules = normalizeIntentRules(this.settings.intentRules);
    for (const key of ["trackingEnabled", "excludePrivateWindows", "collectWindowTitles", "collectInputCounts", "collectBrowserTabCount", "autoStartEnabled"]) {
      this.settings[key] = Boolean(this.settings[key]);
    }
    this.saveSettings();
    this.invalidate();
    this.onChange();
    return this.settings;
  }

  eventFile(at) {
    const date = new Date(at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}`;
    return path.join(this.eventsDir, `${key}.jsonl`);
  }

  append(event) {
    if (!this.settings.collectInputCounts && (event.kind === "input" || event.kind === "click")) return false;
    const normalized = {
      at: event.at || new Date().toISOString(),
      kind: event.kind,
      app: sanitizeMetadata(event.app || event.process || (this.settings.language === "ru" ? "Приложение" : "Application"), 120),
      process: sanitizeMetadata(event.process, 120),
      title: this.settings.collectWindowTitles ? sanitizeMetadata(event.title, 300) : "",
      count: Math.max(1, Number(event.count || 1)),
      context: ["browser", "messaging", "editor", "other"].includes(event.context) ? event.context : "other",
      tabCount: this.settings.collectBrowserTabCount ? Math.max(0, Math.min(200, Number(event.tabCount || 0))) : 0,
    };
    if (!shouldRecord(normalized, this.settings)) return false;
    fs.appendFileSync(this.eventFile(normalized.at), `${JSON.stringify(normalized)}\n`, "utf8");
    if (this.eventsCache) this.eventsCache.push(normalized);
    this.invalidate();
    this.onChange();
    return true;
  }

  loadEvents() {
    if (this.eventsCache) return this.eventsCache;
    const cutoff = Date.now() - this.settings.retentionHours * 60 * 60_000;
    const events = [];
    for (const name of fs.readdirSync(this.eventsDir).filter((item) => item.endsWith(".jsonl")).sort()) {
      const file = path.join(this.eventsDir, name);
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (new Date(event.at).getTime() >= cutoff) events.push(event);
        } catch { /* A truncated final line is ignored. */ }
      }
    }
    this.eventsCache = events;
    return this.eventsCache;
  }

  prune() {
    const cutoff = Date.now() - this.settings.retentionHours * 60 * 60_000;
    for (const name of fs.readdirSync(this.eventsDir).filter((item) => item.endsWith(".jsonl"))) {
      const file = path.join(this.eventsDir, name);
      try {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
        const kept = lines.filter((line) => {
          try { return new Date(JSON.parse(line).at).getTime() >= cutoff; } catch { return false; }
        });
        if (!kept.length) fs.unlinkSync(file);
        else if (kept.length !== lines.length) fs.writeFileSync(file, `${kept.join("\n")}\n`, "utf8");
      } catch { /* File may have disappeared between scans. */ }
    }
    if (this.eventsCache) this.eventsCache = this.eventsCache.filter((event) => new Date(event.at).getTime() >= cutoff);
    this.invalidate();
  }

  deleteAll() {
    for (const name of fs.readdirSync(this.eventsDir)) fs.rmSync(path.join(this.eventsDir, name), { force: true });
    this.eventsCache = [];
    this.invalidate();
    this.onChange();
  }

  deleteRange(start, end) {
    const min = Number(start);
    const max = Number(end);
    for (const name of fs.readdirSync(this.eventsDir).filter((item) => item.endsWith(".jsonl"))) {
      const file = path.join(this.eventsDir, name);
      const kept = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).filter((line) => {
        try { const at = new Date(JSON.parse(line).at).getTime(); return at < min || at > max; } catch { return false; }
      });
      if (kept.length) fs.writeFileSync(file, `${kept.join("\n")}\n`, "utf8"); else fs.rmSync(file, { force: true });
    }
    if (this.eventsCache) this.eventsCache = this.eventsCache.filter((event) => {
      const at = new Date(event.at).getTime();
      return at < min || at > max;
    });
    this.invalidate();
    this.onChange();
  }

  state() {
    if (this.stateCache) return this.stateCache;
    const events = this.loadEvents();
    this.stateCache = {
      settings: this.settings,
      sessions: sessionize(events, Date.now(), this.settings.language, this.settings.intentRules),
      eventCount: events.length,
      lastEventAt: events.length ? events.at(-1).at : null,
      skills: suggestSkills(events, new Date(), this.settings.language, this.settings.intentRules),
      dataPath: this.root,
      retentionCutoff: Date.now() - this.settings.retentionHours * 60 * 60_000,
    };
    return this.stateCache;
  }

  ask(question) {
    return answerQuestion(question, this.loadEvents(), new Date(), this.settings.language, this.settings.intentRules);
  }

  exportSkill(skill) {
    const safeId = String(skill.id || "workflow").replace(/[^a-zA-Z0-9_-]/g, "");
    const folder = path.join(this.skillsDir, safeId || "workflow");
    fs.mkdirSync(folder, { recursive: true });
    const english = this.settings.language === "en";
    const body = english
      ? `---\nname: ${safeId || "workflow"}\ndescription: ${skill.description}\n---\n\n# ${skill.title}\n\nThis skill was derived locally from repeated Daytrace activity.\n\n## Observed application sequence\n\n${(skill.apps || []).map((app, index) => `${index + 1}. ${app}`).join("\n")}\n\n## Safety\n\n- Confirm destructive or external actions before running them.\n- Do not copy private window contents or input values.\n- Treat this as a draft workflow and review it before use.\n`
      : `---\nname: ${safeId || "workflow"}\ndescription: ${skill.description}\n---\n\n# ${skill.title}\n\nЭтот навык создан локально из повторяющейся активности Daytrace.\n\n## Наблюдаемая последовательность приложений\n\n${(skill.apps || []).map((app, index) => `${index + 1}. ${app}`).join("\n")}\n\n## Безопасность\n\n- Подтверждайте разрушительные действия и внешние операции перед запуском.\n- Не копируйте содержимое приватных окон и значения полей ввода.\n- Считайте этот процесс черновиком и проверьте его перед использованием.\n`;
    const file = path.join(folder, "SKILL.md");
    fs.writeFileSync(file, body, "utf8");
    return file;
  }
}

module.exports = { DEFAULT_SETTINGS, EventStore, normalizeLanguage };
