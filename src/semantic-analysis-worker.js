import { AutoModel, AutoTokenizer, env } from "@huggingface/transformers";
import wasmModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import wasmBinaryUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { SEMANTIC_INTENTS, semanticDecision, semanticPrototypes, semanticText, shouldSkipSemantic, unitVector } from "./semantic-analysis-core.js";

const MODEL_IDS = { ru: "daytrace-semantic", en: "daytrace-semantic-en" };
const MODEL_FOLDERS = { ru: "semantic", en: "semantic-en" };
let localFiles = new Map();

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/daytrace-semantic-models/";
env.useBrowserCache = false;
env.useCustomCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = { mjs: wasmModuleUrl, wasm: wasmBinaryUrl };

function localFileKey(input) {
  const url = decodeURIComponent(typeof input === "string" ? input : input?.url || String(input));
  for (const language of ["en", "ru"]) {
    for (const marker of [`/daytrace-semantic-models/${MODEL_IDS[language]}/`, `/${MODEL_IDS[language]}/resolve/main/`]) {
      const index = url.indexOf(marker);
      if (index >= 0) return `${MODEL_FOLDERS[language]}/${url.slice(index + marker.length)}`;
    }
  }
  return "";
}

env.fetch = async (input) => {
  const key = localFileKey(input);
  const bytes = localFiles.get(key);
  if (!bytes) throw new Error(`Blocked non-local semantic model request: ${key || "unknown"}`);
  const body = bytes.slice(0);
  return new Response(body, { status: 200, headers: { "Content-Length": String(body.byteLength), "Content-Type": key.endsWith(".json") ? "application/json" : "application/octet-stream" } });
};

function languageFor(activity) {
  return /\p{Script=Cyrillic}/u.test(String(activity?.title || "")) ? "ru" : "en";
}

function releaseLanguageFiles(language) {
  const folder = `${MODEL_FOLDERS[language]}/`;
  for (const key of localFiles.keys()) if (key.startsWith(folder)) localFiles.delete(key);
}

function pooledVectors(output, inputs, pooling) {
  const hidden = output.last_hidden_state.tolist();
  if (pooling === "cls") return hidden.map((tokens) => unitVector(tokens[0]));
  const masks = inputs.attention_mask.tolist();
  return hidden.map((tokens, row) => {
    const sum = new Array(tokens[0].length).fill(0);
    let count = 0;
    for (let token = 0; token < tokens.length; token += 1) {
      if (!Number(masks[row][token])) continue;
      count += 1;
      for (let index = 0; index < sum.length; index += 1) sum[index] += tokens[token][index];
    }
    return unitVector(sum.map((value) => value / Math.max(1, count)));
  });
}

async function embedTexts(model, tokenizer, texts, pooling, onProgress) {
  const result = [];
  const batchSize = 16;
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const inputs = await tokenizer(batch, { padding: true, truncation: true, max_length: 64 });
    result.push(...pooledVectors(await model(inputs), inputs, pooling));
    onProgress(Math.min(1, (offset + batch.length) / Math.max(1, texts.length)));
  }
  return result;
}

async function analyzeLanguage(language, indexedActivities, progressStart, progressEnd) {
  if (!indexedActivities.length) return [];
  const id = MODEL_IDS[language];
  self.postMessage({ type: "progress", progress: progressStart, stage: `loading-${language}` });
  const tokenizer = await AutoTokenizer.from_pretrained(id, { local_files_only: true });
  const model = await AutoModel.from_pretrained(id, {
    local_files_only: true,
    dtype: "q8",
    device: "wasm",
    session_options: {
      executionMode: "sequential",
      enableCpuMemArena: false,
      enableMemPattern: false,
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
    },
  });
  try {
    const prototypes = semanticPrototypes(language);
    const prototypeTexts = SEMANTIC_INTENTS.flatMap((intent) => prototypes[intent]);
    const texts = [...prototypeTexts, ...indexedActivities.map(({ activity }) => semanticText(activity))];
    const pooling = language === "ru" ? "cls" : "mean";
    const vectors = await embedTexts(model, tokenizer, texts, pooling, (fraction) => {
      self.postMessage({ type: "progress", progress: Math.round(progressStart + (progressEnd - progressStart) * fraction), stage: `analyzing-${language}` });
    });
    const prototypeVectors = {};
    let offset = 0;
    for (const intent of SEMANTIC_INTENTS) {
      prototypeVectors[intent] = vectors.slice(offset, offset + prototypes[intent].length);
      offset += prototypes[intent].length;
    }
    const options = language === "ru"
      ? { minimumScore: 0.52, minimumMargin: 0.02 }
      : { minimumScore: 0.19, minimumMargin: 0.04 };
    const decisions = [];
    indexedActivities.forEach(({ activity, index }, activityIndex) => {
      if (shouldSkipSemantic(activity)) return;
      const decision = semanticDecision(vectors[offset + activityIndex], prototypeVectors, options);
      if (decision) decisions.push({ index, ...decision });
    });
    return decisions;
  } finally {
    await model.dispose();
    releaseLanguageFiles(language);
  }
}

self.onmessage = async (event) => {
  try {
    const files = event.data?.files || {};
    localFiles = new Map(Object.entries(files).map(([key, value]) => [key, value instanceof ArrayBuffer ? value : value?.buffer]));
    const language = event.data?.language === "ru" ? "ru" : "en";
    const indexed = Array.isArray(event.data?.entries)
      ? event.data.entries.slice(0, 160).filter((entry) => Number.isInteger(entry?.index) && entry?.activity && languageFor(entry.activity) === language)
      : [];
    const decisions = await analyzeLanguage(language, indexed, 8, 94);
    localFiles.clear();
    self.postMessage({ type: "complete", decisions });
  } catch (error) {
    localFiles.clear();
    self.postMessage({ type: "error", error: String(error?.message || error) });
  }
};
