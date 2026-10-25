import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatsCrisisEstimate } from './statsCrisisEstimate.js';
import { normalizeCountryStatEconomicInfluences, mergeCountryStatPatch } from './countryStats.js';
import { planStatsEventEffect } from './statsEventEffects.js';
import { appendAcceptedStatsReceipt, normalizeStatsEventReceipts } from './statsEventReceipts.js';
import { advanceNativeMacroEconomyClock } from './statsNativeEconomyClock.js';

const CRISIS = 'global-financial-collapse-2127';
const evidence = 'Amsterdam merchant settlement networks report defaults and halted interbank clearing affecting local output.';
const estimate = (overrides = {}) => ({basis:'simulation-estimate', channel:'credit', exposure:'direct', evidence, ...overrides});
const effect = (overrides = {}) => ({sourceStorylineId:CRISIS, economicShockEstimate:estimate(), annualRealGrowthDelta:-8,
  durationDays:60, gdpCause:'trade', reason:'Credit freeze constrains production through disrupted trade settlements', ...overrides});
const world = () => ({
  ownerCodes:['Dyke-and-Rook League','Forest Hold'],
  countryStats:Object.fromEntries(['Dyke-and-Rook League','Forest Hold'].map((polity) => [polity,mergeCountryStatPatch(null,{
    territorialComponents:[{geography:polity,group:'core',population:1_000_000,gdpPerCapita:10_000}],
    economy:{gdpGrowth:2,inflation:3,unemployment:5,publicDebt:45,budgetBalance:-1},
    continuity:{assessedDate:'2127-07-21'},
  })])),
  storylines:[{id:CRISIS,status:'active',participants:['Dyke-and-Rook League']}],
  statsEventReceipts:[],
});
const apply = (base, eff, id='event-collapse') => {
  const polity='Dyke-and-Rook League', date='2127-07-25', before=base.countryStats[polity];
  const planned=planStatsEventEffect({sheet:before,effect:eff,eventId:id,eventDate:date,
    polity,storylines:base.storylines,eventStorylineIds:[CRISIS],receipts:base.statsEventReceipts});
  const after=mergeCountryStatPatch(before,planned.patch,{continuity:{accountedEventIds:[id]}});
  const next={...base,countryStats:{...base.countryStats,[polity]:after},statsEventReceipts:base.statsEventReceipts.slice()};
  appendAcceptedStatsReceipt(next,{eventId:id,polity,date,before,after,reason:planned.reason,
    process:planned.process,sourceStorylineId:planned.sourceStorylineId});
  return next;
};

test('only bounded transparent, source-linked crisis estimates enter canonical continuity',()=>{
  const raw=world(), got=apply(raw,effect());
  const influence=got.countryStats['Dyke-and-Rook League'].continuity.economicInfluences[0];
  assert.deepEqual(influence.economicShockEstimate,estimate());
  assert.deepEqual(normalizeCountryStatEconomicInfluences([influence])[0].economicShockEstimate,estimate());
  assert.deepEqual(got.statsEventReceipts[0].process.economicShockEstimate,estimate());
  assert.deepEqual(normalizeStatsEventReceipts(got.statsEventReceipts)[0].process.economicShockEstimate,estimate());
  assert.equal(got.countryStats['Dyke-and-Rook League'].economy.gdp,raw.countryStats['Dyke-and-Rook League'].economy.gdp);
  assert.equal(got.statsEventReceipts.length,1);
  assert.throws(()=>apply(got,effect(), 'another-collapse'),/stack|active estimated/i);
  assert.throws(()=>apply(got,effect(), 'event-collapse'),/accounted/i);
});

test('estimates cannot disguise fabricated sources, unbounded effects or unsupported stock writes',()=>{
  const source=world();
  for(const invalid of [
    effect({sourceStorylineId:'invented'}),
    effect({economicShockEstimate:estimate({basis:'historically-measured'})}),
    effect({economicShockEstimate:estimate({exposure:'dependent'}),annualRealGrowthDelta:-8}),
    effect({economicShockEstimate:estimate({channel:'production'})}),
    effect({economicShockEstimate:estimate({evidence:'vague'})}),
    effect({economicShockEstimate:estimate({unknown:1})}),
    effect({durationDays:91}),effect({annualRealGrowthDelta:4}),
    effect({gdpChangePercent:-5}), effect({stabilityDelta:-5}),
    effect({economicShockEstimate:null}),
  ]) assert.throws(()=>apply(source,invalid),undefined,JSON.stringify(invalid));
  const unlinked={...source,storylines:[{...source.storylines[0],participants:['Forest Hold']}]};
  assert.throws(()=>apply(unlinked,effect()),/storyline|participant/i);
  const resolved={...source,storylines:[{...source.storylines[0],status:'resolved'}]};
  assert.throws(()=>apply(resolved,effect()),/storyline/i);
  const wrongEvent=effect();
  assert.throws(()=>planStatsEventEffect({sheet:source.countryStats['Dyke-and-Rook League'],effect:wrongEvent,
    eventId:'x',eventDate:'2127-07-25',polity:'Dyke-and-Rook League',storylines:source.storylines,eventStorylineIds:[]}),/storyline/i);
  assert.equal(normalizeStatsCrisisEstimate({basis:'simulation-estimate',channel:'credit',exposure:'direct',evidence:''}),null);
});

test('a modeled collapse affects only assessed countries; native long and partitioned clocks agree',()=>{
  const before=world(), modified=apply(before,effect());
  const pristine=advanceNativeMacroEconomyClock(before,{baselineWorld:before,fromDate:'2127-07-25',toDate:'2127-10-19'});
  const long=advanceNativeMacroEconomyClock(modified,{baselineWorld:modified,fromDate:'2127-07-25',toDate:'2127-10-19'});
  let split=modified;
  for (const [fromDate,toDate] of [['2127-07-25','2127-07-31'],['2127-07-31','2127-08-31'],['2127-08-31','2127-09-30'],['2127-09-30','2127-10-19']]) {
    split=advanceNativeMacroEconomyClock(split,{baselineWorld:split,fromDate,toDate});
  }
  const country='Dyke-and-Rook League',other='Forest Hold';
  assert.ok(long.countryStats[country].economy.gdp < pristine.countryStats[country].economy.gdp);
  assert.equal(long.countryStats[other].economy.gdp,pristine.countryStats[other].economy.gdp);
  assert.equal(long.countryStats[country].economy.gdp,split.countryStats[country].economy.gdp);
  assert.equal(long.countryStats[country].economy.unemployment,split.countryStats[country].economy.unemployment);
  assert.deepEqual(long.countryStats[country].continuity.economicInfluences,
    split.countryStats[country].continuity.economicInfluences);
});
