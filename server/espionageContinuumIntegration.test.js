import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const gameplay = fs.readFileSync(path.resolve(here, "../src/Game/AI/gameplay.js"), "utf8");

test("Continuum promotes late espionage outcomes into real player-facing campaign events", () => {
  assert.match(gameplay, /importance: notice\?\.kind === "suspected" \? "minor" : "major"/);
  assert.match(gameplay, /kind: "diplomacy"/);
  assert.match(gameplay, /notable: true/);
  assert.match(gameplay, /playerRelated: true/);
  assert.match(gameplay, /source: "espionage"/);
});

test("Continuum links espionage events into current turn history and canonical relations", () => {
  assert.match(gameplay, /const espionageEventIds = \[\]/);
  assert.match(gameplay, /\.\.\.espionageEventIds/);
  assert.match(gameplay, /const espionageRelationUpdates = \[\]/);
  assert.match(gameplay, /Math\.round\(baseScore\) - 20/);
  assert.match(gameplay, /relationUpdates: \[\.\.\.relationUpdates, \.\.\.espionageRelationUpdates\]/);
  assert.match(gameplay, /Public exposure of \$\{owner\}'s espionage operation in \$\{target\}/);
});

test("political intelligence rides the existing spy report and seal instead of a second ledger", () => {
  assert.match(gameplay, /politicalIntelligenceAccess\(bundle\.world, name/);
  assert.match(gameplay, /buildCollectedPoliticalSignals/);
  assert.match(gameplay, /sealPoliticalAssessment\(seal, reportId, politicalAssessment\)/);
  assert.match(gameplay, /openPoliticalAssessment\(world\.spySeal, reportId, entry\.politicalAssessment\)/);
  assert.match(gameplay, /spyId: spy\.id/);
  assert.match(gameplay, /planted: spy\.status === "turned"/);
});
