import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveEconomicInfluenceContext } from './statsEconomicInfluenceContext.js';
const influence = (eventId, details={}) => ({eventId, startDate:'1912-01-15', endDate:'1912-06-01',
  annualRealGrowthDelta:-4, cause:'production', reason:'Observed port strike', ...details});

test('briefing exposes only unresolved, dated canonical event IDs, with a hard cap', () => {
  const world={countryStats:{A:{continuity:{economicInfluences:[influence('strike'),
    influence('resolved',{resolvedDate:'1912-02-01', resolvedByEventId:'reopening'}),
    influence('expired',{endDate:'1912-02-01'})]}},B:{continuity:{economicInfluences:[influence('flood')]}}}};
  const context=buildActiveEconomicInfluenceContext(world,'1912-02-20',{maxRows:1});
  assert.match(context, /sourceEventId="strike"|sourceEventId="flood"/);
  assert.match(context, /1 of 2/);
  assert.doesNotMatch(context, /sourceEventId="resolved"|sourceEventId="expired"/);
  assert.equal(buildActiveEconomicInfluenceContext(world,'not-a-date'), '');
  assert.equal(buildActiveEconomicInfluenceContext({countryStats:{}},'1912-02-20'),'');
});

test('recovery briefing lists bounded outstanding canonical loss identities, not exhausted ones', async () => {
  const { buildRecoverableStatsLossContext } = await import('./statsEconomicInfluenceContext.js');
  const receipts = [
    {eventId:'damage',polity:'A',date:'1912-01-01',reason:'Damage',changes:[
      {metric:'stability',before:50,after:45},
      {metric:'indices.foodAutonomy',before:80,after:70},
      {metric:'economy.gdp',before:100,after:80},
    ]},
    {eventId:'partial',polity:'A',date:'1912-02-02',recoversEventId:'damage',changes:[
      {metric:'stability',before:45,after:50},
      {metric:'indices.foodAutonomy',before:70,after:74},
    ]},
    {eventId:'outsider',polity:'B',date:'1912-01-01',reason:'Damage',changes:[
      {metric:'stability',before:50,after:45},
    ]},
  ];
  const context=buildRecoverableStatsLossContext({countryStats:{A:{}},statsEventReceipts:receipts},'1912-02-20');
  assert.match(context,/sourceEventId="damage"/);
  assert.match(context,/indices.foodAutonomy":6/);
  assert.doesNotMatch(context,/"stability":5|economy.gdp|outsider/);
  assert.equal(buildRecoverableStatsLossContext({countryStats:{A:{}},statsEventReceipts:receipts},'1912-01-01'),'');
  assert.equal(buildRecoverableStatsLossContext({countryStats:{A:{}},statsEventReceipts:[]},'1912-02-20'),'');
});

test('ongoing crisis briefing does not silently represent an estimated pressure as measured',()=>{
  const context=buildActiveEconomicInfluenceContext({countryStats:{Alba:{continuity:{economicInfluences:[{
    eventId:'shock',startDate:'1912-01-15',endDate:'1912-03-01',annualRealGrowthDelta:-4,
    cause:'trade',reason:'Inferred disruption',sourceStorylineId:'credit-crisis',economicShockEstimate:{
      basis:'simulation-estimate',channel:'credit',exposure:'dependent',
      evidence:'Local merchant banks hold claims on the affected external clearing network',
    },
  }]}}}},'1912-02-01');
  assert.match(context,/numericalAuthority=simulation-estimate/);
  assert.match(context,/sourceStorylineId="credit-crisis"/);
});
