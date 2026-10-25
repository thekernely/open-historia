/*! Open Historia - legal territorial Statistics conservation and identity regressions. */
import test from "node:test";
import assert from "node:assert/strict";
import { planLegalTerritorialStatsTransfers } from "./territorialStatsReconciliation.js";

const component = (geography, population, gdpPerCapita, group = "core") =>
  ({ geography, population, gdpPerCapita, group });
const sheet = (parts) => ({ territorialScope: "mapped", statsSchemaVersion: 1,
  territorialComponents: parts, economy: { inflation: 2, publicDebt: 10 } });
const regions = [
  { id: "A1", name: "Riverland", country: "Alpha" },
  { id: "A2", name: "Hillland", country: "Alpha" },
  { id: "B1", name: "Eastland", country: "Beta" },
];
const initial = () => ({
  countryStats: {
    Alpha: sheet([component("Riverland", 500, 100), component("Hillland", 300, 200)]),
    Beta: sheet([component("Eastland", 200, 150)]),
  },
  regionOwnershipOverrides: {}, regionSovereigntyOverrides: {},
});
const transfer = (regionId = "A1", toCode = "Beta") => ({ regionId, fromCode: "Alpha", toCode });
const pop = (world, name) => world.countryStats[name].population.total;
const gdp = (world, name) => world.countryStats[name].economy.gdp;

test("moves only a legally transferred component and conserves population and territorial GDP", () => {
  const world = initial();
  const serialized = JSON.stringify(world);
  const result = planLegalTerritorialStatsTransfers(world, [transfer()], regions);
  assert.deepEqual(result.movements, [{ regionId: "A1", fromPolity: "Alpha", toPolity: "Beta", population: 500, gdp: 50000 }]);
  assert.equal(pop(result, "Alpha"), 300);
  assert.equal(pop(result, "Beta"), 700);
  assert.equal(gdp(result, "Alpha"), 60000);
  assert.equal(gdp(result, "Beta"), 80000);
  assert.equal(JSON.stringify(world), serialized, "planning must never mutate the detached event base");
});

test("third-party occupation does not substitute for lawful sovereign title", () => {
  const world = initial();
  world.regionOwnershipOverrides.A1 = "Occupier";
  world.regionSovereigntyOverrides.A1 = "Alpha";
  const result = planLegalTerritorialStatsTransfers(world, [{ regionId: "A1", fromCode: "Alpha", toCode: "Beta" }], regions);
  assert.equal(result.movements[0].fromPolity, "Alpha");
  assert.equal(pop(result, "Beta"), 700);
  assert.equal(planLegalTerritorialStatsTransfers(world, [], regions), null, "occupation without cession is not a Stats mutation");
});

test("can found a measured polity from the donor's actual territory, without inventing budgets or indices", () => {
  const result = planLegalTerritorialStatsTransfers(initial(), [transfer("A1", "Free Republic")], regions);
  assert.equal(pop(result, "Free Republic"), 500);
  assert.equal(gdp(result, "Free Republic"), 50000);
  assert.equal(result.countryStats["Free Republic"].economy.publicDebt, undefined);
  assert.equal(result.countryStats["Free Republic"].continuity, undefined);
});

test("a completely ceded mapped polity keeps explicit zero residents, not phantom GDP", () => {
  const world = initial();
  const result = planLegalTerritorialStatsTransfers(world, [transfer("A1"), transfer("A2")], regions);
  assert.deepEqual(result.countryStats.Alpha.territorialComponents, []);
  assert.equal(result.countryStats.Alpha.population.total, 0);
  assert.equal(result.countryStats.Alpha.economy?.gdp, undefined);
  assert.equal(pop(result, "Beta"), 1000);
});

test("fully replayed title already at recipient is a no-op", () => {
  const world = initial();
  world.regionOwnershipOverrides.A1 = "Beta";
  const result = planLegalTerritorialStatsTransfers(world, [transfer()], regions);
  assert.equal(result, null);
});

test("refuses an unknown region rather than trusting an author-provided name", () => {
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [transfer("A404")], regions), /Unknown legal transfer region ID/);
});

test("refuses ambiguous geography names even when region IDs differ", () => {
  const world = initial();
  world.countryStats.Beta = sheet([...world.countryStats.Beta.territorialComponents, component("Riverland", 1, 99)]);
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions), /no unique sovereign Statistics component/);
});

