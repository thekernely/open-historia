import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEventImpactsToWorld, normalizeEvents } from './gameState.js';
import { planNeutralStatsLiveTurn } from './statsNeutralTurnClock.js';
import { mergeCountryStatPatch } from './countryStats.js';

const startingSheet = (key) => mergeCountryStatPatch(null, {
  territorialComponents: [{ geography: `${key} Province`, group: 'core', population: 1000000, gdpPerCapita: 1000 }],
  economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
  continuity: { assessedDate: '1912-01-01', demographicEvolution: { version: 1,
    sourceDate: '1912-01-01', endDate: '1961-12-31', lastDate: '1912-01-01',
    basePopulation: 1000000, birthRate: 30, deathRate: 15,
    birthTrendPerYear: 0, deathTrendPerYear: 0, creditedBirths: 0,
    creditedDeaths: 0, birthFraction: 0, deathFraction: 0, influences: [],
  } },
});
const world = () => ({
  ownerCodes: ['Aland', 'Borduria', 'Neutral'],
  polityOverrides: {
    Aland: { name: 'Aland' }, Borduria: { name: 'Borduria' },
    Neutral: { name: 'Republic of Neutral' },
  },
  countryStats: {
    Aland: startingSheet('Aland'), Borduria: startingSheet('Borduria'),
    Neutral: startingSheet('Neutral'),
  },
  wars: [{ id: 'war-a-b', status: 'active', sideA: ['Aland'], sideB: ['Borduria'] }],
  blockades: [],
});

test('the scoped clock survives reducer startup display-name migrations and preserves real month-end history', () => {
  const base = world();
  const events = normalizeEvents([{ id: 'event-1', date: '1912-02-02', title: 'War conference',
    warId: 'war-a-b', combatants: [] }]);
  const chronology = planNeutralStatsLiveTurn({ baseWorld: base,
    events, fromDate: '1912-01-01', toDate: '1912-03-31', round: 2,
    warUpdates: [], turnFronts: { flips: [{ from: 'Aland', to: 'Borduria' }] },
  });
  assert.ok(chronology);
  assert.deepEqual(chronology.scopedCountries, ['Republic of Neutral']);
  const result = applyEventImpactsToWorld({ world: base, colors: {}, events,
    motion: { originDate: '1912-01-01', round: 2, tick: 0 }, statsChronology: chronology });
  const next = result.world;
  assert.ok(next.countryStats['Republic of Neutral']);
  assert.equal(next.countryStats.Neutral, undefined);
  assert.equal(next.countryStats['Republic of Neutral'].continuity.nativeEconomyClock.lastDate, '1912-03-31');
  assert.deepEqual(next.countryStatsHistory['Republic of Neutral'].map((row) => row.date),
    ['1912-01-31', '1912-02-29', '1912-03-31']);
  assert.ok(next.countryStats['Republic of Neutral'].economy.gdp > 1000000000);
  assert.ok(next.countryStats.Aland);
  assert.ok(next.countryStats.Borduria);
  assert.ok(result.renamedPolities?.some(({ from, to }) => from === 'Neutral' && to === 'Republic of Neutral'));
});

test('an otherwise-neutral country renamed mid-turn is excluded from the stable clock scope', () => {
  const base = world();
  base.ownerCodes.push('Unaffected');
  base.polityOverrides.Unaffected = { name: 'Unaffected' };
  base.countryStats.Unaffected = startingSheet('Unaffected');
  const events = normalizeEvents([{ id: 'event-rename', date: '1912-02-02', title: 'Renamed',
    impacts: { polityChanges: [{ operation: 'update', code: 'Unaffected', name: 'Renamed Unaffected' }] },
  }]);
  const plan = planNeutralStatsLiveTurn({ baseWorld: base,
    events, fromDate: '1912-01-01', toDate: '1912-03-31', round: 2,
    warUpdates: [], turnFronts: { flips: [{ from: 'Aland', to: 'Borduria' }] },
  });
  assert.ok(plan);
  assert.deepEqual(plan.scopedCountries, ['Republic of Neutral']);
});


test('the scoped writer still refuses an unexplained selected-account disappearance', () => {
  const base = world();
  const events = normalizeEvents([{ id: 'event-1', date: '1912-02-02', title: 'Treaty meeting' }]);
  const plan = planNeutralStatsLiveTurn({ baseWorld: base, events,
    fromDate: '1912-01-01', toDate: '1912-03-31', round: 2,
    warUpdates: [], turnFronts: { flips: [{ from: 'Aland', to: 'Borduria' }] },
  });
  assert.ok(plan);
  const missing = structuredClone(base);
  delete missing.countryStats.Neutral;
  assert.throws(() => plan.beforeEvent(missing, 0, events[0]),
    /Native neutral Statistics scope changed during the turn \(current missing: Republic of Neutral/);
});
