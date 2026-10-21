/*! OpenHistoria - cross-version Statistics V2 persisted economic cursors. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCountryStatPatch, normalizeCountryStatSheet,
  normalizeCountryStatNativeEconomyClock, normalizeCountryStatDemographicEvolution,
  normalizeCountryStatFiscalClock, normalizeCountryStatGdpRamps,
} from "./countryStats.js";

const sourceDate = "1912-01-01";
const nextDate = "1912-02-01";
const macro = Object.freeze({
  version: 1, sourceDate, lastDate: nextDate,
  lastPopulation: 1_000_000, lastGdp: 1_008_000_000,
  lastTerritoryKey: "1:1234abcd:5678ef90", sourceRealGrowth: 3,
  sourceInflation: 2, productivity: 2.9, demandGap: -0.02,
  inflation: 2.01, unemployment: 5.9, lastProjectOutput: 0,
  reportedGrowth: 2.88,
});
const demographic = Object.freeze({
  version: 1, sourceDate, endDate: "1922-01-01", lastDate: sourceDate,
  basePopulation: 1_000_000, birthRate: 28, deathRate: 18,
  birthTrendPerYear: 0, deathTrendPerYear: 0, creditedBirths: 0,
  creditedDeaths: 0, birthFraction: 0, deathFraction: 0, influences: [],
});
const base = () => mergeCountryStatPatch(null, {
  territorialComponents: [{ geography: "Berlin", group: "core", population: 1_000_000, gdpPerCapita: 1008 }],
  economy: { gdpGrowth: 2.88, inflation: 2.01, unemployment: 5.9, publicDebt: 42 },
  military: { quality: 70, technology: 63, land: 75, sea: 48, air: 62, spending: 80 },
  continuity: {
    assessedDate: sourceDate, nativeEconomyClock: macro,
    demographicEvolution: demographic,
    fiscalClock: { sourceDate, anchorDate: sourceDate, lastDate: nextDate, balance: -1.5, credited: 0.1273 },
    gdpRamps: [{ eventId: "e-commission", projectId: "p-steel", startDate: sourceDate,
      endDate: "1913-01-01", lastDate: sourceDate, gdpDelta: 1_000_000, credited: 0 }],
    compatibilityEstimate: { version: 1, source: "scenario-territorial-ledger", scope: "territory-only",
      sourceDate, initializedDate: "1912-01-02" },
  },
});

test("existing V2 dated clock and demographic cursors survive normalization and JSON save/reload", () => {
  const before = base();
  assert.deepEqual(before.continuity.nativeEconomyClock, macro);
  assert.deepEqual(before.continuity.demographicEvolution, demographic);
  assert.deepEqual(before.continuity.fiscalClock, { sourceDate, anchorDate: sourceDate,
    lastDate: nextDate, balance: -1.5, credited: 0.1273 });
  assert.equal(before.continuity.gdpRamps[0].projectId, "p-steel");
  assert.equal(before.continuity.compatibilityEstimate.scope, "territory-only");
  const restored = normalizeCountryStatSheet(JSON.parse(JSON.stringify(before)));
  assert.deepEqual(restored.continuity, before.continuity);
});

test("an unrelated Stats patch preserves V2 cursors and modern military ratings", () => {
  const before = base();
  const updated = mergeCountryStatPatch(before, { stability: 72, economy: { budgetBalance: -2 } });
  assert.deepEqual(updated.continuity, before.continuity);
  assert.deepEqual(updated.military, before.military);
  assert.equal(updated.economy.budgetBalance, -2);
});

test("malformed or forward-dated clocks are not promoted into canonical economic authority", () => {
  assert.equal(normalizeCountryStatNativeEconomyClock({ ...macro, lastDate: "1911-12-31" }), null);
  assert.equal(normalizeCountryStatNativeEconomyClock({ ...macro, lastGdp: -100 }), null);
  assert.equal(normalizeCountryStatNativeEconomyClock({ ...macro, secret: true }), null);
  assert.equal(normalizeCountryStatDemographicEvolution({ ...demographic, birthRate: 500 }), null);
  assert.equal(normalizeCountryStatFiscalClock({ sourceDate, anchorDate: sourceDate,
    lastDate: "1920-01-01", balance: -1.5, credited: 0 }), null);
});

test("production ramps remain bounded, with distinct event IDs", () => {
  const valid = base().continuity.gdpRamps[0];
  assert.deepEqual(normalizeCountryStatGdpRamps([valid, valid]), [valid]);
  assert.deepEqual(normalizeCountryStatGdpRamps([{ ...valid, credited: 2_000_000 }]), []);
  assert.deepEqual(normalizeCountryStatGdpRamps([{ ...valid, endDate: sourceDate }]), []);
});

test("native macro never appears in a country that has no reviewed cursor", () => {
  const untouched = mergeCountryStatPatch(null, {
    territorialComponents: [{ geography: "London", group: "core", population: 10_000, gdpPerCapita: 1000 }],
    military: { spending: 60 },
  });
  assert.equal(untouched.continuity?.nativeEconomyClock, undefined);
  assert.equal(untouched.military.spending, 60);
});
