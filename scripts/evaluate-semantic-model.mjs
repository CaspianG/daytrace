import fs from "node:fs";
import path from "node:path";
import { AutoModel, AutoTokenizer, env } from "@huggingface/transformers";
import { SEMANTIC_INTENTS, scoreSemanticVector, semanticDecision, semanticPrototypes, semanticText, shouldSkipSemantic, unitVector } from "../src/semantic-analysis-core.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/semantic-accuracy.json", import.meta.url), "utf8"));

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

async function evaluateLanguage(language, root, modelId, pooling) {
  env.localModelPath = `${root}${path.sep}`;
  const tokenizer = await AutoTokenizer.from_pretrained(modelId, { local_files_only: true });
  const model = await AutoModel.from_pretrained(modelId, { local_files_only: true, dtype: "q8", device: "cpu" });
  const prototypes = semanticPrototypes(language);
  const prototypeTexts = SEMANTIC_INTENTS.flatMap((intent) => prototypes[intent]);
  const cases = fixture.cases.filter((item) => item.language === language);
  const inputs = await tokenizer([...prototypeTexts, ...cases.map(semanticText)], { padding: true, truncation: true, max_length: 64 });
  const embeddings = pooledVectors(await model(inputs), inputs, pooling);
  const prototypeVectors = {};
  let offset = 0;
  for (const intent of SEMANTIC_INTENTS) {
    prototypeVectors[intent] = embeddings.slice(offset, offset + prototypes[intent].length);
    offset += prototypes[intent].length;
  }
  const results = cases.map((item, index) => {
    const raw = scoreSemanticVector(embeddings[offset + index], prototypeVectors);
    const options = language === "ru"
      ? { minimumScore: 0.52, minimumMargin: 0.02 }
      : { minimumScore: 0.19, minimumMargin: 0.04 };
    const decision = shouldSkipSemantic(item) ? null : semanticDecision(embeddings[offset + index], prototypeVectors, options);
    return { ...item, decision, raw: { winner: raw.winner, runnerUp: raw.runnerUp, margin: raw.margin }, predicted: decision?.intent || "unknown" };
  });
  await model.dispose();
  return results;
}

const probeRussianEncoderForEnglish = process.argv.includes("--probe-ru-for-en");
const englishModelArgument = process.argv.find((argument) => argument.startsWith("--english-model="));
const englishModelPath = englishModelArgument ? path.resolve(englishModelArgument.slice("--english-model=".length)) : path.resolve("models", "semantic-en");
const results = [
  ...await evaluateLanguage("ru", path.resolve("models"), "semantic", "cls"),
  ...await evaluateLanguage("en", probeRussianEncoderForEnglish ? path.resolve("models") : path.dirname(englishModelPath), probeRussianEncoderForEnglish ? "semantic" : path.basename(englishModelPath), probeRussianEncoderForEnglish ? "cls" : "mean"),
];
const falseCertainty = results.filter((item) => item.expected === "unknown" && item.predicted !== "unknown");
function metrics(items) {
  const labelable = items.filter((item) => item.expected !== "unknown");
  const covered = labelable.filter((item) => item.predicted !== "unknown");
  const correct = covered.filter((item) => item.predicted === item.expected);
  return { cases: items.length, labelable: labelable.length, covered: covered.length, correct: correct.length, precision: correct.length / Math.max(1, covered.length), coverage: covered.length / Math.max(1, labelable.length) };
}
const summary = {
  ...metrics(results),
  falseCertainty: falseCertainty.length,
  languages: Object.fromEntries(["ru", "en"].map((language) => [language, metrics(results.filter((item) => item.language === language))])),
  holdout: metrics(results.filter((item) => item.set === "holdout")),
};
console.log(JSON.stringify(process.argv.includes("--details") ? { ...summary, results } : summary, null, 2));
const gatesPass = summary.precision >= 0.94
  && summary.coverage >= 0.7
  && summary.holdout.precision >= 0.9
  && summary.holdout.coverage >= 0.65
  && Object.values(summary.languages).every((item) => item.precision >= 0.9 && item.coverage >= 0.65)
  && falseCertainty.length === 0;
if (!gatesPass) {
  const failures = results.filter((item) => item.predicted !== "unknown" && item.predicted !== item.expected);
  console.error(JSON.stringify({ failures, falseCertainty }, null, 2));
}
if (!gatesPass && !probeRussianEncoderForEnglish) process.exitCode = 1;
