import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync(new URL("./PoliticalWorldGenerationPanel.jsx", import.meta.url), "utf8");
const library = fs.readFileSync(new URL("./libraryBar.jsx", import.meta.url), "utf8");

test("Phase006C keeps AI generation behind review and uses scenario persistence only on explicit apply", () => {
  assert.match(panel, /generatePoliticalWorldProposals/);
  assert.match(panel, /reverifyPoliticalWorldProposals/);
  assert.match(panel, /Re-check History Only/);
  assert.match(panel, /applyReviewedPoliticalGeneration/);
  assert.match(panel, /loadScenarioDetails/);
  assert.match(panel, /saveScenario/);
  assert.match(panel, /Apply Selected/);
  assert.doesNotMatch(panel, /saveGame\s*\(/);
  assert.doesNotMatch(panel, /writeJson\s*\(/);
});

test("Phase006C is a first-class Scenario Editor Politics section rather than Map Editor state", () => {
  assert.match(library, /politics:\s*"Politics"/);
  assert.match(library, /PoliticalWorldGenerationPanel/);
  assert.match(library, /editorSection === "politics"/);
  assert.doesNotMatch(panel, /MapEditor/);
});

test("Politics generation mode selector remains readable in native dark control popups", () => {
  assert.match(panel, /colorScheme:\s*"dark"/);
  assert.match(panel, /<option[^>]+background:\s*"#2b2b30"[^>]+color:\s*"#f8fafc"/);
});


test("generation exposes determinate overall progress, ETA, and live validator diagnostics", () => {
  assert.match(panel, /role="progressbar"/);
  assert.match(panel, /polities resolved/);
  assert.match(panel, /Estimated remaining/);
  assert.match(panel, /Current rejection/);
  assert.match(panel, /normalizeProgressSampleError/);
  assert.match(panel, /progressSampleError\.polityKey \? ` — \$\{progressSampleError\.polityKey\}` : ""/);
  assert.match(panel, /resolvedPolities/);
  assert.match(panel, /totalPolities/);
  assert.match(panel, /sampleError/);
});

test("review/apply guards stale scenario dates and explicit roster expansion", () => {
  assert.match(panel, /Scenario start date changed/);
  assert.match(panel, /allowEntityExpansion/);
  assert.match(panel, /Allow roster expansion proposals/);
  assert.match(panel, /allowEntityExpansionByPolity/);
  assert.match(panel, /Nothing was applied/);
});

test("Politics generation includes a fixed 15-polity two-attempt test mode and downloadable diagnostics", () => {
  assert.match(panel, /Test 15 Polities/);
  assert.match(panel, /buildScenarioPoliticalGenerationTestInputs/);
  assert.match(panel, /maxAttempts:\s*2/);
  assert.match(panel, /maxBatchSize:\s*5/);
  assert.match(panel, /Download Run Log/);
  assert.match(panel, /political-world-generation-diagnostic/);
  assert.match(panel, /diagnostics:\s*result\.diagnostics/);
  assert.match(panel, /historicalVerification:\s*result\.historicalVerification/);
  assert.match(panel, /Checking exact-date political history/);
  assert.match(panel, /correctedTotal/);
  assert.match(panel, /collisionRechecks/);
  assert.match(panel, /Historical collision re-check/);
});


test("Political World review can be restored from a downloaded diagnostic without regeneration", () => {
  assert.match(panel, /Restore Run Log/);
  assert.match(panel, /restoreResultFromDiagnostic/);
  assert.match(panel, /political-world-generation-diagnostic/);
  assert.match(panel, /Restored Political World review from run log without any AI calls/);
  assert.match(panel, /Run log scenario date .* does not match current canonical date/);
  assert.match(panel, /duplicate accepted proposal/);
});

test("Phase006D fast landscape backfill is visible in progress UI", () => {
  assert.match(panel, /generationMode/);
  assert.match(panel, /quantitative-landscape-fast/);
  assert.match(panel, /Backfilling quantitative political landscapes/);
  assert.match(panel, /Landscape backfill/);
});

test("Phase006D.1 exposes a separate governing-alignment repair without reopening historical verification", () => {
  assert.match(panel, /Repair Governing Alignment/);
  assert.match(panel, /generatePoliticalGoverningAlignmentRepair/);
  assert.match(panel, /governing-alignment-repair/);
  assert.match(panel, /governing-alignment-fast/);
  assert.match(panel, /fillEmptyGovernmentPartyRefs:\s*row\.needs\.includes\("governing_alignment"\)/);
  assert.match(panel, /only fill missing rulingPartyIds \/ coalitionPartyIds from party IDs that already exist/);
  assert.match(panel, /never runs the historical verifier/);
  assert.match(panel, /runKind !== "governing-alignment-repair".*Re-check History Only/);
});
