/*! Open Historia - first native macro interval accounts for actual finite population change. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCountryStatPatch } from './countryStats.js';
import { advanceNativeDemographicClock } from './statsDemographicClock.js';
import { advanceNativeMacroEconomyClock } from './statsNativeEconomyClock.js';
import { planNativeStatsLiveTurn } from './statsLiveTurnClock.js';

const first = '1912-01-01';
const last = '1912-02-01';
const worldWithFiniteDemography = (births = 25, deaths = 15) => ({
  ownerCodes: ['Aland'],
  countryStats: {
    Aland: mergeCountryStatPatch(null, {
      territorialComponents: [
        { geography: 'Aland City', group: 'core', population: 1000000, gdpPerCapita: 1000 },
      ],
      economy: { gdpGrowth: 3, inflation: 0, unemployment: 7, budgetBalance: 0, publicDebt: 40 },
      continuity: {
        assessedDate: first,
        demographicClock: { sourceDate: first, endDate: '1913-01-01', lastDate: first,
          basePopulation: 1000000, birthsPerThousand: births, deathsPerThousand: deaths,
          creditedBirths: 0, creditedDeaths: 0 },
      },
    }),
  },
});

const annualized = (from, to, days) => 100 * (Math.pow(to / from, 365.2425 / days) - 1);

test('first finite demographic interval retains the authored total GDP trend without counting population growth as productivity', () => {
  const before = worldWithFiniteDemography();
  const afterDemographics = advanceNativeDemographicClock(before,
    { baselineWorld: before, fromDate: first, toDate: last });
  assert.equal(afterDemographics.countryStats.Aland.population.total, 1000849);
  const after = advanceNativeMacroEconomyClock(afterDemographics,
    { baselineWorld: before, fromDate: first, toDate: last });
  const original = before.countryStats.Aland;
  const output = after.countryStats.Aland;
  assert.ok(output.continuity.nativeEconomyClock, 'native macro clock should activate for assessed inputs');
  // At 25 births and 15 deaths per thousand, 1% annual resident growth is
  // already booked by Demographics. The assessed 3% total growth must leave
  // about 2% for productivity rather than crediting 3% *again* to output.
  const expectedProductivity = 2 * Math.pow(2, -31 / (4 * 365.2425));
  assert.ok(Math.abs(output.continuity.nativeEconomyClock.productivity - expectedProductivity) < 0.00001,
    `the source productivity must be 3%-1%, not ${output.continuity.nativeEconomyClock.productivity}`);
  const rate = annualized(original.economy.gdp, output.economy.gdp, 31);
  assert.ok(Math.abs(rate - 3) < 0.1,
    `the first period must include native residents and productivity once, not ${rate.toFixed(3)}% annual GDP growth`);
});

test('ordinary turn integration passes the pre-demography population anchor to the native macro writer', () => {
  const before = worldWithFiniteDemography();
  const plan = planNativeStatsLiveTurn({ baseWorld: before, fromDate: first, toDate: last, round: 2, events: [] });
  assert.ok(plan);
  const output = plan.afterEvents(before, 0).countryStats.Aland;
  assert.equal(output.population.total, 1000849);
  assert.ok(Math.abs(output.continuity.nativeEconomyClock.productivity
    - 2 * Math.pow(2, -31 / (4 * 365.2425))) < 0.00001);
  assert.ok(Math.abs(annualized(before.countryStats.Aland.economy.gdp, output.economy.gdp, 31) - 3) < .1);
});

test('one yearly turn equals its monthly partitions for finite births/deaths, GDP and history', () => {
  const beginning = worldWithFiniteDemography();
  const end = '1912-12-31';
  const annualBoundary = planNativeStatsLiveTurn({ baseWorld: beginning,
    fromDate: first, toDate: end, round: 2, events: [] });
  assert.ok(annualBoundary);
  const annual = annualBoundary.afterEvents(beginning, 0);
  let month = beginning, cursor = first;
  const observations = annual.countryStatsHistory.Aland.map((row) => row.date);
  assert.equal(observations.length, 12);
  for (const date of observations) {
    const boundary = planNativeStatsLiveTurn({ baseWorld: month,
      fromDate: cursor, toDate: date, round: 2, events: [] });
    assert.ok(boundary, `missing finite demographic/native chronology ${cursor} to ${date}`);
    month = boundary.afterEvents(month, 0);
    cursor = date;
  }
  const a = annual.countryStats.Aland, b = month.countryStats.Aland;
  assert.equal(b.population.total, a.population.total);
  assert.equal(b.economy.gdp, a.economy.gdp);
  assert.equal(b.economy.publicDebt, a.economy.publicDebt);
  assert.deepEqual(month.countryStatsHistory.Aland, annual.countryStatsHistory.Aland);
  assert.deepEqual(b.continuity.demographicClock, a.continuity.demographicClock);
});

test('a changed legal territorial-component roster is not counted as natural population growth', () => {
  const current = worldWithFiniteDemography(0, 0);
  const prior = { ...current, countryStats: {
    Aland: mergeCountryStatPatch(null, {
      territorialComponents: [{ geography: 'Prior Territory', group: 'core', population: 800000, gdpPerCapita: 1000 }],
      economy: { gdpGrowth: 3, inflation: 0, unemployment: 7, budgetBalance: 0, publicDebt: 40 },
      continuity: { assessedDate: first },
    }),
  } };
  const end = advanceNativeMacroEconomyClock(current,
    { baselineWorld: prior, fromDate: first, toDate: last }).countryStats.Aland;
  assert.equal(end.continuity.nativeEconomyClock.lastPopulation, current.countryStats.Aland.population.total,
    'do not multiply GDP by an unsupported transfer of residents from different legal geography');
  assert.ok(annualized(current.countryStats.Aland.economy.gdp, end.economy.gdp, 31) < 4);
});

test('expired finite demographic rates stop contributing phantom current growth and labor response', () => {
  const initial = worldWithFiniteDemography();
  const limited = { ...initial, countryStats: {
    Aland: mergeCountryStatPatch(initial.countryStats.Aland, {
      continuity: { demographicClock: {
        ...initial.countryStats.Aland.continuity.demographicClock,
        endDate: '1912-02-01',
      } },
    }),
  } };
  const run = (world, fromDate, toDate) => {
    const boundary = planNativeStatsLiveTurn({ baseWorld: world, fromDate, toDate, round: 2, events: [] });
    assert.ok(boundary);
    return boundary.afterEvents(world, 0);
  };
  const reachedEnd = run(limited, '1912-01-01', '1912-02-01');
  const settled = run(reachedEnd, '1912-02-01', '1912-03-01');
  const before = reachedEnd.countryStats.Aland;
  const after = settled.countryStats.Aland;
  assert.equal(after.population.total, before.population.total, 'no births/deaths after authored horizon');
  assert.equal(after.continuity.demographicClock.lastDate, '1912-02-01');
  assert.ok(Math.abs(after.economy.gdpGrowth
    - (after.continuity.nativeEconomyClock.productivity + after.continuity.nativeEconomyClock.demandGap)) < .002,
    'the displayed current real growth cannot keep including expired 1% natural growth');
  const viaSplit = run(run(reachedEnd, '1912-02-01', '1912-02-15'), '1912-02-15', '1912-03-01');
  assert.equal(viaSplit.countryStats.Aland.economy.gdpGrowth, after.economy.gdpGrowth);
  assert.ok(Math.abs(viaSplit.countryStats.Aland.economy.unemployment - after.economy.unemployment) <= .0002,
    "four-decimal employment reporting permits one final digit of rounding drift");
  assert.ok(Math.abs(viaSplit.countryStats.Aland.economy.gdp - after.economy.gdp) <= after.economy.gdp * 1e-7,
    "persisted daily growth-rate rounding permits only sub-ppm partition drift");
});
