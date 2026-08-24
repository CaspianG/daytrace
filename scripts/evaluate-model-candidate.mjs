import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AutoModel, AutoTokenizer, env } from "@huggingface/transformers";
import { SEMANTIC_INTENTS, scoreSemanticVector, semanticPrototypes, semanticText, shouldSkipSemantic, unitVector } from "../src/semantic-analysis-core.js";

const modelArgument = process.argv.find((argument) => argument.startsWith("--model="));
const cacheArgument = process.argv.find((argument) => argument.startsWith("--cache="));
const prefixArgument = process.argv.find((argument) => argument.startsWith("--prefix="));
const modelId = modelArgument?.slice("--model=".length) || "Xenova/multilingual-e5-small";
const cacheDir = cacheArgument ? path.resolve(cacheArgument.slice("--cache=".length)) : path.resolve(".candidate-model-cache");
const textPrefix = prefixArgument ? prefixArgument.slice("--prefix=".length) : /(?:^|[/-])e5(?:-|$)/i.test(modelId) ? "query: " : "";
const allowDownload = process.argv.includes("--allow-download");
const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/semantic-accuracy.json", import.meta.url), "utf8"));

env.allowRemoteModels = allowDownload;
env.allowLocalModels = true;
env.cacheDir = cacheDir;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

function meanPool(output, inputs) {
  const hidden = output.last_hidden_state.tolist();
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

async function embed(model, tokenizer, texts) {
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += 16) {
    const batch = texts.slice(offset, offset + 16).map((value) => `${textPrefix}${value}`);
    const inputs = await tokenizer(batch, { padding: true, truncation: true, max_length: 64 });
    vectors.push(...meanPool(await model(inputs), inputs));
  }
  return vectors;
}

function metrics(items, thresholds) {
  const evaluated = items.map((item) => {
    const predicted = shouldSkipSemantic(item)
      || item.raw.winner.score < thresholds.minimumScore
      || item.raw.margin < thresholds.minimumMargin
      ? "unknown"
      : item.raw.winner.intent;
    return { ...item, predicted };
  });
  const labelable = evaluated.filter((item) => item.expected !== "unknown");
  const covered = labelable.filter((item) => item.predicted !== "unknown");
  const correct = covered.filter((item) => item.predicted === item.expected);
  return {
    cases: evaluated.length,
    labelable: labelable.length,
    covered: covered.length,
    correct: correct.length,
    precision: correct.length / Math.max(1, covered.length),
    coverage: covered.length / Math.max(1, labelable.length),
    falseCertainty: evaluated.filter((item) => item.expected === "unknown" && item.predicted !== "unknown").length,
    failures: evaluated.filter((item) => item.predicted !== "unknown" && item.predicted !== item.expected).map(({ language, title, expected, predicted }) => ({ language, title, expected, predicted })),
  };
}

function tune(training) {
  let best = null;
  for (let score = 0.2; score <= 0.9; score += 0.01) {
    for (let margin = 0; margin <= 0.15; margin += 0.005) {
      const thresholds = { minimumScore: Number(score.toFixed(3)), minimumMargin: Number(margin.toFixed(3)) };
      const result = metrics(training, thresholds);
      if (result.falseCertainty || result.precision < 0.94) continue;
      if (!best || result.coverage > best.result.coverage || (result.coverage === best.result.coverage && result.precision > best.result.precision)) best = { thresholds, result };
    }
  }
  return best || { thresholds: { minimumScore: 0.5, minimumMargin: 0.05 }, result: metrics(training, { minimumScore: 0.5, minimumMargin: 0.05 }) };
}

const startedAt = performance.now();
fs.mkdirSync(cacheDir, { recursive: true });
const tokenizer = await AutoTokenizer.from_pretrained(modelId, { local_files_only: !allowDownload });
const model = await AutoModel.from_pretrained(modelId, {
  local_files_only: !allowDownload,
  dtype: "q8",
  device: "cpu",
  session_options: { executionMode: "sequential", enableCpuMemArena: false, enableMemPattern: false, intraOpNumThreads: 1, interOpNumThreads: 1 },
});

try {
  const all = [];
  for (const language of ["ru", "en"]) {
    const prototypes = semanticPrototypes(language);
    const prototypeTexts = SEMANTIC_INTENTS.flatMap((intent) => prototypes[intent]);
    const cases = fixture.cases.filter((item) => item.language === language);
    const vectors = await embed(model, tokenizer, [...prototypeTexts, ...cases.map(semanticText)]);
    const prototypeVectors = {};
    let offset = 0;
    for (const intent of SEMANTIC_INTENTS) {
      prototypeVectors[intent] = vectors.slice(offset, offset + prototypes[intent].length);
      offset += prototypes[intent].length;
    }
    cases.forEach((item, index) => all.push({ ...item, raw: scoreSemanticVector(vectors[offset + index], prototypeVectors) }));
  }
  const training = all.filter((item) => item.set !== "holdout");
  const holdout = all.filter((item) => item.set === "holdout");
  const tuned = Object.fromEntries(["ru", "en"].map((language) => [language, tune(training.filter((item) => item.language === language))]));
  const evaluateSplit = (items) => {
    const perLanguage = Object.fromEntries(["ru", "en"].map((language) => [language, metrics(items.filter((item) => item.language === language), tuned[language].thresholds)]));
    return {
      perLanguage,
      combined: {
        cases: Object.values(perLanguage).reduce((sum, item) => sum + item.cases, 0),
        labelable: Object.values(perLanguage).reduce((sum, item) => sum + item.labelable, 0),
        covered: Object.values(perLanguage).reduce((sum, item) => sum + item.covered, 0),
        correct: Object.values(perLanguage).reduce((sum, item) => sum + item.correct, 0),
        falseCertainty: Object.values(perLanguage).reduce((sum, item) => sum + item.falseCertainty, 0),
      },
    };
  };
  const trainingResult = evaluateSplit(training);
  const holdoutResult = evaluateSplit(holdout);
  for (const split of [trainingResult, holdoutResult]) {
    split.combined.precision = split.combined.correct / Math.max(1, split.combined.covered);
    split.combined.coverage = split.combined.covered / Math.max(1, split.combined.labelable);
  }
  const cacheBytes = fs.readdirSync(cacheDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath || entry.path, entry.name)).size, 0);
  console.log(JSON.stringify({ modelId, dtype: "q8", textPrefix, cacheBytes, durationMs: Math.round(performance.now() - startedAt), thresholds: Object.fromEntries(Object.entries(tuned).map(([language, value]) => [language, value.thresholds])), training: trainingResult, holdout: holdoutResult }, null, 2));
} finally {
  await model.dispose();
}
