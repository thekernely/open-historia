import test from 'node:test';
import assert from 'node:assert/strict';
import { addGameDays } from './gameDates.js';
import { mergeCountryStatPatch, normalizeCountryStatSheet, normalizeCountryStatEconomicInfluences, captureCountryStatsHistory } from './countryStats.js';
import { planStatsEventEffect } from './statsEventEffects.js';
import { appendAcceptedStatsReceipt } from './statsEventReceipts.js';
import { advanceNativeMacroEconomyClock } from './statsNativeEconomyClock.js';

const fixture = () => ({
  ownerCodes: ['Borealia'],
  statsEventReceipts: [],
  countryStats: {
    Borealia: mergeCountryStatPatch(null, {
      territorialComponents: [{ geography: 'Borealia', group: 'core', population: 1000000, gdpPerCapita: 5000 }],
      economy: { gdpGrowth: 3, inflation: 1, unemployment: 5, publicDebt: 30, budgetBalance: 0 },
      continuity: { assessedDate: '1912-01-01' },
    }),
  },
});
const advance = (world, fromDate, toDate) => advanceNativeMacroEconomyClock(world, { baselineWorld: world, fromDate, toDate });
const apply = (world, date, eventId, effect) => {
  const before = world.countryStats.Borealia;
  const planned = planStatsEventEffect({ sheet: before, effect, eventId, eventDate: date });
  const after = mergeCountryStatPatch(before, planned.patch, { continuity: { accountedEventIds: [eventId] }, maxAggregateRescale: 10 });
  const changed = { ...world, countryStats: { ...world.countryStats, Borealia: after } };
  appendAcceptedStatsReceipt(changed, { eventId, polity: 'Borealia', date, reason: planned.reason, before, after, process: planned.process, resolution: planned.resolution });
  return changed;
};

test('bounded strike changes dated output and then expires; no fabricated instant damage', () => {
  const beginning = fixture();
  const stroke = apply(beginning, '1912-01-15', 'strike', {
    annualRealGrowthDelta: -12, durationDays: 42, gdpCause: 'production', reason: 'Documented 42-day coal stoppage estimate',
  });
  assert.equal(stroke.countryStats.Borealia.economy.gdp, beginning.countryStats.Borealia.economy.gdp);
  assert.equal(stroke.statsEventReceipts.length, 1);
  assert.equal(stroke.statsEventReceipts[0].process.annualRealGrowthDelta, -12);
  assert.equal(stroke.countryStats.Borealia.continuity.economicInfluences[0].endDate, addGameDays('1912-01-15', 42));
  assert.equal(stroke.countryStats.Borealia.continuity.accountedEventIds[0], 'strike');
  const normal = advance(beginning, '1912-01-01', '1912-03-31');
  const result = advance(advance(stroke, '1912-01-15', '1912-02-29'), '1912-02-29', '1912-03-31');
  const without = advance(advance(beginning, '1912-01-15', '1912-02-29'), '1912-02-29', '1912-03-31');
  assert.ok(result.countryStats.Borealia.economy.gdp < without.countryStats.Borealia.economy.gdp);
  assert.ok(result.countryStats.Borealia.economy.gdp < normal.countryStats.Borealia.economy.gdp);
  assert.equal(result.countryStats.Borealia.continuity.economicInfluences.length, 1, 'historical receipt retained beyond expiry');
  assert.equal(result.countryStats.Borealia.continuity.nativeEconomyClock.lastDate, '1912-03-31');
});

test('single long skip equals month-partitioned skip after same event, including history', () => {
  let single = apply(fixture(), '1912-01-15', 'coal', {
    annualRealGrowthDelta: -8, durationDays: 75, gdpCause: 'trade', reason: 'Supply network stoppage estimate',
  });
  let monthly = structuredClone(single);
  single = advance(single, '1912-01-15', '1912-04-30');
  for (const [from, to] of [['1912-01-15', '1912-01-31'], ['1912-01-31', '1912-02-29'],
    ['1912-02-29', '1912-03-31'], ['1912-03-31', '1912-04-30']]) monthly = advance(monthly, from, to);
  assert.equal(single.countryStats.Borealia.economy.gdp, monthly.countryStats.Borealia.economy.gdp);
  assert.equal(single.countryStats.Borealia.economy.gdpGrowth, monthly.countryStats.Borealia.economy.gdpGrowth);
  assert.equal(single.countryStats.Borealia.continuity.nativeEconomyClock.lastDate, '1912-04-30');
});

