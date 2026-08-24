const { contextKey, inferIntentDetails, normalizeIntentRules } = require("./intent-classifier.cjs");

const ENGINES = Object.freeze(["builtin", "signals", "semantic"]);

function ratio(value, total) {
  return Number(value || 0) / Math.max(1, Number(total || 0));
}

function matchingRules(smartRules, source) {
  return normalizeIntentRules(smartRules, 2_000).filter((rule) => rule.source === source);
}

function prediction(activity, engine, rulesByEngine) {
  const rules = engine === "signals"
    ? rulesByEngine.signals
    : engine === "semantic" ? rulesByEngine.semantic : [];
  return inferIntentDetails(activity, rules).intent;
}

function createAnalysisQualityAccumulator({ manualRules = [], smartRules = [] } = {}) {
  const contexts = new Map();
  const normalizedManualRules = normalizeIntentRules(manualRules);
  const rulesByEngine = {
    builtin: [],
    signals: matchingRules(smartRules, "smart-model"),
    semantic: matchingRules(smartRules, "semantic-model"),
  };
  let eventRows = 0;

  function add(activity) {
    eventRows += 1;
    const key = contextKey(activity);
    if (!key) return;
    const existing = contexts.get(key);
    if (existing) {
      existing.occurrences += 1;
      return;
    }
    contexts.set(key, { activity, occurrences: 1 });
  }

  function result(extra = {}) {
    const engineCounters = Object.fromEntries(ENGINES.map((engine) => [engine, {
      historyCovered: 0,
      labelledCovered: 0,
      labelledCorrect: 0,
      labelledOccurrences: 0,
      weightedCovered: 0,
      weightedCorrect: 0,
    }]));
    let labelledContexts = 0;
    let labelledOccurrences = 0;

    for (const { activity, occurrences } of contexts.values()) {
      const expected = inferIntentDetails(activity, normalizedManualRules);
      const labelled = expected.reason === "custom-rule";
      if (labelled) {
        labelledContexts += 1;
        labelledOccurrences += occurrences;
      }
      for (const engine of ENGINES) {
        const predicted = prediction(activity, engine, rulesByEngine);
        if (predicted !== "unknown") engineCounters[engine].historyCovered += 1;
        if (!labelled) continue;
        engineCounters[engine].labelledOccurrences += occurrences;
        if (predicted === "unknown") continue;
        engineCounters[engine].labelledCovered += 1;
        engineCounters[engine].weightedCovered += occurrences;
        if (predicted !== expected.intent) continue;
        engineCounters[engine].labelledCorrect += 1;
        engineCounters[engine].weightedCorrect += occurrences;
      }
    }

    const engineResults = {};
    for (const engine of ENGINES) {
      const counters = engineCounters[engine];
      engineResults[engine] = {
        ruleCount: rulesByEngine[engine].length,
        history: {
          contexts: contexts.size,
          covered: counters.historyCovered,
          coverage: ratio(counters.historyCovered, contexts.size),
        },
        personal: {
          labelled: labelledContexts,
          covered: counters.labelledCovered,
          correct: counters.labelledCorrect,
          precision: ratio(counters.labelledCorrect, counters.labelledCovered),
          coverage: ratio(counters.labelledCovered, labelledContexts),
          accuracy: ratio(counters.labelledCorrect, labelledContexts),
          occurrences: labelledOccurrences,
          weightedCoverage: ratio(counters.weightedCovered, labelledOccurrences),
          weightedAccuracy: ratio(counters.weightedCorrect, labelledOccurrences),
        },
      };
    }

    return {
      schemaVersion: 1,
      generatedAt: Date.now(),
      eventRows,
      contextCount: contexts.size,
      labelledContextCount: labelledContexts,
      labelledOccurrences,
      manualRuleCount: normalizedManualRules.length,
      engines: engineResults,
      ...extra,
    };
  }

  return { add, result };
}

function evaluateActivities(activities, options = {}) {
  const accumulator = createAnalysisQualityAccumulator(options);
  for (const activity of Array.isArray(activities) ? activities : []) accumulator.add(activity);
  return accumulator.result();
}

module.exports = { ENGINES, createAnalysisQualityAccumulator, evaluateActivities };
