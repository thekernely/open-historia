/*! Contract checks against the actual scenario-authoring UI integration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url),"utf8");
const library = readFileSync(new URL("./libraryBar.jsx", import.meta.url),"utf8");

test("Statistics starts with starting-country authoring while retaining the advanced custom-sheet editor",()=>{
  assert.match(library, /<ScenarioStatsAuthoringPanel/);
  assert.match(library, /Advanced - Customize full Statistics sheet/);
  assert.match(library, /<StatsSheetEditor value={statsValue}/);
  assert.match(library, /statsDefinitionDirty={formDiffers\(editorStats, editorStatsSavedRef.current\)}/);
  assert.match(library, /Unsaved edits and unapplied AI proposals will be lost/);
});

test("generation reads scenario geography and applies reviewed baselines to scenario, never running game",()=>{
  assert.match(panel,/downloadScenarioJsonAsset\(scenarioId, "regionsGeojson"\)/);
  assert.match(panel,/buildTargetStatsTerritorialBasisKernel/);
  assert.match(panel,/createReviewedScenarioStatsSheet/);
  assert.match(panel,/saveScenario\(scenarioId, \{ world: nextWorld \}\)/);
  assert.doesNotMatch(panel,/saveGame\(/);
  assert.match(panel,/loadScenarioDetails\(scenarioId\)/);
  assert.match(panel,/countryStats\?\.\[code\]\) !== prior/);
  assert.match(panel,/statsDefinitionUnavailable/);
});

test("AI proposals remain pending explicit author review and bounded batch budgets",()=>{
  assert.match(panel,/MAX_BATCH_COUNTRIES = 3/);
  assert.match(panel,/MAX_CALLS_PER_RUN = 10/);
  assert.match(panel,/Apply selected reviewed baselines/);
  assert.match(panel,/window.confirm\(`Save/);
  assert.match(panel,/No automatic application/);
});

test("live AI generation reports progress next to the buttons and parses bounded identities",()=>{
  assert.match(panel,/interpretScenarioStatsAiResponse\(response, prepared,/);
  assert.match(panel,/setProgress\("Preparing starting Statistics…"\)/);
  assert.match(panel,/role="status" aria-live="polite" aria-busy={busy}/);
  const nearButtons = panel.indexOf('role="status" aria-live="polite"');
  const form = panel.indexOf('Edit one country\'s starting values');
  assert.ok(nearButtons > 0 && form > nearButtons);
  assert.doesNotMatch(panel,/matches\.length !== 1/);
});