test('invalid, duplicated, ambiguous or unsupported finite disturbances cannot become canonical', () => {
  const original = fixture();
  const good = { annualRealGrowthDelta: -2, durationDays: 30, gdpCause: 'policy', reason: 'Temporary output restriction' };
  for (const broken of [
    { ...good, durationDays: 0 }, { ...good, durationDays: 731 }, { ...good, durationDays: 1.2 },
    { ...good, annualRealGrowthDelta: -21 }, { ...good, annualRealGrowthDelta: 0 },
    { ...good, gdpCause: 'destruction' }, { ...good, extra: 'no' },
    { ...good, annualRealGrowthDelta: NaN },
  ]) assert.throws(() => apply(original, '1912-01-15', 'bad', broken));
  assert.throws(() => apply(original, 'bad-date', 'bad', good));
  const once = apply(original, '1912-01-15', 'coal', good);
  assert.throws(() => apply(once, '1912-01-20', 'coal', good), /accounted|identity/i);
  assert.equal(normalizeCountryStatEconomicInfluences([{ eventId: 'e', startDate: '1912-01-01', endDate: '1914-12-31', annualRealGrowthDelta: -2, cause: 'policy', reason: 'too long' }]), null);
  assert.equal(normalizeCountryStatSheet(original.countryStats.Borealia).continuity.economicInfluences, undefined);
});

test('an identified resolution stops a finite growth influence from its event date without rewinding GDP', () => {
  const shock = { annualRealGrowthDelta: -10, durationDays: 90,
    gdpCause: 'production', reason: 'Measured coal stoppage with dated expected duration' };
  const stop = { resolveGrowthInfluenceEventId: 'strike',
    reason: 'A signed labor settlement ended the recorded work stoppage' };
  let before = apply(fixture(), '1912-01-15', 'strike', shock);
  before = advance(before, '1912-01-15', '1912-02-09');
  const gdpBefore = before.countryStats.Borealia.economy.gdp;
  const planned = planStatsEventEffect({sheet: before.countryStats.Borealia, effect: stop,
    eventId: 'settlement', eventDate: '1912-02-10'});
  assert.equal(planned.resolution.eventId, 'strike');
  assert.equal(planned.patch.economy, undefined);
  const stopped = apply(before, '1912-02-10', 'settlement', stop);
  const entry = stopped.countryStats.Borealia.continuity.economicInfluences[0];
  assert.equal(stopped.countryStats.Borealia.economy.gdp, gdpBefore);
  assert.equal(entry.endDate, addGameDays('1912-01-15', 90));
  assert.equal(entry.resolvedDate, '1912-02-10');
  assert.equal(entry.resolvedByEventId, 'settlement');
  assert.deepEqual(stopped.statsEventReceipts[1].resolution,
    { eventId:'strike', resolvedDate:'1912-02-10', resolvedByEventId:'settlement' });
  assert.equal(stopped.statsEventReceipts[1].changes.length, 0);
  const one = advance(stopped, '1912-02-09', '1912-04-30');
  let partitions = stopped;
  for (const [from,to] of [['1912-02-09','1912-02-29'], ['1912-02-29','1912-03-31'],
    ['1912-03-31','1912-04-30']]) partitions = advance(partitions, from, to);
  assert.equal(one.countryStats.Borealia.economy.gdp, partitions.countryStats.Borealia.economy.gdp);
  assert.equal(one.countryStats.Borealia.economy.gdpGrowth, partitions.countryStats.Borealia.economy.gdpGrowth);
  const unresolved = advance(before,'1912-02-09','1912-04-30');
  assert.ok(one.countryStats.Borealia.economy.gdp > unresolved.countryStats.Borealia.economy.gdp);
  assert.throws(() => apply(stopped, '1912-02-11', 'settlement2', stop), /live, unresolved/);
  assert.throws(() => apply(stopped, '1912-02-11', 'settlement', stop), /accounted/);
});

test('resolution refuses invented, expired, retroactive, conflicting or malformed references', () => {
  const shock = { annualRealGrowthDelta: -5, durationDays: 45,
    gdpCause: 'trade', reason: 'Verified trade flow disruption' };
  const first = apply(fixture(), '1912-01-15', 'interruption', shock);
  const stop = { resolveGrowthInfluenceEventId: 'interruption', reason:'Ports reopened on verified date' };
  for (const [id,date,option] of [
    ['unknown','1912-02-10',{}], ['interruption','1912-03-20',{}],
    ['interruption','1912-01-14',{}], ['interruption','not-a-date',{}],
    ['interruption','1912-02-10',{absoluteStats:{indices:{foodAutonomy:80}}}],
  ]) {
    assert.throws(() => planStatsEventEffect({sheet:first.countryStats.Borealia,
      effect:{...stop,resolveGrowthInfluenceEventId:id}, eventDate:date, eventId:'stop', ...option}));
  }
  assert.throws(() => planStatsEventEffect({sheet:first.countryStats.Borealia,
    effect:{...stop,stabilityDelta:-2},eventDate:'1912-02-10',eventId:'stop'}), /cannot be combined/);
  const row = first.countryStats.Borealia.continuity.economicInfluences[0];
  for (const bad of [
    {...row,resolvedDate:'1912-02-10'},
    {...row,resolvedDate:'1912-02-10',resolvedByEventId:'interruption'},
    {...row,resolvedDate:'1912-01-01',resolvedByEventId:'stop'},
    {...row,resolvedDate:'1912-07-01',resolvedByEventId:'stop'},
  ]) assert.equal(normalizeCountryStatEconomicInfluences([bad]),null);
  const stale = advance(first,'1912-01-15','1912-02-29');
  assert.throws(() => apply(stale,'1912-02-10','retroactive',stop), /distinct, dated/);
});

