import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceNativeDemographicClock } from './statsDemographicClock.js';
import { mergeCountryStatPatch, captureCountryStatsHistory } from './countryStats.js';

const sample = (observed = true) => {
  const original = mergeCountryStatPatch(null, {
    territorialComponents: [{ geography: 'German Core', group: 'core', population: 78600034, gdpPerCapita: 2185.75 }],
    economy: { gdpGrowth: 2.8, inflation: 1.6, unemployment: 3.5, budgetBalance: -1, publicDebt: 50 },
    continuity: { assessedDate: '1912-12-31', assessedRound: 2,
      demographicEvolution: { version: 1, sourceDate: '1912-01-01', endDate: '1961-12-31',
        lastDate: '1912-01-01', basePopulation: 77840000, birthRate: 29,
        deathRate: 15, birthTrendPerYear: -0.2, deathTrendPerYear: -0.2,
        creditedBirths: 0, creditedDeaths: 0, birthFraction: 0,
        deathFraction: 0, influences: [] } },
  });
  const world = { ownerCodes: ['German Empire'], countryStats: { 'German Empire': original } };
  if (observed) return captureCountryStatsHistory(world, { date: '1912-12-31', round: 2 });
  return world;
};
const advance = (world, toDate = '1913-01-31') => advanceNativeDemographicClock(world, {
  baselineWorld: world, fromDate: '1912-12-31', toDate,
});

test('saved authoritative year-end population permits only future demographic credits, never retroactive backfill', () => {
  const before = sample();
  const after = advance(before);
  const sheet = after.countryStats['German Empire'];
  assert.ok(sheet.population.total > 78600034);
  assert.equal(sheet.continuity.demographicEvolution.sourceDate, '1912-01-01');
  assert.equal(sheet.continuity.demographicEvolution.lastDate, '1913-01-31');
  assert.equal(sheet.continuity.demographicEvolution.basePopulation, 77840000,
    'retain scenario-sourced original model parameters');
  assert.deepEqual(after.countryStatsHistory, before.countryStatsHistory,
    'never create January-November snapshots for the previously AI-maintained year');
  assert.equal(advance(after).countryStats['German Empire'].population.total, sheet.population.total);
});

test('no matching recorded end-of-turn observation cannot authorize an implicit reanchor', () => {
  const before = sample(false);
  assert.deepEqual(advance(before), before);
  const mismatched = sample();
  mismatched.countryStatsHistory['German Empire'][0].population = 12;
  assert.deepEqual(advance(mismatched), mismatched);
});

test('an explicit pending demographic influence or existing native economy cursor blocks legacy reassessment handoff', () => {
  const before = sample();
  before.countryStats['German Empire'].continuity.demographicEvolution.influences.push({
    eventId: 'e1', startDate: '1912-04-01', birthRateChange: -1,
    deathRateChange: 0, lagDays: 0, rampDays: 30, durationDays: 365,
  });
  assert.deepEqual(advance(before), before);
  const other = sample();
  other.countryStats['German Empire'].continuity.nativeEconomyClock = { lastDate: '1912-03-31' };
  assert.deepEqual(advance(other), other);
});
