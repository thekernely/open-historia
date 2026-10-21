import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceNativeFiscalClock, FISCAL_CLOCK_MAX_DAYS } from './statsFiscalClock.js';
import { mergeCountryStatPatch, normalizeCountryStatSheet } from './countryStats.js';
import { addGameDays } from './gameDates.js';

const country = ({ assessedDate = '2014-01-01', budgetBalance = -6, publicDebt = 40 } = {}) => ({
  territorialComponents: [{ geography: 'Latvia', group: 'core', population: 2_000_000, gdpPerCapita: 12_000 }],
  economy: { budgetBalance, publicDebt, gdpGrowth: 3.2, unemployment: 9 },
  continuity: { assessedDate },
});
const state = (sheet = country()) => ({ ownerCodes: ["Latvia"], countryStats: { Latvia: sheet } });
const move = (world, fromDate, toDate, baselineWorld = world) => advanceNativeFiscalClock(world, { baselineWorld, fromDate, toDate });
const sheet = (world) => normalizeCountryStatSheet(world.countryStats.Latvia);

test('a quiet skip accrues a measured deficit without events, keywords, or an AI request', () => {
  const prior = state();
  const after = move(prior, '2014-01-01', '2014-01-31');
  assert.ok(sheet(after).economy.publicDebt > 40);
  assert.ok(sheet(after).economy.publicDebt < 41);
  assert.equal(sheet(after).population.total, sheet(prior).population.total);
  assert.equal(sheet(after).economy.gdp, sheet(prior).economy.gdp);
  assert.equal(sheet(after).economy.budgetBalance, -6);
  assert.equal(sheet(after).continuity.fiscalClock.lastDate, '2014-01-31');
  assert.equal(sheet(prior).continuity.fiscalClock, undefined, 'input is not mutated');
});

test('replay of an already processed period cannot charge debt a second time', () => {
  const prior = state();
  const once = move(prior, '2014-01-01', '2014-02-01');
  const twice = move(once, '2014-01-01', '2014-02-01', prior);
  assert.deepEqual(twice, once);
});

test('split skips approach the same fiscal total as a single skip', () => {
  const prior = state();
  const whole = move(prior, '2014-01-01', '2014-03-01');
  const first = move(prior, '2014-01-01', '2014-02-01');
  const split = move(first, '2014-02-01', '2014-03-01');
  assert.ok(Math.abs(sheet(split).economy.publicDebt - sheet(whole).economy.publicDebt) <= 0.0001);
});

test('an existing budget surplus reduces debt but never turns the public debt negative', () => {
  const after = move(state(country({ budgetBalance: 50, publicDebt: 0.01 })), '2014-01-01', '2014-04-01');
  assert.equal(sheet(after).economy.publicDebt, 0);
});

test('event-driven GDP and independently specified fiscal changes survive native accrual', () => {
  const prior = state();
  const updated = state(mergeCountryStatPatch(sheet(prior), {
    economy: { gdp: sheet(prior).economy.gdp * 0.95, budgetBalance: -3, publicDebt: 51 },
  }));
  const after = move(updated, '2014-01-01', '2014-01-31', prior);
  assert.equal(sheet(after).economy.gdp, sheet(updated).economy.gdp);
  assert.equal(sheet(after).economy.budgetBalance, -3);
  assert.ok(sheet(after).economy.publicDebt > 51);
});

test('missing Stats, missing fiscal inputs, invalid dates, future source and unsupported values do not drift', () => {
  const empty = { countryStats: {} };
  assert.equal(move(empty, '2014-01-01', '2014-02-01'), empty);
  const noRate = state({ economy: { publicDebt: 40 } });
  assert.equal(move(noRate, '2014-01-01', '2014-02-01'), noRate);
  const future = state(country({ assessedDate: '2015-01-01' }));
  assert.equal(move(future, '2014-01-01', '2014-02-01'), future);
  const unsupported = state(country({ budgetBalance: -60 }));
  assert.equal(move(unsupported, '2014-01-01', '2014-02-01'), unsupported);
  const regular = state();
  assert.equal(move(regular, '2014-02-01', '2014-01-01'), regular);
});

