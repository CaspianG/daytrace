const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const { PassThrough, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const zlib = require("node:zlib");
const { EventStore, normalizeSettings } = require("./event-store.cjs");

const BACKUP_MAGIC = "DAYTRACE-ENC-BACKUP";
const BACKUP_VERSION = 1;
const HEADER_BYTES = 64;
const TAG_BYTES = 16;
const MAX_BACKUP_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_RESTORE_DECODED_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_RESTORE_RECORDS = 10_100_000;
const MAX_RESTORE_SKILLS = 1_000;
const MAX_RESTORE_SMART_CONTEXTS = 2_000;

function ensurePassphrase(value) {
  const passphrase = String(value || "");
  if (passphrase.length < 8 || passphrase.length > 512) throw new Error("Backup passphrase must contain 8 to 512 characters");
  return passphrase;
}

function secureMode(target, mode) {
  if (process.platform === "win32") return;
  try { fs.chmodSync(target, mode); } catch { }
}

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  secureMode(directory, 0o700);
}

function assertDirectChild(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error("Unsafe restore path");
  return resolved;
}

function eventLines(store) {
  const cutoff = Date.now() - store.settings.retentionHours * 60 * 60_000;
  return (function* iterate() {
    for (const name of fs.readdirSync(store.eventsDir).filter((item) => /^\d{4}-\d{2}-\d{2}-\d{2}\.jsonl$/.test(item)).sort()) {
      const file = path.join(store.eventsDir, name);
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (new Date(event.at).getTime() >= cutoff) yield event;
        } catch { }
      }
    }
  })();
}

function csvCell(value) {
  let text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  // Spreadsheet applications may execute cells beginning with these
  // characters as formulas even when the CSV field is quoted.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeAtomic(destination, writer) {
  const absolute = path.resolve(destination);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const token = crypto.randomBytes(6).toString("hex");
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${token}.tmp`);
  const previous = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${token}.previous`);
  return Promise.resolve(writer(temporary)).then(() => {
    let preserved = false;
    try {
      if (fs.existsSync(absolute)) {
        fs.renameSync(absolute, previous);
        preserved = true;
      }
      fs.renameSync(temporary, absolute);
      secureMode(absolute, 0o600);
      if (preserved) fs.rmSync(previous, { force: true });
      return absolute;
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch { }
      if (preserved) {
        try { fs.rmSync(absolute, { force: true }); } catch { }
        try { fs.renameSync(previous, absolute); } catch { }
      }
      throw error;
    }
  }).catch((error) => {
    try { fs.rmSync(temporary, { force: true }); } catch { }
    try { if (!fs.existsSync(absolute) && fs.existsSync(previous)) fs.renameSync(previous, absolute); } catch { }
    throw error;
  });
}

