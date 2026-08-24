let activeAnalysis = null;

function languageFor(activity) {
  return /\p{Script=Cyrillic}/u.test(String(activity?.title || "")) ? "ru" : "en";
}

function transferableFiles(files, language) {
  const folder = language === "en" ? "semantic-en/" : "semantic/";
  const result = {};
  const transfer = [];
  for (const [key, value] of Object.entries(files || {})) {
    if (!key.startsWith(folder)) continue;
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
    const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    result[key] = buffer;
    transfer.push(buffer);
  }
  return { files: result, transfer };
}

function runLanguageWorker(api, input, language, position, languageCount) {
  const entries = input.activities
    .map((activity, index) => ({ activity, index }))
    .filter(({ activity }) => languageFor(activity) === language);
  if (!entries.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./semantic-analysis-worker.js", import.meta.url), { type: "module", name: `daytrace-semantic-${language}` });
    let settled = false;
    const finish = (error, decisions = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error); else resolve(decisions);
    };
    const timeout = setTimeout(() => finish(new Error(`Semantic ${language} analysis timed out`)), 3 * 60_000);
    worker.onmessage = async (event) => {
      const message = event.data || {};
      if (message.type === "progress") {
        const fraction = Math.max(0, Math.min(1, Number(message.progress || 0) / 100));
        const overall = 3 + ((position + fraction) / languageCount) * 94;
        await api.reportSemanticAnalysis(input.token, overall, message.stage).catch(() => {});
        return;
      }
      if (message.type === "complete") finish(null, message.decisions || []);
      if (message.type === "error") finish(new Error(message.error || `Semantic ${language} analysis failed`));
    };
    worker.onerror = (event) => finish(new Error(event.message || `Semantic ${language} worker failed`));
    const prepared = transferableFiles(input.files, language);
    worker.postMessage({ entries, language, files: prepared.files }, prepared.transfer);
  });
}

export async function runSemanticAnalysis(api = window.daytrace) {
  if (!api || activeAnalysis) return activeAnalysis;
  activeAnalysis = (async () => {
    const input = await api.beginSemanticAnalysis();
    if (input?.status !== "ready") return input;
    try {
      const languages = [...new Set((input.languages || input.activities.map(languageFor)).filter((language) => language === "ru" || language === "en"))];
      const decisions = [];
      for (let index = 0; index < languages.length; index += 1) {
        decisions.push(...await runLanguageWorker(api, input, languages[index], index, languages.length));
        // Let Chromium reclaim the terminated worker and its WASM arena before
        // another language runtime is created. This keeps bilingual batches
        // sequential in memory as well as on the CPU.
        if (index + 1 < languages.length) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return await api.finishSemanticAnalysis(input.token, decisions);
    } catch (error) {
      await api.failSemanticAnalysis(input.token, String(error?.message || error)).catch(() => {});
      throw error;
    }
  })();
  try { return await activeAnalysis; }
  finally { activeAnalysis = null; }
}
