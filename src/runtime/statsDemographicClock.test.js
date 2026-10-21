/*! Scenario-authorized natural change must conserve components, GDP, and history. */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCountryStatPatch, normalizeCountryStatSheet, captureCountryStatsHistory } from "./countryStats.js";
import { advanceNativeDemographicClock } from "./statsDemographicClock.js";

const start = "2014-01-01";
const end = "2015-01-01";
const demography = (overrides = {}) => ({
  sourceDate: start, endDate: end, lastDate: start, basePopulation: 1_000_000,
  birthsPerThousand: 20, deathsPerThousand: 8, creditedBirths: 0, creditedDeaths: 0,
  ...overrides,
});
const state = (overrides = {}) => ({
  polityOverrides: { Alba: { code: "Alba", name: "Alba", status: "active" } },
  countryStats: { Alba: mergeCountryStatPatch(null, {
    territorialComponents: [
      { geography: "Alba core", group: "core", population: 700_000, gdpPerCapita: 10_000 },
      { geography: "Alba north", group: "integrated", population: 200_000, gdpPerCapita: 9_000 },
      { geography: "Alba overseas", group: "overseas/dependent", population: 100_000, gdpPerCapita: 5_000 },
    ],
    continuity: { demographicClock: demography() },
    economy: { publicDebt: 38, budgetBalance: -2 },
  }) },
  frontPersonnel: { Alba: { unavailable: 100, unresolved: 40 } },
  ...overrides,
});
const step = (world, fromDate = start, toDate = end) =>
  advanceNativeDemographicClock(world, { fromDate, toDate });

// Strict source rates: the clock never invents an annual trend from existing
// population, GDP, GDP growth, or text events.
test("no scenario-authored process, no demographic change, even over years", () => {
  const base = state();
  delete base.countryStats.Alba.continuity.demographicClock;
  assert.deepEqual(step(base), base);
});

test("quiet native year advances explicit births/deaths without creating GDP", () => {
  const before = state();
  const next = step(before);
  const current = next.countryStats.Alba;
  assert.equal(current.population.total, 1_011_992);
  assert.equal(current.continuity.demographicClock.creditedBirths, 19_987);
  assert.equal(current.continuity.demographicClock.creditedDeaths, 7_995);
  assert.equal(current.continuity.demographicClock.lastDate, end);
  assert.equal(current.territorialComponents.reduce((n, row) => n + row.population, 0), 1_011_992);
  assert.ok(Math.abs(current.economy.gdp - before.countryStats.Alba.economy.gdp) <= before.countryStats.Alba.economy.gdp * 0.000001);
  assert.equal(current.economy.publicDebt, 38);
  assert.equal(current.economy.budgetBalance, -2);
  assert.deepEqual(next.frontPersonnel, before.frontPersonnel, "natural demographics do not recruit or release service members");
  assert.equal(before.countryStats.Alba.population.total, 1_000_000, "the input is not mutated");
  const snapshot = captureCountryStatsHistory(next, { date: end, round: 5 });
  assert.equal(snapshot.countryStatsHistory.Alba.at(-1).population, 1_011_992);
});

test("two 6-month steps equal one 12-month step and replay cannot credit again", () => {
  const before = state();
  const once = step(before);
  const half = step(before, start, "2014-07-02");
  const twice = step({ ...half, countryStats: { Alba: normalizeCountryStatSheet(half.countryStats.Alba) } }, "2014-07-02", end);
  assert.equal(twice.countryStats.Alba.population.total, once.countryStats.Alba.population.total);
  assert.deepEqual(twice.countryStats.Alba.continuity.demographicClock, once.countryStats.Alba.continuity.demographicClock);
  assert.deepEqual(step(once), once);
  assert.deepEqual(step(once, end, "2016-01-01"), once);
});

test("an intervening demographic shock stays additional to the dated natural process", () => {
  const midway = step(state(), start, "2014-07-02");
  const beforeShock = midway.countryStats.Alba;
  const shock = mergeCountryStatPatch(beforeShock, {
    population: { total: beforeShock.population.total - 10_000 },
    economy: { gdp: beforeShock.economy.gdp },
  });
  const world = { ...midway, countryStats: { Alba: shock } };
  const after = step(world, "2014-07-02", end);
  assert.equal(after.countryStats.Alba.population.total, 1_001_992);
  assert.equal(after.countryStats.Alba.continuity.demographicClock.creditedBirths, 19_987);
  assert.equal(after.countryStats.Alba.continuity.demographicClock.creditedDeaths, 7_995);
});

