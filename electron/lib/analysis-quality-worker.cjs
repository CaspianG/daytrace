const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const { createAnalysisQualityAccumulator } = require("./analysis-quality.cjs");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

async function evaluateDataRoot(root, now = Date.now()) {
  const settings = readJson(path.join(root, "settings.json"), {});
  const smartRules = readJson(path.join(root, "smart-contexts.json"), []);
  const retentionHours = Math.max(48, Math.min(365 * 24, Math.round(Number(settings.retentionHours)) || 48));
  const cutoff = now - retentionHours * 60 * 60_000;
  const accumulator = createAnalysisQualityAccumulator({ manualRules: settings.intentRules, smartRules });
  const eventsDir = path.join(root, "events");
  const files = fs.existsSync(eventsDir)
    ? fs.readdirSync(eventsDir).filter((name) => /^\d{4}-\d{2}-\d{2}-\d{2}\.jsonl$/.test(name)).sort()
    : [];

  for (const name of files) {
    const input = fs.createReadStream(path.join(eventsDir, name), { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        const at = new Date(event.at).getTime();
        if (Number.isFinite(at) && at >= cutoff) accumulator.add(event);
      } catch { /* A malformed or truncated event cannot affect aggregate quality. */ }
    }
  }
  return accumulator.result({ retentionHours, cutoff, fileCount: files.length });
}

if (!isMainThread) {
  evaluateDataRoot(workerData.root, Number(workerData.now) || Date.now())
    .then((result) => parentPort.postMessage({ ok: true, result }))
    .catch((error) => parentPort.postMessage({ ok: false, error: String(error?.message || error) }));
}

module.exports = { evaluateDataRoot };
