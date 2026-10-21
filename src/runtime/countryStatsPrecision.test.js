/*! OpenHistoria - native territorial GDP precision regression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateTerritorialEconomy,
  mergeCountryStatPatch,
  normalizeCountryStatSheet,
} from './countryStats.js';

// A map-rich historical economy; numeric/geographic values are synthetic so
// this fixture does not import a user's private campaign or specific canon.
const mapped = () => normalizeCountryStatSheet({
  territorialScope: 'mapped',
  territorialComponents: Array.from({ length: 146 }, (_, index) => ({
    geography: `region-${index + 1}`,
    group: index % 9 === 0 ? 'overseas/dependent' : 'core',
    population: Math.floor(78_307_298 / 146) + (index < 78_307_298 % 146 ? 1 : 0),
    gdpPerCapita: [1874.21, 2042.87, 2165.38, 2241.64, 2636.19][index % 5],
  })),
});

const patchGdp = (sheet, ratePercent) => mergeCountryStatPatch(sheet, {
  economy: { gdp: sheet.economy.gdp * (1 + ratePercent / 100) },
});

test('a mapped 146-component GDP reduction reconciles within sub-cent component precision', () => {
  const before = mapped();
  const target = before.economy.gdp * 0.99;
  const after = patchGdp(before, -1);
  assert.equal(after.territorialComponents.length, 146);
  assert.equal(after.population.total, before.population.total);
  assert.ok(Math.abs(after.economy.gdp - target) <= 50,
    `one-event GDP error ${after.economy.gdp - target}`);
  assert.equal(Math.round(aggregateTerritorialEconomy(after.territorialComponents).gdp), after.economy.gdp);
});

test('100 small independent GDP changes cannot accumulate cent-quantization drift', () => {
  for (const percent of [-0.01, 0.01]) {
    const initial = mapped();
    let sheet = initial;
    for (let i = 0; i < 100; i++) sheet = patchGdp(sheet, percent);
    const ideal = initial.economy.gdp * Math.pow(1 + percent / 100, 100);
    assert.ok(Math.abs(sheet.economy.gdp - ideal) <= 5_000,
      `${percent}%: compounded error ${sheet.economy.gdp - ideal}`);
    assert.equal(sheet.population.total, initial.population.total);
    assert.equal(Math.round(aggregateTerritorialEconomy(sheet.territorialComponents).gdp), sheet.economy.gdp);
  }
});

test('legacy cent-precision components are stable across normalize and JSON roundtrips', () => {
  const initial = mapped();
  const reloaded = normalizeCountryStatSheet(JSON.parse(JSON.stringify(initial)));
  assert.deepEqual(reloaded, initial);
  const after = patchGdp(initial, -0.01);
  const saved = normalizeCountryStatSheet(JSON.parse(JSON.stringify(after)));
  assert.deepEqual(saved, after);
  assert.ok(saved.territorialComponents.some((component) => {
    const pc = component.gdpPerCapita;
    return Math.abs(pc * 100 - Math.round(pc * 100)) > 1e-5;
  }), 'native mutation retains sub-cent GDP per-capita precision through persistence');
});

test('zero population and nonterritorial sheets preserve their distinct authority', () => {
  const absent = normalizeCountryStatSheet({ territorialScope: 'nonterritorial', territorialComponents: [] });
  const corrected = mergeCountryStatPatch(absent, { economy: { gdp: 12345 } });
  assert.deepEqual(corrected.territorialComponents, []);
  assert.equal(corrected.population?.total, undefined);
  assert.equal(corrected.economy.gdp, 12345); // Explicit direct correction, not invented baseline
  const base = normalizeCountryStatSheet({
    territorialScope: 'mapped',
    territorialComponents: [
      { geography: 'Empty', group: 'core', population: 0, gdpPerCapita: 1 },
      { geography: 'Populated', group: 'core', population: 1000, gdpPerCapita: 1.01 },
    ],
  });
  const next = patchGdp(base, -90);
  assert.ok(next.territorialComponents.every((component) => component.gdpPerCapita >= 1));
  assert.equal(next.population.total, 1000);
});


test('sub-resolution per-capita values cannot persist as invalid zero components', () => {
  const normalized = normalizeCountryStatSheet({
    territorialComponents: [{ geography: 'Near-zero', group: 'core', population: 1, gdpPerCapita: 0.00000001 }],
  });
  assert.deepEqual(normalized.territorialComponents, []);
  assert.deepEqual(normalizeCountryStatSheet(normalized), normalized);
});

test('native GDP precision updates preserve modern military ratings through save normalization', () => {
  const before = normalizeCountryStatSheet({
    territorialScope: 'mapped',
    territorialComponents: [{ geography: 'Capital District', group: 'core', population: 1_000_000, gdpPerCapita: 1200.12 }],
    military: { quality: 72, technology: 61, spending: 84, manpowerShare: 15 },
  });
  const after = mergeCountryStatPatch(before, { economy: { gdp: before.economy.gdp * 0.9975 } });
  const saved = normalizeCountryStatSheet(JSON.parse(JSON.stringify(after)));
  assert.deepEqual(after.military, before.military);
  assert.deepEqual(saved.military, before.military);
  assert.equal(saved.population.total, before.population.total);
  assert.ok(saved.economy.gdp < before.economy.gdp);
});