test("multi-component distribution sums exactly and does not create population in empty rows", () => {
  const original = state();
  const input = original.countryStats.Alba;
  original.countryStats.Alba = mergeCountryStatPatch(input, { territorialComponents: [
    { geography: "Alba core", group: "core", population: 3, gdpPerCapita: 10_000 },
    { geography: "Alba north", group: "integrated", population: 7, gdpPerCapita: 9_000 },
    { geography: "Alba overseas", group: "overseas/dependent", population: 0, gdpPerCapita: 5_000 },
  ] }, { replaceComponents: true });
  original.countryStats.Alba.continuity.demographicClock = demography({ basePopulation: 10, birthsPerThousand: 80, deathsPerThousand: 0 });
  const after = step(original);
  assert.equal(after.countryStats.Alba.population.total, 11);
  assert.equal(after.countryStats.Alba.territorialComponents.reduce((s, row) => s + row.population, 0), 11);
  assert.equal(after.countryStats.Alba.territorialComponents.at(-1).population, 0);
});

test("missing, inactive, future, exhausted, inconsistent, and malformed clocks do nothing", () => {
  const original = state();
  const cases = [
    { continuity: { demographicClock: demography({ birthsPerThousand: "20" }) } },
    { continuity: { demographicClock: demography({ creditedBirths: 1 }) } },
    { continuity: { demographicClock: demography({ lastDate: "2014-07-02", creditedBirths: 0 }) } },
    { continuity: { demographicClock: demography({ deathsPerThousand: -4 }) } },
    { continuity: { demographicClock: demography({ endDate: "2025-01-01" }) } },
    { continuity: { demographicClock: demography({ sourceDate: "2014-01-02" }) } },
    { continuity: { demographicClock: demography({ basePopulation: 0 }) } },
  ];
  for (const patch of cases) {
    const caseWorld = state();
    caseWorld.countryStats.Alba.continuity = patch.continuity;
    assert.deepEqual(step(caseWorld), caseWorld, JSON.stringify(patch));
  }
  const noActor = state({ polityOverrides: {} });
  assert.deepEqual(step(noActor), noActor);
  assert.deepEqual(step(original, "bogus", end), original);
  assert.deepEqual(step(original, end, start), original);
});

test("an authored future-date process only accrues its explicitly bounded active interval", () => {
  const world = state();
  world.countryStats.Alba.continuity.demographicClock = demography({
    sourceDate: "2014-04-01", lastDate: "2014-04-01", endDate: "2015-04-01",
  });
  const before = step(world, "2014-01-01", "2014-03-01");
  assert.deepEqual(before, world);
  const after = step(world, "2014-03-01", "2014-05-01");
  assert.ok(after.countryStats.Alba.population.total > 1_000_000);
  assert.equal(after.countryStats.Alba.continuity.demographicClock.lastDate, "2014-05-01");
});

test("a mismatched scenario population anchor cannot silently authorize natural growth", () => {
  const world = state();
  const wrong = state();
  wrong.countryStats.Alba = mergeCountryStatPatch(wrong.countryStats.Alba, {
    population: { total: 900_000 }, economy: { gdp: 9_300_000_000 },
  });
  assert.deepEqual(advanceNativeDemographicClock(world, { baselineWorld: wrong, fromDate: start, toDate: end }), world);
  assert.ok(advanceNativeDemographicClock(world, { baselineWorld: world, fromDate: start, toDate: end }) !== world);
});

test("ancient signed calendar dates work without a year-zero assumption", () => {
  const world = state();
  world.countryStats.Alba.continuity.demographicClock = demography({
    sourceDate: "-0001-12-30", endDate: "0001-12-30", lastDate: "-0001-12-30",
  });
  const next = step(world, "-0001-12-30", "0001-12-30");
  assert.ok(next.countryStats.Alba.population.total > 1_000_000);
});

test("malformed or non-territorial sheets never cause automatic baseline creation", () => {
  const empty = { ...state(), countryStats: { Alba: { population: { total: 1000 } } } };
  assert.deepEqual(step(empty), empty);
  const noSheet = { ...state(), countryStats: {} };
  assert.deepEqual(step(noSheet), noSheet);
});
