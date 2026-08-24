function metrics({ cases, labelable, covered, correct, falseCertainty = 0 }) {
  return Object.freeze({
    cases,
    labelable,
    covered,
    correct,
    precision: correct / Math.max(1, covered),
    coverage: covered / Math.max(1, labelable),
    accuracy: correct / Math.max(1, labelable),
    falseCertainty,
  });
}

const ANALYSIS_ENGINE_QUALITY = Object.freeze({
  dataset: "Daytrace semantic RU/EN visible-title set",
  datasetVersion: "2026-08-24",
  interpretation: "same-curated-benchmark-not-personal-history",
  engines: Object.freeze({
    builtin: Object.freeze({
      version: "built-in",
      benchmark: metrics({ cases: 56, labelable: 48, covered: 27, correct: 25, falseCertainty: 2 }),
      holdout: metrics({ cases: 36, labelable: 32, covered: 23, correct: 21 }),
    }),
    signals: Object.freeze({
      version: "1.1.0",
      benchmark: metrics({ cases: 56, labelable: 48, covered: 28, correct: 26, falseCertainty: 2 }),
      holdout: metrics({ cases: 36, labelable: 32, covered: 23, correct: 21 }),
    }),
    semantic: Object.freeze({
      version: "1.0.0",
      benchmark: metrics({ cases: 56, labelable: 48, covered: 37, correct: 35, falseCertainty: 0 }),
      holdout: metrics({ cases: 36, labelable: 32, covered: 22, correct: 20 }),
    }),
  }),
});

const SEMANTIC_MODEL_QUALITY = Object.freeze({
  modelVersion: ANALYSIS_ENGINE_QUALITY.engines.semantic.version,
  dataset: ANALYSIS_ENGINE_QUALITY.dataset,
  datasetVersion: ANALYSIS_ENGINE_QUALITY.datasetVersion,
  benchmark: ANALYSIS_ENGINE_QUALITY.engines.semantic.benchmark,
  holdout: ANALYSIS_ENGINE_QUALITY.engines.semantic.holdout,
  interpretation: "curated-benchmark-not-personal-history",
});

module.exports = { ANALYSIS_ENGINE_QUALITY, SEMANTIC_MODEL_QUALITY, metrics };
