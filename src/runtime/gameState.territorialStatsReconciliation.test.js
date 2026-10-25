/*! Open Historia - coupled legal border and national account publication.
 * Requires the real app dependency tree on Windows; source-only review cannot
 * substitute for this gameState integration test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { applyEventImpactsToWorld, normalizeWorldState } from "./gameState.js";

const catalog = [
  { id: "R1", name: "Riverland", country: "Alpha" },
  { id: "R2", name: "Hillland", country: "Alpha" },
  { id: "R3", name: "Eastland", country: "Beta" },
];
const part = (geography, population, gdpPerCapita) => ({ geography, population, gdpPerCapita, group: "core" });
const sheet = (territorialComponents) => ({ territorialScope: "mapped", statsSchemaVersion: 1,
  territorialComponents, economy: { inflation: 2, publicDebt: 0 } });
const world = () => ({
  countryStats: {
    Alpha: sheet([part("Riverland", 500, 100), part("Hillland", 300, 200)]),
    Beta: sheet([part("Eastland", 200, 150)]),
  },
  polityOverrides: { Alpha: { name: "Alpha" }, Beta: { name: "Beta" } },
  regionOwnershipOverrides: { R1: "Alpha", R2: "Alpha", R3: "Beta" },
});
const event = (impacts, date = "1915-06-10") => ({
  id: "qa-territorial-1", date, title: "Cession", description: "Formal treaty cession", impacts,
});
const cession = { regionId: "R1", fromCode: "Alpha", toCode: "Beta", basis: "treaty" };
const population = (state, polity) => state.countryStats[polity].population.total;

test("legal cession publishes region title and conserved population/GDP together", () => {
  const before = world();
  const result = applyEventImpactsToWorld({ world: before, events: [event({ regionTransfers: [cession] })], regionCatalog: catalog });
  assert.equal(result.world.regionOwnershipOverrides.R1, "Beta");
  assert.equal(population(result.world, "Alpha"), 300);
  assert.equal(population(result.world, "Beta"), 700);
  assert.equal(result.world.countryStats.Alpha.economy.gdp, 60000);
  assert.equal(result.world.countryStats.Beta.economy.gdp, 80000);
  assert.equal(population(normalizeWorldState(result.world), "Beta"), 700, "save normalization preserves movement");
  assert.equal(before.regionOwnershipOverrides.R1, "Alpha", "the input world is never published in place");
});

test("a missing catalog or uncertain component aborts the entire legal change", () => {
  const before = world();
  const frozen = JSON.stringify(before);
  assert.throws(() => applyEventImpactsToWorld({ world: before, events: [event({ regionTransfers: [cession] })] }), /requires the canonical region catalog/);
  assert.throws(() => applyEventImpactsToWorld({ world: before, regionCatalog: catalog,
    events: [event({ regionTransfers: [cession, { regionId: "UNKNOWN", fromCode: "Alpha", toCode: "Beta" }] })] }), /Unknown legal transfer region ID/);
  assert.equal(JSON.stringify(before), frozen);
});

test("occupation and claims do not transfer lawful resident or GDP accounts", () => {
  const before = world();
  const next = applyEventImpactsToWorld({ world: before,
    events: [event({ regionControlOps: [{ op: "control", regionId: "R1", fromCode: "Alpha", toCode: "Beta", basis: "occupation" }] })],
  }).world;
  assert.equal(next.regionOwnershipOverrides.R1, "Beta");
  assert.equal(next.regionSovereigntyOverrides.R1, "Alpha");
  assert.equal(population(next, "Alpha"), 800);
  assert.equal(population(next, "Beta"), 200);
});

test("a named post-annexation replay never transfers the component a second time", () => {
  const first = applyEventImpactsToWorld({ world: world(), regionCatalog: catalog,
    events: [event({ regionTransfers: [cession] })] }).world;
  const again = applyEventImpactsToWorld({ world: first, regionCatalog: catalog,
    events: [event({ regionTransfers: [cession] })] }).world;
  assert.equal(population(again, "Alpha"), 300);
  assert.equal(population(again, "Beta"), 700);
});

test("same-event national population effects rebase the final post-cession population", () => {
  const before = world();
  before.countryStats.Beta.continuity = { demographicClock: {
    sourceDate: "1915-06-09", endDate: "1916-06-09", lastDate: "1915-06-09",
    basePopulation: 200, birthsPerThousand: 25, deathsPerThousand: 10,
    creditedBirths: 0, creditedDeaths: 0,
  } };
  const next = applyEventImpactsToWorld({ world: before, regionCatalog: catalog,
    events: [event({ regionTransfers: [cession], polityChanges: [{ code: "Beta", operation: "update",
      statsEffects: { populationChange: 10, populationCause: "immigration", reason: "Registered civilian arrivals" } }] })],
  }).world;
  assert.equal(population(next, "Beta"), 710);
  assert.equal(next.countryStats.Beta.continuity.demographicClock.rebases.at(-1).basePopulation, 710);
});
