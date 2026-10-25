/*! Open Historia - staged native Statistics clocks on the modern Wars and Fronts schema.
 * These tests intentionally invoke the pure clocks explicitly; automatic turn wiring
 * is deferred until the naval engine publishes dated blockade consequences. */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCountryStatPatch, normalizeCountryStatSheet } from "./countryStats.js";
import { advanceNativeMacroEconomyClock } from "./statsNativeEconomyClock.js";
import { advanceNativeDemographicClock } from "./statsDemographicClock.js";
import { advanceNativeProductionClock } from "./statsProductionClock.js";
import { advanceNativeFiscalClock } from "./statsFiscalClock.js";
import { captureNativeEconomicExposureHistory, deriveNativeEconomicExposure } from "./statsEconomicExposure.js";
import { captureCountryStatsHistory } from "./countryStats.js";

const start = "1912-01-01";
const end = "1912-12-31";
const catalog = [
  { id: "a", name: "Aland City", owner: "Aland" },
  { id: "b", name: "Borland City", owner: "Borland" },
];
const assessed = (country, name, people, gdpPerCapita) => mergeCountryStatPatch(null, {
  territorialComponents: [{ geography: name, group: "core", population: people, gdpPerCapita }],
  economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
  // The newer Fronts update keeps scenario-authored military figures in the Stats sheet.
  military: { quality: 64, technology: 70, land: 60, sea: 40, air: 30, spending: 80 },
  continuity: { assessedDate: start },
});
const baseline = () => ({
  ownerCodes: ["Aland", "Borland"],
  regionOwnershipOverrides: { a: "Aland", b: "Borland" },
  regionSovereigntyOverrides: { a: "Aland", b: "Borland" },
  countryStats: {
    Aland: assessed("Aland", "Aland City", 1_000_000, 1000),
    Borland: assessed("Borland", "Borland City", 800_000, 1400),
  },
});
const tick = (world, fromDate, toDate) => {
  const baselineWorld = world;
  let next = advanceNativeDemographicClock(world, { baselineWorld, fromDate, toDate });
  next = advanceNativeMacroEconomyClock(next, { fromDate, toDate, regionCatalog: catalog });
  next = advanceNativeProductionClock(next, { fromDate, toDate });
  next = advanceNativeFiscalClock(next, { baselineWorld, fromDate, toDate });
  return next;
};

test("native clock is opt-in and does not create an unreviewed economic baseline", () => {
  const empty = { ownerCodes: ["Aland"], countryStats: { Aland: { military: { spending: 90 } } } };
  const after = tick(empty, start, end);
  assert.deepEqual(after, empty);
});

test("a reviewed economy progresses without AI and retains modern military ratings", () => {
  const world = baseline();
  const before = world.countryStats.Aland.economy.gdp;
  const after = tick(world, start, end);
  assert.ok(after.countryStats.Aland.economy.gdp > before);
  assert.equal(after.countryStats.Aland.continuity.nativeEconomyClock.lastDate, end);
  assert.equal(after.countryStats.Aland.military.spending, 80);
  assert.equal(after.countryStats.Aland.military.technology, 70);
  assert.equal(after.countryStats.Aland.economy.publicDebt > 0, true);
  assert.deepEqual(world.countryStats.Aland.military, after.countryStats.Aland.military);
});

test("clock results survive JSON normalization and do not double-credit a replay", () => {
  const after = tick(baseline(), start, end);
  const stored = JSON.parse(JSON.stringify(after));
  const reread = normalizeCountryStatSheet(stored.countryStats.Aland);
  assert.deepEqual(reread.continuity.nativeEconomyClock, after.countryStats.Aland.continuity.nativeEconomyClock);
  const replayed = tick(after, start, end);
  assert.deepEqual(replayed, after);
});

test("monthly and year-long progression converge without a second war economy ledger", () => {
  const all = tick(baseline(), start, end);
  const stops = ["1912-01-31", "1912-02-29", "1912-03-31", "1912-04-30", "1912-05-31", "1912-06-30", "1912-07-31", "1912-08-31", "1912-09-30", "1912-10-31", "1912-11-30", end];
  let monthly = baseline(), from = start;
  for (const date of stops) { monthly = tick(monthly, from, date); from = date; }
  const a = all.countryStats.Aland, b = monthly.countryStats.Aland;
  assert.ok(Math.abs(a.economy.gdp - b.economy.gdp) < 1000, `${a.economy.gdp} vs ${b.economy.gdp}`);
  assert.equal(a.continuity.nativeEconomyClock.lastDate, b.continuity.nativeEconomyClock.lastDate);
});