test("refuses a region/catalog name conflict and preserves the whole proposed transaction", () => {
  const world = initial();
  const bad = regions.map((r) => r.id === "A2" ? { ...r, name: "Missing Component" } : r);
  const prior = JSON.stringify(world);
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer("A1"), transfer("A2")], bad), /no unique sovereign Statistics component/);
  assert.equal(JSON.stringify(world), prior);
});

test("rejects duplicate IDs and incomplete map catalogs", () => {
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [transfer(), transfer()], regions), /Duplicate/);
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [transfer()], [regions[0], regions[0]]), /Ambiguous canonical map region ID/);
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [transfer()], null), /requires the canonical region catalog/);
});

test("cannot turn an unmapped/legacy recipient's unallocated GDP into a regional ledger", () => {
  const world = initial();
  world.countryStats.Beta = { population: { total: 200 }, economy: { gdp: 30000 } };
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions), /no mapped Statistics ledger/);
});

test("a mapped recipient cannot absorb an unmeasured donor's unknown population", () => {
  const world = initial();
  delete world.countryStats.Alpha;
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions), /no donor Statistics sheet/);
});

test("only a title change triggers a Stats transfer; unmatched legacy countries remain unaltered", () => {
  const world = { countryStats: { Gamma: sheet([component("Newland", 100, 100)]) } };
  const result = planLegalTerritorialStatsTransfers(world, [transfer()], regions);
  assert.equal(result, null);
});


test("a duplicated map geography cannot be guessed from the component name", () => {
  const duplicates = [...regions, { id: "X1", name: "Riverland", country: "Alpha" }];
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [transfer()], duplicates), /no unique sovereign Statistics component/);
});

test("refuses a transfer falsely attributed to a party neither sovereign nor controller", () => {
  assert.throws(() => planLegalTerritorialStatsTransfers(initial(), [{ ...transfer(), fromCode: "Outsider" }], regions), /unrelated source/);
});

test("legacy country sheets require no map catalog and retain map-only transfer compatibility", () => {
  const world = { countryStats: { Alpha: { economy: { gdp: 1000 } }, Beta: { population: { total: 200 } } } };
  assert.equal(planLegalTerritorialStatsTransfers(world, [transfer()], null), null);
});

test("an active finite demographic plan rebases future births without rewriting receipts", () => {
  const world = initial();
  world.countryStats.Alpha.continuity = { demographicClock: {
    sourceDate: "1913-01-01", endDate: "1914-01-01", lastDate: "1913-01-01",
    basePopulation: 800, birthsPerThousand: 25, deathsPerThousand: 15,
    creditedBirths: 0, creditedDeaths: 0,
  } };
  const original = JSON.stringify(world);
  const result = planLegalTerritorialStatsTransfers(world, [transfer()], regions, { effectiveDate: "1913-01-02" });
  const clock = result.countryStats.Alpha.continuity.demographicClock;
  assert.equal(clock.basePopulation, 800, "the historic scenario baseline is not rewritten");
  assert.equal(clock.creditedBirths, 0);
  assert.equal(clock.creditedDeaths, 0);
  assert.deepEqual(clock.rebases, [{ effectiveDate: "1913-01-02", basePopulation: 300,
    creditedBirthsAtStart: 0, creditedDeathsAtStart: 0 }]);
  assert.equal(JSON.stringify(world), original);
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions,
    { effectiveDate: "1913-06-01" }), /unsettled demographic cursor/);
  assert.equal(pop(planLegalTerritorialStatsTransfers(world, [transfer()], regions,
    { effectiveDate: "1914-06-01" }), "Beta"), 700,
  "an expired finite plan cannot obstruct later lawful territory changes");
});

test("a same-day multi-region cession rebases once with the final resident count", () => {
  const world = initial();
  world.countryStats.Alpha.continuity = { demographicClock: {
    sourceDate: "1913-01-01", endDate: "1914-01-01", lastDate: "1913-01-01",
    basePopulation: 800, birthsPerThousand: 25, deathsPerThousand: 15,
    creditedBirths: 0, creditedDeaths: 0,
  } };
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer("A1"), transfer("A2")], regions,
    { effectiveDate: "1913-01-02" }), /demographic termination for landless polity/);
});

