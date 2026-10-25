import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldGrid } from './fronts/worldGrid.js';
import { syntheticMap } from './fronts/syntheticMap.js';
import { runNaval } from './naval/engine.js';
import { mergeCountryStatPatch } from './countryStats.js';
import { planNativeStatsLiveTurn } from './statsLiveTurnClock.js';
import { validateCompletePositiveNavalEvidence } from './statsNavalEconomicPort.js';

const fromDate = '1914-08-01';
const toDate = '1914-08-31';
const warring = { id: 'test-war', status: 'active', sideA: ['Albion'], sideB: ['Teutonia'] };
const national = (country) => mergeCountryStatPatch(null, {
  territorialComponents: [{ geography: `${country} Mainland`, group: 'core', population: 1000000, gdpPerCapita: 1000 }],
  economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
  continuity: { assessedDate: fromDate },
});

test('the actual naval engine positive evidence is consumable by exactly one native dated economic writer', () => {
  const map = syntheticMap({
    layout: ['AAA~~~~BBB', 'AAA~~~~BBB', 'AAA~~~~BBB', 'AAA~~~~BBB'],
    legend: { A: 'Albion', B: 'Teutonia', '~': null }, west: 0, north: 54, step: 1, key: 'sea-test',
  });
  const grid = buildWorldGrid(map.regions, { step: .5 });
  const sea = {
    ...runNaval({ fromDate, days: 30, seed: 'test-blockade', wars: [warring],
      units: [{ id: 'fleet1', name: 'Grand Fleet', ownerCode: 'Albion', type: 'naval',
        strength: 100, lng: 5, lat: 52, posture: 'blockade' }],
      raised: [{ country: 'Teutonia', date: '1914-07-01' }],
      strengthOf: () => 13, controllerOf: map.controllerOf, grid }),
    fromDate, days: 30,
  };
  assert.equal(sea.blockadeDays.length, 30);
  assert.equal(validateCompletePositiveNavalEvidence({ fromDate, toDate, sea })?.length, 30);
  const before = { ownerCodes: ['Albion', 'Teutonia'], wars: [warring],
    countryStats: { Albion: national('Albion'), Teutonia: national('Teutonia') } };
  const native = planNativeStatsLiveTurn({ baseWorld: before,
    turnFronts: { sea }, fromDate, toDate, events: [], round: 2 });
  assert.ok(native);
  const after = native.afterEvents(before, 0);
  assert.ok(after.countryStats.Teutonia.economy.gdp < after.countryStats.Albion.economy.gdp);
  assert.ok(after.countryStats.Teutonia.economy.budgetBalance < -2);
  assert.ok(after.countryStats.Teutonia.economy.publicDebt > 40);
  assert.equal(after.countryStats.Albion.economy.budgetBalance, -2);
  assert.equal(after.countryStatsHistory.Teutonia.at(-1).date, toDate);
  assert.equal(before.countryStats.Teutonia.economy.budgetBalance, -2);
});
