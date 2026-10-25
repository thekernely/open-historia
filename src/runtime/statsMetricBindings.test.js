import test from "node:test";
import assert from "node:assert/strict";
import {
  NATIONAL_NATIVE_METRICS,
  normalizeStatSheetDefinition,
  normalizeCustomStatValues,
  serializeStatSheet,
} from "./statIndexDefinitions.js";
import { assertNoLegacyNativeStatCopies, nationalStatsAuthoringContract, nationalStatsPresentationCoverage, resolveNationalStatReading } from "./statsMetricBindings.js";

const fixture = (rows) => ({ custom: true, version: 2, sections: [{ key: "national", label: "National", stats: rows }] });
const row = (key, kind, nativeMetric) => ({ key, label: key, kind, ...(nativeMetric ? { nativeMetric } : {}) });
const nativeSheet = { economy: { gdp: 297500000000, publicDebt: 43, inflation: -1.2, gdpPerCapita: 29750 }, population: { total: 10000000 }, stability: 0 };

test("native bindings survive normalized scenario sheet and serialized export/import without changing legacy rows", () => {
  const source = fixture([row("leadingGDP", "currency", "gdp"), row("gdp", "currency"), row("stabilityCard", "index", "nationalStability")]);
  const normalized = normalizeStatSheetDefinition(source);
  const serialized = serializeStatSheet(normalized);
  const loaded = normalizeStatSheetDefinition(serialized);
  assert.equal(serialized.version, 2);
  assert.deepEqual(loaded.sections[0].stats.map((stat) => stat.nativeMetric), ["gdp", undefined, "nationalStability"]);
  assert.equal(loaded.sections[0].stats[1].key, "gdp");
  assert.equal(loaded.sections[0].stats[1].nativeMetric, undefined);
});

test("explicit binding types and allowlist fail closed rather than turning bad native readers into custom values", () => {
  assert.deepEqual(Object.keys(NATIONAL_NATIVE_METRICS).sort(), ["budgetBalance", "gdp", "gdpGrowth", "gdpPerCapita", "inflation", "nationalStability", "publicDebt", "totalPopulation", "unemployment", "sovereignty", "foodAutonomy", "energyAutonomy", "economicIndependence", "internalSecurity", "internationalReputation"].sort());
  for (const unsafe of ["economy.gdp", "__proto__", "GDP", 1, {}, "personHealth"]) {
    assert.throws(() => normalizeStatSheetDefinition(fixture([row("v", "currency", unsafe)])), /Unsupported national Statistics native metric binding/);
  }
  assert.throws(() => normalizeStatSheetDefinition(fixture([row("v", "index", "gdp")])), /requires the currency display type/);
});

test("native binding defaults use native economic ranges, not an inappropriate generic 0–100 percent clamp", () => {
  const [inflation, debt, balance] = normalizeStatSheetDefinition(fixture([
    row("inflationCard", "percentage", "inflation"),
    row("debtCard", "percentage", "publicDebt"),
    row("budgetCard", "percentage", "budgetBalance"),
  ])).sections[0].stats;
  assert.deepEqual([inflation.minimum, inflation.maximum], [-1000, 1000]);
  assert.deepEqual([debt.minimum, debt.maximum], [0, 1000]);
  assert.deepEqual([balance.minimum, balance.maximum], [-1000, 1000]);
});

test("native reader uses exactly the canonical national path, preserving zero and negative values", () => {
  assert.deepEqual(resolveNationalStatReading(row("gdpHero", "currency", "gdp"), nativeSheet), { source: "native", status: "ready", value: 297500000000 });
  assert.deepEqual(resolveNationalStatReading(row("zeroStability", "index", "nationalStability"), nativeSheet), { source: "native", status: "ready", value: 0 });
  assert.deepEqual(resolveNationalStatReading(row("priceTrend", "percentage", "inflation"), nativeSheet), { source: "native", status: "ready", value: -1.2 });
});

test("one metric can be presented by multiple cards, bound to one source", () => {
  const definition = fixture([row("gdpHero", "currency", "gdp"), row("gdpMini", "currency", "gdp")]);
  const coverage = nationalStatsPresentationCoverage(definition, nativeSheet);
  assert.equal(coverage.ready, true);
  assert.deepEqual(coverage.rows.map((r) => r.value), [297500000000, 297500000000]);
});

test("Czech-style conflicts refuse resolution regardless of number equality; neither value is changed", () => {
  const source = { ...nativeSheet, customStats: { gdp: 300000000000 } };
  const before = structuredClone(source);
  const binding = row("gdp", "currency", "gdp");
  assert.deepEqual(resolveNationalStatReading(binding, source), { source: "native", status: "review-required", value: null });
  source.customStats.gdp = source.economy.gdp;
  assert.equal(resolveNationalStatReading(binding, source).status, "review-required");
  assert.equal(before.economy.gdp, 297500000000);
  assert.equal(before.customStats.gdp, 300000000000);
});