test('resolved sources release bounded active-process capacity but remain auditable in event receipts', () => {
  const effect = { annualRealGrowthDelta:-1, durationDays:200,
    gdpCause:'trade', reason:'Evidence-backed temporary supply disruption' };
  const first=apply(fixture(),'1912-01-15','source',effect);
  const stopped=apply(first,'1912-02-20','resolution',{
    resolveGrowthInfluenceEventId:'source', reason:'Supply route restoration confirmed by carriers',
  });
  const next=apply(stopped,'1912-02-21','new-source',effect);
  assert.deepEqual(next.countryStats.Borealia.continuity.economicInfluences.map(row=>row.eventId), ['new-source']);
  assert.deepEqual(next.statsEventReceipts.map(row=>row.eventId),['source','resolution','new-source']);
});

test('finite economic source can link to the existing active geopolitical storyline but cannot mint another cause', () => {
  const before = fixture().countryStats.Borealia;
  const base = { annualRealGrowthDelta: -2, durationDays: 80, gdpCause: 'trade',
    sourceStorylineId: 'trade-crisis', reason: 'Measured supply interruption in the active crisis' };
  const storylines = [{ id: 'trade-crisis', status: 'active', participants: ['Borealia'] }];
  const options = { sheet: before, effect: base, eventId: 'crisis-shock', eventDate: '1912-01-15',
    storylines, eventStorylineIds: ['trade-crisis'], polity: 'Borealia' };
  const planned = planStatsEventEffect(options);
  assert.equal(planned.process.sourceStorylineId, 'trade-crisis');
  assert.equal(planned.sourceStorylineId, 'trade-crisis');
  const accepted = mergeCountryStatPatch(before, { ...planned.patch, continuity: {
    ...planned.patch.continuity, accountedEventIds: ['crisis-shock'],
  } });
  assert.equal(accepted.continuity.economicInfluences[0].sourceStorylineId, 'trade-crisis');
  for (const wrong of [
    { eventStorylineIds: [] },
    { storylines: [{ ...storylines[0], status: 'resolved' }] },
    { storylines: [{ ...storylines[0], participants: ['Other'] }] },
    { polity: 'Other' },
    { effect: { ...base, sourceStorylineId: 'imaginary' } },
  ]) assert.throws(() => planStatsEventEffect({ ...options, ...wrong }), /active, event-linked storyline/);
  assert.throws(() => planStatsEventEffect({ sheet: accepted,
    effect: { resolveGrowthInfluenceEventId: 'crisis-shock', sourceStorylineId: 'other-crisis', reason: 'Disruption cleared' },
    eventId: 'resolution', eventDate: '1912-02-10', storylines: [
      ...storylines, { id:'other-crisis', status:'active',participants:['Borealia'] },
    ], eventStorylineIds: ['other-crisis'], polity: 'Borealia',
  }), /relabel/);
});

test('causal source identity is preserved in the process receipt and read-only briefing', async () => {
  const { buildActiveEconomicInfluenceContext } = await import('./statsEconomicInfluenceContext.js');
  const initial = fixture();
  const source = { annualRealGrowthDelta: -3, durationDays: 30, gdpCause: 'trade',
    sourceStorylineId: 'italo-turkish-war-1911', reason: 'Measurable loss of trade access during the war' };
  const eventId = 'dated-trade-loss';
  const planned = planStatsEventEffect({ effect: source, sheet: initial.countryStats.Borealia,
    eventId, eventDate: '1912-01-18', polity: 'Borealia',
    eventStorylineIds: ['italo-turkish-war-1911'],
    storylines: [{ id: 'italo-turkish-war-1911', status: 'active', participants: ['Borealia'] }],
  });
  const after = mergeCountryStatPatch(initial.countryStats.Borealia, { ...planned.patch,
    continuity: { ...planned.patch.continuity, accountedEventIds: [eventId] },
  });
  const next = { ...initial, countryStats: { Borealia: after } };
  appendAcceptedStatsReceipt(next, { eventId, polity: 'Borealia', date: '1912-01-18',
    reason: planned.reason, sourceStorylineId: planned.sourceStorylineId,
    before: initial.countryStats.Borealia, after, process: planned.process });
  assert.equal(next.statsEventReceipts[0].sourceStorylineId, source.sourceStorylineId);
  assert.equal(next.statsEventReceipts[0].process.sourceStorylineId, source.sourceStorylineId);
  assert.match(buildActiveEconomicInfluenceContext(next, '1912-01-20'), /sourceStorylineId="italo-turkish-war-1911"/);
  assert.throws(() => appendAcceptedStatsReceipt({ ...next, statsEventReceipts: [] }, {
    eventId, polity: 'Borealia', date: '1912-01-18', reason: planned.reason,
    before: initial.countryStats.Borealia, after, process: planned.process,
    sourceStorylineId: 'unrelated',
  }), /Invalid Statistics causal storyline receipt/);
});
