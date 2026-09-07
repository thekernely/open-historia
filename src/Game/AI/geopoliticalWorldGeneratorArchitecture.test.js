import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const generator = fs.readFileSync(new URL("./geopoliticalWorldGenerator.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../GameUI/PoliticalWorldGenerationPanel.jsx", import.meta.url), "utf8");

test("geopolitical baseline uses one compact 48-polity provider transport", () => {
  assert.match(generator, /GEOPOLITICAL_WORLD_BATCH_SIZE = 48/);
  assert.match(generator, /politiesJson/);
  assert.match(generator, /agreementsJson/);
  assert.match(generator, /reasoningEnabled: false/);
  assert.doesNotMatch(generator, /historicalVerification|temporalSentinel|recheckHistory/i);
});

test("agreements can resolve canonical counterparts outside the current 48-polity profile batch", () => {
  assert.match(generator, /Canonical polity keys available for AGREEMENT counterpart resolution/);
  assert.match(generator, /Agreements may include a counterpart outside this batch/);
  assert.match(generator, /allPolityKeys/);
});

test("geopolitical baseline is era-universal rather than seeded from a modern institution menu", () => {
  assert.match(generator, /POWER TIERS ARE ERA-RELATIVE AND SCENARIO-RELATIVE/);
  assert.match(generator, /Never project present-day organizations backward into earlier eras/);
  assert.match(generator, /foundedDate/);
  assert.match(generator, /joinedDate/);
  assert.match(generator, /validateInstitutionTemporalBaseline/);
  assert.doesNotMatch(generator, /Use stable lowercase ids:\s*nato/i);
});

test("Scenario Editor exposes a separate review/apply geopolitical baseline action", () => {
  assert.match(panel, /Generate Geopolitical Baseline/);
  assert.match(panel, /Apply Geopolitical Baseline/);
  assert.match(panel, /world\.powerStatus \/ world\.institutions \/ world\.agreements/);
});
