/*! Contract checks against the actual scenario-authoring UI integration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url),"utf8");
const library = readFileSync(new URL("./libraryBar.jsx", import.meta.url),"utf8");

test("Statistics starts with starting-country authoring while retaining the advanced custom-sheet editor",()=>{
  assert.match(library, /<ScenarioStatsAuthoringPanel/);
  assert.match(library, /advancedEditor=\{<StatsSheetEditor/);
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

// The authoring path is separate from in-game countryStatSheet generation.
// Comparability is checked across pending drafts and already-approved sheets,
// with an explicit review gate; it never changes canonical totals by itself.
test("scenario-wide economic comparability is integrated into review rather than gameplay", () => {
  assert.match(panel, /auditScenarioEconomicComparability/);
  assert.match(panel, /planned\[code\] = proposal\.sheet/);
  assert.match(panel, /economicComparability\.warnings/);
  assert.match(panel, /chosenCodes\.has\(warning\.lowerCode\)/);
  assert.match(panel, /window\.confirm\(`Save/);
  assert.match(panel, /SCENARIO_GDP_ACCOUNTING_UNIT/);
  assert.match(panel, /serializeScenarioEconomicComparabilityCsv/);
  assert.doesNotMatch(panel, /countryStats\s*=\s*economicComparability/);
});

// Regression: a modified dashboard definition plus paid, valid AI proposals
// previously deadlocked: scenario Save rejected proposals while Apply rejected
// the unsaved definition. The independent asset-only save keeps drafts intact.
test("pending AI proposals can coexist with a definition-only Save, with no implicit approval", () => {
  assert.match(panel, /Save Statistics sheet definition \(keep proposals\)/);
  assert.match(panel, /await onSaveStatsDefinition\(\)/);
  assert.match(library, /const handleSaveStatsDefinitionOnly = async \(\) =>/);
  assert.match(library, /const persistScenarioStatsDefinition = async/);
  assert.match(library, /onSaveStatsDefinition=\{handleSaveStatsDefinitionOnly\}/);
  assert.match(library, /setEditorDetails\(saved\)/);
  assert.doesNotMatch(library.slice(library.indexOf("const handleSaveStatsDefinitionOnly"), library.indexOf("const handleSave = async")), /countryStats:\s*\{/);
  assert.match(panel, /await applyToScenario\(patches, guards\)/);
});

test("comparison flags stay review-only and proposals cannot bypass changed metric definitions", () => {
  assert.match(panel, /no numerical edits are required by this warning/);
  assert.match(panel, /generatedDate: scenarioDate, authoringContract: proposalContract/);
  assert.match(panel, /const staleProposal = \(row\) =>/);
  assert.match(panel, /row\.sheet\?\.continuity\?\.assessedDate !== scenarioDate/);
  assert.match(panel, /selectedRows\.find\(staleProposal\)/);
  assert.match(panel, /scenarioStatsRequiredReady\(row\.sheet, customKeys, customDefinition\)/);
  assert.match(panel, /if \(customDefinition\) assertNoLegacyNativeStatCopies\(customDefinition, row\.sheet\)/);
});