test('annual balance authority expires instead of extrapolating forever', () => {
  const prior = state();
  const horizon = addGameDays('2014-01-01', FISCAL_CLOCK_MAX_DAYS);
  const through = move(prior, '2014-01-01', addGameDays(horizon, 30));
  const later = move(through, addGameDays(horizon, 30), addGameDays(horizon, 365));
  assert.deepEqual(later, through);
  assert.equal(sheet(through).continuity.fiscalClock.lastDate, horizon);
});

test('a newly assessed budget balance establishes a fresh accrual window', () => {
  const first = move(state(), '2014-01-01', '2014-02-01');
  const refreshed = state(mergeCountryStatPatch(sheet(first), {
    economy: { budgetBalance: 7 }, continuity: { assessedDate: '2014-02-01' },
  }));
  const later = move(refreshed, '2014-02-01', '2014-03-01');
  assert.ok(sheet(later).economy.publicDebt < sheet(refreshed).economy.publicDebt);
  assert.equal(sheet(later).continuity.fiscalClock.sourceDate, '2014-02-01');
});

test('the native clock retains strict normalization and BC calendar correctness', () => {
  const bc = state(country({ assessedDate: '-0001-12-01' }));
  const later = move(bc, '-0001-12-01', '0001-01-01');
  assert.ok(sheet(later).economy.publicDebt > 40);
  const clock = sheet(later).continuity.fiscalClock;
  assert.ok(clock);
  assert.equal(normalizeCountryStatSheet({ continuity: { fiscalClock: { ...clock, lastDate: 'not a date' } } }).continuity, undefined);
});

test('derived countryStats-only ghosts do not enter autonomous fiscal progression', () => {
  const real = country();
  const ghost = country({ budgetBalance: -25 });
  const prior = { ownerCodes: ['Latvia'], countryStats: { Latvia: real, StockGhost: ghost } };
  const later = move(prior, '2014-01-01', '2014-02-01');
  assert.ok(sheet(later).economy.publicDebt > 40);
  assert.deepEqual(later.countryStats.StockGhost, ghost);
});

test('an undated change to the budget balance cannot rewrite the previous source rate', () => {
  const first = move(state(), '2014-01-01', '2014-02-01');
  const changedBalanceWithoutAssessment = state(mergeCountryStatPatch(sheet(first), {
    economy: { budgetBalance: 13 },
  }));
  const later = move(changedBalanceWithoutAssessment, '2014-02-01', '2014-03-01');
  assert.equal(later, changedBalanceWithoutAssessment);
});

test('clock normalization never creates missing baselines or converts unset money to zero', () => {
  const unmeasured = state({ economy: { budgetBalance: -3 }, continuity: { assessedDate: '2014-01-01' } });
  assert.equal(move(unmeasured, '2014-01-01', '2014-02-01'), unmeasured);
  const invalid = normalizeCountryStatSheet({ continuity: { fiscalClock: { sourceDate: '2014-01-01', anchorDate: '2014-01-01', lastDate: '2015-01-01', balance: -5, credited: 50 } } });
  assert.equal(invalid.continuity, undefined);
});

test('quiet-turn fiscal movement is visible to the existing historical sampler', async () => {
  const { captureCountryStatsHistory } = await import('./countryStats.js');
  const initial = captureCountryStatsHistory(state(), { date: '2014-01-01', round: 1 });
  const evolved = move(initial, '2014-01-01', '2014-02-01');
  const sampled = captureCountryStatsHistory(evolved, { date: '2014-02-01', round: 2 });
  const rows = sampled.countryStatsHistory.Latvia;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2014-01-01');
  assert.equal(rows[1].date, '2014-02-01');
  assert.ok(rows[1].publicDebt > rows[0].publicDebt);
  assert.equal(rows[1].gdp, rows[0].gdp);
});
