import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { provenZeroBlockadeDays, planNativeStatsLiveTurn } from "./statsLiveTurnClock.js";
import { mergeCountryStatPatch } from "./countryStats.js";

const fixture = () => ({
  ownerCodes: ["Aland"],
  countryStats: { Aland: mergeCountryStatPatch(null, {
    territorialComponents: [{ geography: "Aland City", group: "core", population: 1000000, gdpPerCapita: 1000 }],
    economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
    continuity: { assessedDate: "1912-01-01" },
  }) },
});
const plan = (extra = {}) => planNativeStatsLiveTurn({
  baseWorld: fixture(), fromDate: "1912-01-01", toDate: "1912-12-31", round: 3,
  events: [], ...extra,
});

test("peace without war or blockades is provable zero, without assuming a sea run", () => {
  assert.deepEqual(provenZeroBlockadeDays({ baseWorld: fixture(), turnFronts: null }), []);
  assert.deepEqual(provenZeroBlockadeDays({ baseWorld: { ...fixture(), wars: [{ status: "ended" }] }, turnFronts: null }), []);
  assert.deepEqual(provenZeroBlockadeDays({ baseWorld: fixture(), fromDate: "1912-01-01", toDate: "1912-12-31", turnFronts: { sea: { blockadeDays: [], blockadePeriods: [], blockades: [], fromDate: "1912-01-01", days: 365 } } }), []);
});

test("unknown sea, any active blockade, war transitions or control flips refuses native cutover", () => {
  const w = fixture();
  for (const opts of [
    { baseWorld: { ...w, wars: [{ status: "active" }] } },
    // A complete zero-pressure SEA result does not make an active land war peaceful.
    { baseWorld: { ...w, wars: [{ status: "active" }] }, fromDate: "1912-01-01", toDate: "1912-12-31", turnFronts: { sea: { blockadeDays: [], blockadePeriods: [], blockades: [], fromDate: "1912-01-01", days: 365 } } },
    { baseWorld: { ...w, battlefields: [{ status: "active" }] }, fromDate: "1912-01-01", toDate: "1912-12-31", turnFronts: { sea: { blockadeDays: [], blockadePeriods: [], blockades: [], fromDate: "1912-01-01", days: 365 } } },
    { baseWorld: { ...w, blockades: [{ country: "Aland" }] } },
    { baseWorld: { ...w, blockades: {} } },
    { baseWorld: { ...w, wars: {} } },
    { baseWorld: { ...w, battlefields: [{ status: "active" }] } },
    { baseWorld: w, turnFronts: { sea: { blockadeDays: null } } },
    { baseWorld: w, turnFronts: { sea: { blockadeDays: [], blockadePeriods: null, blockades: [] } } },
    { baseWorld: w, turnFronts: { sea: { blockadeDays: [], blockadePeriods: [], blockades: [], fromDate: "1912-01-01", days: 30 } } },
    { baseWorld: w, turnFronts: { sea: { blockadeDays: [{ date: "1912-01-02" }] } } },
    { baseWorld: w, turnFronts: { sea: { blockadeDays: [], blockades: [{ country: "Aland", pressure: .5 }] } } },
    { baseWorld: w, turnFronts: { starts: [{ id: "new" }] } },
    { baseWorld: w, turnFronts: { joins: [{ name: "Aland" }] } },
    { baseWorld: w, turnFronts: { flips: [{ regionId: "r" }] } },
    { baseWorld: w, warUpdates: [{ id: "war" }] },
  ]) assert.equal(provenZeroBlockadeDays(opts), null);
});