test("legacy independent custom metrics keep their own values; blank is not zero", () => {
  const legacy = row("gdp", "currency");
  assert.deepEqual(resolveNationalStatReading(legacy, { ...nativeSheet, customStats: { gdp: 300000000000 } }), { source: "custom", status: "ready", value: 300000000000 });
  assert.equal(resolveNationalStatReading(legacy, nativeSheet).status, "unavailable");
  assert.equal(resolveNationalStatReading(row("gdpHero", "currency", "gdp"), { economy: { gdp: null } }).status, "unavailable");
  assert.equal(resolveNationalStatReading(row("gdpHero", "currency", "gdp"), { economy: { gdp: "42" } }).status, "unavailable");
});

test("display readiness distinguishes unresolved conflicts and absent native readings from an active native economy", () => {
  const definition = fixture([row("gdp", "currency", "gdp"), row("food", "number")]);
  assert.equal(nationalStatsPresentationCoverage(definition, { ...nativeSheet, customStats: { gdp: 300000000000, food: 24 } }).ready, false);
  assert.equal(nationalStatsPresentationCoverage(definition, { ...nativeSheet, customStats: { food: 24 } }).ready, true);
  assert.equal(nationalStatsPresentationCoverage(definition, { customStats: { food: 24 } }).ready, false);
  assert.equal(nationalStatsPresentationCoverage(fixture([row("timber", "number")]), { customStats: { timber: 0 } }).ready, true);
  assert.equal(nationalStatsPresentationCoverage(null, nativeSheet).ready, false);
});

test("native-bound display keys are never normalized into new writable customStats, while legacy data remains untouched", () => {
  const definition = fixture([row("gdp", "currency", "gdp"), row("timber", "number")]);
  const prior = { gdp: 300, timber: 60 };
  assert.deepEqual(normalizeCustomStatValues(prior, definition), { timber: 60 });
  assert.deepEqual(prior, { gdp: 300, timber: 60 });
  assert.throws(() => assertNoLegacyNativeStatCopies(definition, { customStats: prior }), /review its migration/);
  assert.deepEqual(normalizeCustomStatValues(prior, fixture([row("gdp", "currency"), row("timber", "number")])), prior);
});

test("authoring contract excludes read-only native cards but keeps every independently writable custom key", () => {
  const definition = fixture([
    row("headlineGDP", "currency", "gdp"),
    row("compactGDP", "currency", "gdp"),
    row("grain", "number"),
    row("debt", "percentage", "publicDebt"),
  ]);
  assert.deepEqual(nationalStatsAuthoringContract(definition), {
    custom: true,
    customKeys: ["grain"],
    boundRows: [
      { key: "headlineGDP", nativeMetric: "gdp" },
      { key: "compactGDP", nativeMetric: "gdp" },
      { key: "debt", nativeMetric: "publicDebt" },
    ],
  });
  assert.deepEqual(nationalStatsAuthoringContract(null), { custom: false, customKeys: [], boundRows: [] });
});

test("authoring native-copy guard refuses legacy copies without editing their values or assuming equality resolves identity", () => {
  const definition = fixture([row("gdp", "currency", "gdp"), row("grain", "number")]);
  const original = { economy: { gdp: 300 }, customStats: { gdp: 300, grain: 7 } };
  const frozen = structuredClone(original);
  assert.throws(() => assertNoLegacyNativeStatCopies(definition, original), /review its migration/);
  assert.deepEqual(original, frozen);
  assert.doesNotThrow(() => assertNoLegacyNativeStatCopies(definition, { customStats: { grain: 7 } }));
  assert.doesNotThrow(() => assertNoLegacyNativeStatCopies(fixture([row("gdp", "currency")]), original));
});


test("renaming a GDP widget does not conceal an old independently stored custom GDP", () => {
  const def = fixture([row("headlineGDP", "currency", "gdp")]);
  const mixed = { ...nativeSheet, customStats: { gdp: 300000000000 } };
  assert.equal(resolveNationalStatReading(def.sections[0].stats[0], mixed).status, "review-required");
  assert.throws(() => assertNoLegacyNativeStatCopies(def, mixed), /Custom statistic gdp/);
});

test("native strategic indices are read-only canonical national bindings, never duplicate customStats", () => {
  const sample = {indices: {foodAutonomy: 70, economicIndependence: 80}};
  assert.deepEqual(resolveNationalStatReading(row("foodValue", "index", "foodAutonomy"), sample),
    {source: "native", status: "ready", value: 70});
  assert.deepEqual(resolveNationalStatReading(row("independence", "index", "economicIndependence"), sample),
    {source: "native", status: "ready", value: 80});
  assert.equal(resolveNationalStatReading(row("energy", "index", "energyAutonomy"), sample).status, "unavailable");
});
