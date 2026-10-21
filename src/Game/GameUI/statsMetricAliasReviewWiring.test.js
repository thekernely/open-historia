import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url), "utf8");

test("starting Statistics authoring displays potential saved conflicts without changing save ownership", () => {
  assert.match(panelSource, /reviewScenarioNationalMetricAliases\(statsValue, currentSheet\)/);
  assert.match(panelSource, /aliasReviewRows\.map\(/);
  assert.match(panelSource, /item\.nativePath/);
  assert.match(panelSource, /item\.customPath/);
  assert.match(panelSource, /Canonical conflict/);
  assert.match(panelSource, /await applyToScenario\(patches, guards\)/);
});

test("AI proposals disclose a potential mismatch before author applies them", () => {
  assert.match(panelSource, /reviewScenarioNationalMetricAliases\(statsValue, row\.sheet\)\.some\(/);
  assert.match(panelSource, /item\.status === "different"/);
  assert.match(panelSource, /Apply selected reviewed baselines/);
});