test("annual zero-blockade turn genuinely advances native GDP and emits all months", () => {
  const initial = fixture();
  const boundary = plan({ baseWorld: initial });
  assert.ok(boundary);
  const result = boundary.afterEvents(initial, 0);
  assert.ok(result.countryStats.Aland.economy.gdp > initial.countryStats.Aland.economy.gdp);
  assert.equal(result.countryStats.Aland.continuity.nativeEconomyClock.lastDate, "1912-12-31");
  const months = result.countryStatsHistory.Aland.map((entry) => entry.date);
  assert.deepEqual(months, ["1912-01-31", "1912-02-29", "1912-03-31", "1912-04-30", "1912-05-31", "1912-06-30", "1912-07-31", "1912-08-31", "1912-09-30", "1912-10-31", "1912-11-30", "1912-12-31"]);
  assert.equal(result.countryStats.Aland.military, initial.countryStats.Aland.military);
  assert.equal(initial.countryStatsHistory, undefined);
  assert.throws(() => boundary.afterEvents(result, 0), /repeated/);
});

test("a dated shock cannot alter earlier monthly samples; same-day sequence stays intact", () => {
  const initial = fixture();
  const events = [{ id: "first", date: "1912-07-10" }, { id: "second", date: "1912-07-10" }];
  const baseline = plan().afterEvents(fixture(), 0);
  const boundary = plan({ baseWorld: initial, events });
  let next = boundary.beforeEvent(initial, 0, events[0]);
  assert.deepEqual(next.countryStatsHistory.Aland.slice(0, 6), baseline.countryStatsHistory.Aland.slice(0, 6));
  const originalGdp = next.countryStats.Aland.economy.gdp;
  next = { ...next, countryStats: { ...next.countryStats, Aland: mergeCountryStatPatch(next.countryStats.Aland,
    { economy: { gdp: originalGdp * .9 } }, { maxAggregateRescale: 10 }) } };
  next = boundary.beforeEvent(next, 1, events[1]);
  next = boundary.afterEvents(next, events.length);
  assert.ok(next.countryStats.Aland.economy.gdp < baseline.countryStats.Aland.economy.gdp);
  assert.deepEqual(next.countryStatsHistory.Aland.slice(0, 6), baseline.countryStatsHistory.Aland.slice(0, 6));
});

test("one annual cutover equals twelve month-partitioned cutovers with the same dated facts", () => {
  const annual = plan().afterEvents(fixture(), 0);
  const monthlyDates = annual.countryStatsHistory.Aland.map((sample) => sample.date);
  let start = "1912-01-01";
  let monthly = fixture();
  for (const end of monthlyDates) {
    const boundary = plan({ baseWorld: monthly, fromDate: start, toDate: end });
    assert.ok(boundary);
    monthly = boundary.afterEvents(monthly, 0);
    start = end;
  }
  assert.equal(monthly.countryStats.Aland.economy.gdp, annual.countryStats.Aland.economy.gdp);
  assert.equal(monthly.countryStats.Aland.economy.publicDebt, annual.countryStats.Aland.economy.publicDebt);
  assert.deepEqual(monthly.countryStatsHistory.Aland, annual.countryStatsHistory.Aland);
});

test("invalid event chronology and missing baselines retain the legacy path", () => {
  assert.equal(plan({ baseWorld: { countryStats: {} } }), null);
  assert.equal(plan({ events: [{ id: "missing", date: "1913-01-01" }] }), null);
  assert.equal(plan({ baseWorld: { ...fixture(), blockades: [{ country: "Aland" }] } }), null);
  assert.equal(plan({ fromDate: "1912-12-31", toDate: "1912-01-01" }), null);
});

test("gameplay cutover is opt-in and does not call the legacy blockade or AI Statistics writer twice", () => {
  const body = readFileSync(new URL("../Game/AI/gameplay.js", import.meta.url), "utf8");
  assert.match(body, /statsChronology: nativeStatsChronology/);
  assert.match(body, /if \(!nativeStatsChronology\) impactedWorld = withBlockadeEconomy/);
  assert.match(body, /if \(!nativeStatsChronology\) nextWorld = await refreshTrackedCountryStatsIfDue/);
  assert.match(body, /if \(!nativeStatsChronology\) requestConflictSheets/);
});
