/*! Open Historia - migrated residents and dated cursors pass the true game-state commit boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import { applyEventImpactsToWorld, normalizeWorldState } from "./gameState.js";
import { planNativeStatsLiveTurn } from "./statsLiveTurnClock.js";
import { mergeCountryStatPatch } from "./countryStats.js";

const start = "1913-05-08", end = "1913-06-07", later = "1913-07-07";
const sheet = (name, population) => mergeCountryStatPatch(null, {
  territorialComponents: [{ geography: `${name} mainland`, group: "core", population, gdpPerCapita: 2000 }],
  economy: { gdpGrowth: 2, inflation: 1, budgetBalance: -1, publicDebt: 35 },
  continuity: { assessedDate: start },
});
const state = () => normalizeWorldState({
  ownerCodes: ["Alba", "Borea"],
  polityOverrides: { Alba: { code: "Alba", name: "Alba" }, Borea: { code: "Borea", name: "Borea" } },
  countryStats: { Alba: sheet("Alba", 1_000_000), Borea: sheet("Borea", 500_000) },
  migrationFlows: [{ id: "a-to-b", fromPolity: "Alba", toPolity: "Borea", sourceDate:start,
    endDate: "1914-05-08", lastDate:start, baseSourcePopulation: 1_000_000, baseDestinationPopulation:500_000,
    totalPeople:36_500, creditedPeople:0, reason:"Author-approved resident transfer" }],
});
const advance = (world, fromDate, toDate) => {
  const boundary = planNativeStatsLiveTurn({ baseWorld:world, fromDate, toDate, round:2, events:[] });
  assert.ok(boundary);
  return applyEventImpactsToWorld({world,events:[],statsChronology:boundary}).world;
};
test("event reducer publishes both resident ledgers and the migration cursor atomically", () => {
  const original=state();
  const first=advance(original,start,end);
  assert.equal(first.countryStats.Alba.population.total,997000);
  assert.equal(first.countryStats.Borea.population.total,503000);
  assert.equal(first.migrationFlows[0].creditedPeople,3000,
    "dropping this cursor would replay the movement after save/reload");
  assert.equal(first.migrationFlows[0].lastDate,end);
  assert.equal(original.migrationFlows[0].creditedPeople,0);
  const reloaded=normalizeWorldState(JSON.parse(JSON.stringify(first)));
  const second=advance(reloaded,end,later);
  assert.equal(second.migrationFlows[0].creditedPeople,6000);
  assert.equal(second.countryStats.Alba.population.total,994000);
  assert.equal(second.countryStats.Borea.population.total,506000);
  assert.deepEqual(normalizeWorldState(JSON.parse(JSON.stringify(second))).migrationFlows,second.migrationFlows);
  // Replay/Undo publishes a detached earlier canonical snapshot, not a
  // fresh interpretation of a later migration receipt.
  assert.equal(original.countryStats.Alba.population.total,1_000_000);
  assert.equal(original.migrationFlows[0].creditedPeople,0);
});
