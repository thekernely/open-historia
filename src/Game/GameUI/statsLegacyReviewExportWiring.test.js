/*! UI regression for read-only scenario-wide Statistics review. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url), "utf8");

test("scenario authoring makes a separate, downloadable review without any canonical write", () => {
  assert.match(source, /summarizeScenarioNationalMetricAliasReviews\(statsValue, world, coverage\)/);
  assert.match(source, /serializeScenarioNationalMetricReviewCsv\(scenarioAliasReview\)/);
  assert.match(source, /import \{ saveTextToDisk \} from "\.\.\/\.\.\/runtime\/saveFile\.js"/);
  assert.match(source, /await saveTextToDisk\(/);
  assert.match(source, /"text\/csv;charset=utf-8"/);
  assert.doesNotMatch(source, /URL\.createObjectURL|\.download\s*=/);
  assert.match(source, /Export review CSV/);
  assert.match(source, /countriesNeedingReview\.has\(row\.code\)/);
  assert.match(source, /Matching duplicates - review required/);
  assert.match(source, /Different values/);
  assert.match(source, /await applyToScenario\(patches, guards\)/);
});