test("births/deaths after a mid-campaign legal cession follow the rebased country, including split skips", async () => {
  const { advanceNativeDemographicClock } = await import("./statsDemographicClock.js");
  const world = initial();
  world.polityOverrides = { Alpha: { status: "active" }, Beta: { status: "active" } };
  world.countryStats.Alpha.continuity = { demographicClock: {
    sourceDate: "1913-01-01", endDate: "1914-01-01", lastDate: "1913-01-01",
    basePopulation: 800, birthsPerThousand: 25, deathsPerThousand: 15,
    creditedBirths: 0, creditedDeaths: 0,
  } };
  const mid = advanceNativeDemographicClock(world, { fromDate: "1913-01-01", toDate: "1913-06-01" });
  const planned = planLegalTerritorialStatsTransfers(mid, [transfer()], regions,
    { effectiveDate: "1913-06-02" });
  const afterCession = { ...mid, countryStats: planned.countryStats };
  const beforeCredit = afterCession.countryStats.Alpha.continuity.demographicClock.creditedBirths;
  assert.ok(beforeCredit > 0, "the original segment was already credited");
  const once = advanceNativeDemographicClock(afterCession, { fromDate: "1913-06-01", toDate: "1913-07-01" });
  const half = advanceNativeDemographicClock(afterCession, { fromDate: "1913-06-01", toDate: "1913-06-16" });
  const twice = advanceNativeDemographicClock(half, { fromDate: "1913-06-16", toDate: "1913-07-01" });
  assert.equal(once.countryStats.Alpha.population.total, twice.countryStats.Alpha.population.total);
  assert.deepEqual(once.countryStats.Alpha.continuity.demographicClock, twice.countryStats.Alpha.continuity.demographicClock);
  assert.ok(once.countryStats.Alpha.continuity.demographicClock.creditedBirths >= beforeCredit);
  assert.equal(afterCession.countryStats.Alpha.continuity.demographicClock.creditedBirths, beforeCredit,
    "no later tick changes the event's accepted input snapshot");
});

test("a full annexation may terminate a finite clock when the same event dissolves its polity", () => {
  const world = initial();
  world.countryStats.Alpha.continuity = { demographicClock: {
    sourceDate: "1913-01-01", endDate: "1914-01-01", lastDate: "1913-01-01",
    basePopulation: 800, birthsPerThousand: 25, deathsPerThousand: 15,
    creditedBirths: 0, creditedDeaths: 0,
  } };
  const result = planLegalTerritorialStatsTransfers(world, [transfer("A1"), transfer("A2")], regions,
    { effectiveDate: "1913-01-02", dissolvingPolities: ["Alpha"] });
  assert.equal(result.countryStats.Alpha.population.total, 0);
  assert.equal(result.countryStats.Beta.population.total, 1000);
});

test("legal cession cannot overdraw unrelated military personnel commitments", () => {
  const world = initial();
  world.frontPersonnel = { Alpha: { unavailable: 350, unresolved: 0 } };
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions), /overdraw committed military personnel/);
  assert.equal(world.countryStats.Alpha.territorialComponents.length, 2);
});

test("legal cession before an authored migration plan starts must not make its population anchors false", () => {
  const world = initial();
  world.migrationFlows = [{ id: "planned", fromPolity: "Alpha", toPolity: "Beta",
    sourceDate: "1913-06-01", lastDate: "1913-06-01" }];
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions,
    { effectiveDate: "1913-05-31" }), /migration-plan reanchor/);
});

test("a pending evolving-demography plan cannot silently lose its starting population anchor", () => {
  const world = initial();
  world.countryStats.Alpha.continuity = { demographicEvolution: {
    version: 1, sourceDate: "1913-01-01", endDate: "1914-01-01", lastDate: "1913-01-01",
    basePopulation: 800, birthRate: 20, deathRate: 10,
    birthTrendPerYear: 0, deathTrendPerYear: 0,
    creditedBirths: 0, creditedDeaths: 0, birthFraction: 0, deathFraction: 0,
    influences: [],
  } };
  assert.throws(() => planLegalTerritorialStatsTransfers(world, [transfer()], regions,
    { effectiveDate: "1913-01-02" }), /unstarted demographic-evolution reanchor/);
});
