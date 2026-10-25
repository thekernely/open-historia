import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEventImpactsToWorld, normalizeWorldState } from './gameState.js';
import { mergeCountryStatPatch } from './countryStats.js';
import { forcesFunding, treasuryFactor } from './militaryFunding.js';
const committed=()=>({id:'shipyard-1',polity:'Alba',projectId:'fleet-program',milestoneId:'hull-1',
  authorizedAt:'1912-01-01',amountGdpEquivalent:80_000_000,authority:'scenario',
  financing:'debt',budgetTreatment:'incremental'});
const initial=()=>({
  polityOverrides:{Alba:{code:'Alba',name:'Alba'}},
  countryStats:{Alba:mergeCountryStatPatch(null, {territorialComponents:[{
    geography:'Alba',group:'core',population:2_000_000,gdpPerCapita:10_000,
  }],economy:{publicDebt:80,budgetBalance:-2}})},
  projects:[{id:'fleet-program',name:'Fleet expansion',ownerCode:'Alba',status:'active',
    milestones:[{id:'hull-1',title:'Delivered hull',status:'pending',date:'1912-02-01'}]}],
  militaryExpenditureCommitments:[committed()],
});
const delivered=(date='1912-02-01')=>({id:'delivery-1',date,title:'Naval yard accepts hull',
  impacts:{projectOps:[{op:'milestone',projectId:'fleet-program',milestone:{id:'hull-1',title:'Delivered hull',status:'done'}}]}});

test('accepted, priced military delivery settles dated debt, receipt and funding in the actual world applier',()=>{
  const starting=initial();
  const outcome=applyEventImpactsToWorld({world:starting,events:[delivered()]}).world;
  assert.equal(outcome.projects[0].milestones[0].status,'done');
  assert.equal(outcome.countryStats.Alba.economy.publicDebt,80.4);
  assert.equal(outcome.countryStats.Alba.economy.budgetBalance,-2);
  assert.equal(outcome.countryStats.Alba.economy.gdp,starting.countryStats.Alba.economy.gdp);
  assert.ok(treasuryFactor(outcome.countryStats.Alba)<treasuryFactor(starting.countryStats.Alba));
  assert.equal(outcome.statsEventReceipts.length,1);
  assert.equal(outcome.statsEventReceipts[0].eventId,'military-payment:shipyard-1');
  assert.equal(outcome.militaryExpenditureCommitments[0].paidEventId,'delivery-1');
  assert.deepEqual(normalizeWorldState(outcome).militaryExpenditureCommitments,outcome.militaryExpenditureCommitments);
  const replay=applyEventImpactsToWorld({world:outcome,events:[delivered()]}).world;
  assert.equal(replay.countryStats.Alba.economy.publicDebt,80.4);
  assert.equal(replay.statsEventReceipts.length,1);
  assert.equal(starting.countryStats.Alba.economy.publicDebt,80);
  const rating={spending:75};
  assert.equal(forcesFunding({sheet:outcome.countryStats.Alba,military:rating}),
    forcesFunding({sheet:starting.countryStats.Alba,military:rating}));
});

test('cancelled military project, wrong milestone or missing authority cannot book a cost',()=>{
  const source=initial();
  const cancelled=applyEventImpactsToWorld({world:source,events:[{id:'cancel',date:'1912-02-01',title:'Cancellation',
    impacts:{projectOps:[{op:'cancel',projectId:'fleet-program'}]}}]}).world;
  assert.equal(cancelled.countryStats.Alba.economy.publicDebt,80);
  assert.equal(cancelled.militaryExpenditureCommitments[0].paidAt,undefined);
  const wrong={...delivered(),impacts:{projectOps:[{op:'milestone',projectId:'fleet-program',milestone:{id:'other',title:'Other',status:'done'}}]}};
  const after=applyEventImpactsToWorld({world:source,events:[wrong]}).world;
  assert.equal(after.countryStats.Alba.economy.publicDebt,80);
  assert.equal(after.statsEventReceipts.length,0);
  const absent=initial(); absent.militaryExpenditureCommitments=[];
  const noCost=applyEventImpactsToWorld({world:absent,events:[delivered()]}).world;
  assert.equal(noCost.countryStats.Alba.economy.publicDebt,80);
});

test('a second direct borrowing effect on one delivery fails closed rather than charging twice',()=>{
  const duplicate={...delivered(),impacts:{...delivered().impacts,polityChanges:[{
    operation:'update',code:'Alba',statsEffects:{debtFinancedOutlayPercentGdp:.4,
      debtFinancedOutlayCause:'procurement',reason:'This is the same hull'}
  }]}};
  assert.throws(()=>applyEventImpactsToWorld({world:initial(),events:[duplicate]}),/conflicts/);
});

test('one long progression and two shorter ones book the delivery once against the same dated fiscal accrual',async()=>{
  const {advanceNativeFiscalClock}=await import('./statsFiscalClock.js');
  const source=initial();
  source.ownerCodes=['Alba'];
  source.countryStats.Alba=mergeCountryStatPatch(source.countryStats.Alba,{
    continuity:{assessedDate:'1912-01-01'},
  });
  // Both paths advance the existing fiscal clock through the exact event date
  // before applying the delivery, then accrue the remaining interval.
  const through=(before,from,to,baseline=before)=>advanceNativeFiscalClock(before,{fromDate:from,toDate:to,baselineWorld:baseline});
  const first=through(source,'1912-01-01','1912-02-01');
  const deliveredWorld=applyEventImpactsToWorld({world:first,events:[delivered()]}).world;
  const long=through(deliveredWorld,'1912-02-01','1912-04-01',deliveredWorld);
  const reloaded=normalizeWorldState(first);
  const split1=applyEventImpactsToWorld({world:reloaded,events:[delivered()]}).world;
  const split2=through(split1,'1912-02-01','1912-03-01',split1);
  const split3=through(split2,'1912-03-01','1912-04-01',split2);
  assert.ok(Math.abs(long.countryStats.Alba.economy.publicDebt-split3.countryStats.Alba.economy.publicDebt)<=0.0001);
  assert.equal(long.militaryExpenditureCommitments[0].paidEventId,'delivery-1');
  assert.equal(split3.militaryExpenditureCommitments[0].paidEventId,'delivery-1');
  assert.equal(split3.statsEventReceipts.length,1);
});

test('an invalid scenario funding authorization fails on world load instead of vanishing',()=>{
  const source=initial();
  source.militaryExpenditureCommitments[0].budgetTreatment='included';
  assert.throws(()=>normalizeWorldState(source),/scenario-authorized military expenditure/);
  assert.equal(source.countryStats.Alba.economy.publicDebt,80);
});