test("occupation exposure is an observation, not a transfer of legal GDP", () => {
  const source = baseline();
  const before = source.countryStats.Aland.economy.gdp;
  const occupied = { ...source, regionOwnershipOverrides: { ...source.regionOwnershipOverrides, a: "Borland" } };
  const exposure = deriveNativeEconomicExposure(occupied, "Aland", { regionCatalog: catalog });
  assert.equal(exposure.territorialCoverage, "complete");
  assert.equal(exposure.sovereignGdpUnderForeignControl, before);
  let observed = captureCountryStatsHistory(occupied, { date: "1912-02-28" });
  observed = captureNativeEconomicExposureHistory(observed, { date: "1912-02-28", regionCatalog: catalog });
  assert.equal(observed.countryStatsHistory.Aland.at(-1).sovereignGdpUnderForeignControl, before);
  assert.equal(observed.countryStats.Aland.economy.gdp, before);
  // Recovery is recorded explicitly as zero rather than silently removing old evidence.
  const released = { ...observed, regionOwnershipOverrides: { ...observed.regionOwnershipOverrides, a: "Aland" } };
  const next = captureNativeEconomicExposureHistory(captureCountryStatsHistory(released, { date: "1912-03-31" }), { date: "1912-03-31", regionCatalog: catalog });
  assert.equal(next.countryStatsHistory.Aland.at(-1).sovereignGdpUnderForeignControl, 0);
});


test("final generic Statistics save cannot be the last writer of wartime occupation history", () => {
  const occupied = { ...baseline(), regionOwnershipOverrides: { a: "Borland", b: "Borland" } };
  let observed = captureCountryStatsHistory(occupied, { date: "1912-02-29", round: 2 });
  observed = captureNativeEconomicExposureHistory(observed, { date: "1912-02-29", round: 2, regionCatalog: catalog });
  const released = { ...observed, regionOwnershipOverrides: { a: "Aland", b: "Borland" } };
  // The native reducer samples March after liberation, then gameplay takes a
  // final generic same-date reading. The final regional pass must restore the
  // known ZERO rather than forget the history field.
  let marched = captureCountryStatsHistory(released, { date: "1912-03-31", round: 2 });
  marched = captureNativeEconomicExposureHistory(marched, { date: "1912-03-31", round: 2, regionCatalog: catalog });
  assert.equal(marched.countryStatsHistory.Aland.at(-1).sovereignGdpUnderForeignControl, 0);
  const genericAgain = captureCountryStatsHistory(marched, { date: "1912-03-31", round: 2 });
  assert.equal(genericAgain.countryStatsHistory.Aland.at(-1).sovereignGdpUnderForeignControl, undefined,
    "reproduces the actual overwriting danger when the generic writer runs last");
  const final = captureNativeEconomicExposureHistory(genericAgain, { date: "1912-03-31", round: 2, regionCatalog: catalog });
  assert.equal(final.countryStatsHistory.Aland.at(-1).sovereignGdpUnderForeignControl, 0);
  assert.deepEqual(final.countryStats, released.countryStats, "history reconciliation never edits economic ledgers");
});

test("a malformed labor anchor cannot silently reset an already credited macro clock", () => {
  const advanced = tick(baseline(), start, "1912-06-30");
  const invalid = structuredClone(advanced);
  invalid.countryStats.Aland.continuity.nativeEconomyClock.sourceUnemployment = 101;
  const result = advanceNativeMacroEconomyClock(invalid, {
    fromDate: "1912-06-30", toDate: end, regionCatalog: catalog,
  });
  assert.deepEqual(result.countryStats.Aland, invalid.countryStats.Aland);
  assert.ok(result.countryStats.Borland.economy.gdp > invalid.countryStats.Borland.economy.gdp,
    "one corrupt actor does not block independent valid economic accrual");
});

test("an older cursor without source labor data upgrades only when accrual legitimately continues", () => {
  const first = tick(baseline(), start, "1912-06-30");
  const older = structuredClone(first);
  delete older.countryStats.Aland.continuity.nativeEconomyClock.sourceUnemployment;
  const later = advanceNativeMacroEconomyClock(older, {
    fromDate: "1912-06-30", toDate: end, regionCatalog: catalog,
  });
  assert.equal(later.countryStats.Aland.continuity.nativeEconomyClock.sourceUnemployment,
    first.countryStats.Aland.continuity.nativeEconomyClock.unemployment);
  assert.ok(later.countryStats.Aland.economy.gdp > first.countryStats.Aland.economy.gdp);
});