async function exportJson(store, destination, appVersion = "") {
  return writeAtomic(destination, async (temporary) => {
    async function* content() {
      yield `{"format":"daytrace-export","version":1,"appVersion":${JSON.stringify(String(appVersion || ""))},"exportedAt":${JSON.stringify(new Date().toISOString())},"settings":${JSON.stringify(store.settings)},"events":[`;
      let first = true;
      for (const event of eventLines(store)) {
        yield `${first ? "" : ","}${JSON.stringify(event)}`;
        first = false;
      }
      yield `],"smartContexts":${JSON.stringify(store.smartRules || [])}}\n`;
    }
    await pipeline(Readable.from(content()), fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
  });
}

async function exportCsv(store, destination) {
  return writeAtomic(destination, async (temporary) => {
    async function* content() {
      yield "at,kind,app,process,title,context,domain,url_path,tab_count,count,source\n";
      for (const event of eventLines(store)) {
        yield [event.at, event.kind, event.app, event.process, event.title, event.context, event.domain, event.urlPath, event.tabCount, event.count, event.source].map(csvCell).join(",") + "\n";
      }
    }
    await pipeline(Readable.from(content()), fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
  });
}

function backupRecords(store, appVersion) {
  return (function* iterate() {
    yield { type: "meta", format: "daytrace-backup-payload", version: 1, appVersion: String(appVersion || ""), createdAt: new Date().toISOString() };
    yield { type: "settings", value: store.settings };
    for (const event of eventLines(store)) yield { type: "event", value: event };
    for (const rule of store.smartRules || []) yield { type: "smart-context", value: rule };
    if (fs.existsSync(store.skillsDir)) {
      for (const folder of fs.readdirSync(store.skillsDir, { withFileTypes: true })) {
        if (!folder.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(folder.name)) continue;
        const file = path.join(store.skillsDir, folder.name, "SKILL.md");
        if (!fs.existsSync(file) || fs.statSync(file).size > 1024 * 1024) continue;
        yield { type: "skill", id: folder.name, value: fs.readFileSync(file, "utf8") };
      }
    }
    const model = path.join(store.root, "models", "daytrace-smart-v1.json");
    if (fs.existsSync(model) && fs.statSync(model).size <= 2 * 1024 * 1024) yield { type: "model", value: fs.readFileSync(model, "utf8") };
  })();
}

async function createEncryptedBackup(store, destination, passphrase, appVersion = "") {
  const password = ensurePassphrase(passphrase);
  return writeAtomic(destination, async (temporary) => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const header = Buffer.alloc(HEADER_BYTES);
    header.write(BACKUP_MAGIC, 0, "ascii");
    header.writeUInt32LE(BACKUP_VERSION, 24);
    salt.copy(header, 32);
    iv.copy(header, 48);
    fs.writeFileSync(temporary, header, { flag: "wx", mode: 0o600 });
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    async function* content() {
      for (const record of backupRecords(store, appVersion)) yield `${JSON.stringify(record)}\n`;
    }
    await pipeline(Readable.from(content()), zlib.createGzip({ level: 6 }), cipher, fs.createWriteStream(temporary, { flags: "a" }));
    fs.appendFileSync(temporary, cipher.getAuthTag());
  });
}

function readBackupEnvelope(source, passphrase) {
  const password = ensurePassphrase(passphrase);
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size <= HEADER_BYTES + TAG_BYTES || stat.size > MAX_BACKUP_BYTES) throw new Error("Backup file is invalid or too large");
  const file = fs.openSync(source, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    fs.readSync(file, header, 0, HEADER_BYTES, 0);
    if (header.subarray(0, BACKUP_MAGIC.length).toString("ascii") !== BACKUP_MAGIC || header.readUInt32LE(24) !== BACKUP_VERSION) throw new Error("Unsupported Daytrace backup");
    const tag = Buffer.alloc(TAG_BYTES);
    fs.readSync(file, tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
    const salt = header.subarray(32, 48);
    const iv = header.subarray(48, 60);
    const key = crypto.scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return { decipher, start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 };
  } finally {
    fs.closeSync(file);
  }
}

async function restoreEncryptedBackup(root, source, passphrase, options = {}) {
  const resolvedRoot = path.resolve(root);
  privateDirectory(resolvedRoot);
  const token = crypto.randomBytes(8).toString("hex");
  const stage = assertDirectChild(resolvedRoot, path.join(resolvedRoot, `.restore-stage-${token}`));
  const previous = assertDirectChild(resolvedRoot, path.join(resolvedRoot, `.restore-previous-${token}`));
  const renameSync = typeof options.renameSync === "function" ? options.renameSync : fs.renameSync;
  let preserveRecovery = false;
  privateDirectory(stage);
  const stagingStore = new EventStore(stage, () => {}, { defaultLanguage: options.defaultLanguage || "en" });
  stagingStore.updateSettings({ trackingEnabled: true, excludePrivateWindows: false, excludedApps: [], retentionHours: 365 * 24 });
  const envelope = readBackupEnvelope(source, passphrase);
  const input = fs.createReadStream(source, { start: envelope.start, end: envelope.end });
  const decoded = new PassThrough();
  const decoding = pipeline(input, envelope.decipher, zlib.createGunzip(), decoded);
  decoding.catch(() => {});
  const lines = readline.createInterface({ input: decoded, crlfDelay: Infinity });
  let settings = null;
  const smartRules = [];
  let eventCount = 0;
  let metaSeen = false;
  let settingsSeen = false;
  let modelSeen = false;
  let skillCount = 0;
  let recordCount = 0;
  let decodedBytes = 0;
  try {
    for await (const line of lines) {
      const lineBytes = Buffer.byteLength(line, "utf8") + 1;
      decodedBytes += lineBytes;
      recordCount += 1;
      if (lineBytes > 2 * 1024 * 1024) throw new Error("Backup record is too large");
      if (decodedBytes > MAX_RESTORE_DECODED_BYTES || recordCount > MAX_RESTORE_RECORDS) throw new Error("Backup payload exceeds restore limits");
      const record = JSON.parse(line);
      if (record.type === "meta") {
        if (metaSeen || recordCount !== 1 || record.format !== "daytrace-backup-payload" || Number(record.version) !== 1) throw new Error("Unsupported backup payload");
        metaSeen = true;
      } else if (record.type === "settings") {
        if (settingsSeen) throw new Error("Backup contains duplicate settings");
        settingsSeen = true;
        settings = normalizeSettings(record.value || {});
      }
      else if (record.type === "event") {
        if (eventCount >= 10_000_000) throw new Error("Backup contains too many events");
        stagingStore.append(record.value);
        eventCount += 1;
      } else if (record.type === "smart-context") {
        if (smartRules.length >= MAX_RESTORE_SMART_CONTEXTS) throw new Error("Backup contains too many smart contexts");
        smartRules.push(record.value);
      }
      else if (record.type === "skill" && /^[a-zA-Z0-9_-]{1,80}$/.test(record.id || "") && typeof record.value === "string" && Buffer.byteLength(record.value, "utf8") <= 1024 * 1024) {
        if (skillCount >= MAX_RESTORE_SKILLS) throw new Error("Backup contains too many skills");
        skillCount += 1;
        const folder = path.join(stagingStore.skillsDir, record.id);
        privateDirectory(folder);
        fs.writeFileSync(path.join(folder, "SKILL.md"), record.value, { encoding: "utf8", mode: 0o600 });
      } else if (record.type === "model" && typeof record.value === "string" && Buffer.byteLength(record.value, "utf8") <= 2 * 1024 * 1024) {
        if (modelSeen) throw new Error("Backup contains duplicate models");
        modelSeen = true;
        JSON.parse(record.value);
        const folder = path.join(stage, "models");
        privateDirectory(folder);
        fs.writeFileSync(path.join(folder, "daytrace-smart-v1.json"), record.value, { encoding: "utf8", mode: 0o600 });
      } else throw new Error("Backup contains an unsupported record");
    }
    await decoding;
    if (!metaSeen || !settings) throw new Error("Backup payload is incomplete");
    stagingStore.replaceSmartRules(smartRules);
    stagingStore.updateSettings(settings);

    privateDirectory(previous);
    const names = ["events", "skills", "models", "settings.json", "smart-contexts.json"];
    const movedPrevious = [];
    const movedStage = [];
    try {
      for (const name of names) {
        const current = path.join(resolvedRoot, name);
        if (!fs.existsSync(current)) continue;
        renameSync(current, path.join(previous, name));
        movedPrevious.push(name);
      }
      for (const name of names) {
        const candidate = path.join(stage, name);
        if (!fs.existsSync(candidate)) continue;
        renameSync(candidate, path.join(resolvedRoot, name));
        movedStage.push(name);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const name of movedStage.reverse()) {
        const current = path.join(resolvedRoot, name);
        try { if (fs.existsSync(current)) renameSync(current, path.join(stage, name)); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      for (const name of movedPrevious.reverse()) {
        const backup = path.join(previous, name);
        try { if (fs.existsSync(backup)) renameSync(backup, path.join(resolvedRoot, name)); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length) {
        preserveRecovery = true;
        const recoveryError = new Error(`Restore failed and automatic rollback was incomplete. Recovery data was preserved in ${previous}`);
        recoveryError.cause = error;
        throw recoveryError;
      }
      throw error;
    }
    try { fs.rmSync(previous, { recursive: true, force: true }); } catch { }
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch { }
    return { restored: true, eventCount, settings };
  } catch (error) {
    await decoding.catch(() => {});
    if (!preserveRecovery) {
      try { fs.rmSync(stage, { recursive: true, force: true }); } catch { }
      try { fs.rmSync(previous, { recursive: true, force: true }); } catch { }
    }
    throw error;
  }
}

module.exports = {
  BACKUP_MAGIC,
  BACKUP_VERSION,
  createEncryptedBackup,
  exportCsv,
  exportJson,
  restoreEncryptedBackup,
};
