import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import classifier from "../electron/lib/intent-classifier.cjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/intent-accuracy.json", import.meta.url), "utf8"));

test("RU/EN accuracy set keeps precision and coverage visible across common contexts", () => {
  const results = fixture.cases.map((item) => ({ ...item, predicted: classifier.inferIntentDetails(item).intent }));
  const labelable = results.filter((item) => item.expected !== "unknown");
  const covered = labelable.filter((item) => item.predicted !== "unknown");
  const correctCovered = covered.filter((item) => item.predicted === item.expected);
  const ambiguous = results.filter((item) => item.expected === "unknown");
  const falseCertainty = ambiguous.filter((item) => item.predicted !== "unknown");
  const coverage = covered.length / labelable.length;
  const precision = correctCovered.length / Math.max(1, covered.length);

  assert.ok(coverage >= 0.9, `coverage ${(coverage * 100).toFixed(1)}%; missed: ${labelable.filter((item) => item.predicted === "unknown").map((item) => item.title).join(" | ")}`);
  assert.ok(precision >= 0.94, `precision ${(precision * 100).toFixed(1)}%; errors: ${covered.filter((item) => item.predicted !== item.expected).map((item) => `${item.title}: ${item.predicted}`).join(" | ")}`);
  assert.equal(falseCertainty.length, 0, `ambiguous contexts were forced: ${falseCertainty.map((item) => `${item.title}: ${item.predicted}`).join(" | ")}`);

  for (const language of ["en", "ru"]) {
    const subset = labelable.filter((item) => item.language === language);
    assert.ok(subset.filter((item) => item.predicted === item.expected).length / subset.length >= 0.9, `${language} accuracy fell below 90%`);
  }
  for (const segment of ["browser", "messenger", "ide", "game", "video", "document", "meeting", "learning"]) {
    assert.ok(results.some((item) => item.segment === segment), `missing ${segment} coverage`);
  }
});
