import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMilitaryExpenditureCommitments, settleMilitaryMilestonePayments } from './militaryExpenditureCommitments.js';
import { mergeCountryStatPatch } from './countryStats.js';
import { treasuryFactor, forcesFunding, militaryFunding } from './militaryFunding.js';

const obligation = () => ({ id:'shipyard-1', polity:'Alba', projectId:'fleet-program', milestoneId:'hull-1',
  authorizedAt:'1912-01-01', amountGdpEquivalent:80_000_000,
  financing:'debt', budgetTreatment:'incremental', authority:'scenario' });
const sheet = () => mergeCountryStatPatch(null,{territorialComponents:[
  {geography:'Alba',group:'core',population:2_000_000,gdpPerCapita:10_000}],
  economy:{publicDebt:80,budgetBalance:-2}});
const project = (status) => ({id:'fleet-program',name:'Fleet expansion',kind:'project',ownerCode:'Alba',status:'active',
  milestones:[{id:'hull-1',title:'Hull accepted',status,repeat:''}]});
const state = (status, commitment=obligation())=>({projects:[project(status)],militaryExpenditureCommitments:[commitment],
  countryStats:{Alba:sheet()},statsEventReceipts:[]});
const settle=(old,newer,date='1912-02-01')=>settleMilitaryMilestonePayments(old,newer,{eventId:'delivery-1',date});

test('a pre-priced delivered hull books once against public debt and preserves baseline fiscal flow',()=>{
  const prior=state('pending'); const arrival=state('done');
  const next=settle(prior,arrival);
  assert.equal(next.countryStats.Alba.economy.publicDebt,80.4);
  assert.equal(next.countryStats.Alba.economy.gdp,prior.countryStats.Alba.economy.gdp);
  assert.equal(next.countryStats.Alba.economy.budgetBalance,-2);
  assert.equal(next.statsEventReceipts.length,1);
  assert.equal(next.statsEventReceipts[0].changes[0].metric,'economy.publicDebt');
  assert.equal(next.militaryExpenditureCommitments[0].paidEventId,'delivery-1');
  assert.equal(next.militaryExpenditureCommitments[0].debtRatioPoints,.4);
  assert.ok(treasuryFactor(next.countryStats.Alba)<treasuryFactor(prior.countryStats.Alba));
  assert.ok(militaryFunding(next.countryStats.Alba)<militaryFunding(prior.countryStats.Alba));
  assert.equal(forcesFunding({sheet:next.countryStats.Alba,military:{spending:75}}),
    forcesFunding({sheet:prior.countryStats.Alba,military:{spending:75}}),
    'pre-existing independently assessed military spending is not silently re-rated');
  assert.equal(prior.militaryExpenditureCommitments[0].paidAt,undefined);
  assert.equal(arrival.militaryExpenditureCommitments[0].paidAt,undefined);
  assert.equal(settle(next,next),next,'no delivered transition, no repeated payment');
});

test('a completed historical milestone and an unfinished delivery never authorize late or early payment',()=>{
  const unchanged=state('pending');
  assert.equal(settle(unchanged,unchanged),unchanged);
  const already=state('done');
  assert.equal(settle(already,already),already);
});

test('malformed, duplicated, unauthorized or already paid commitments fail closed',()=>{
  for(const changed of [
    {authority:'model'}, {budgetTreatment:'included'}, {financing:'unknown'},
    {amountGdpEquivalent:0},{amountGdpEquivalent:2e12},{amountGdpEquivalent:'80000000'},
    {authorizedAt:'1912-99-11'}, {paidAt:'1912-02-01'}, {paidAt:'1912-02-01',paidEventId:'delivery-1',debtRatioPoints:'.4'},
    {unknown:1},
  ]) assert.throws(()=>normalizeMilitaryExpenditureCommitments([{...obligation(),...changed}]), /commitment/);
  assert.throws(()=>normalizeMilitaryExpenditureCommitments([obligation(),{...obligation(),id:'shipyard-2'}]),/Duplicate/);
  assert.throws(()=>normalizeMilitaryExpenditureCommitments({}),/ledger/);
});

test('payment requires its matching country, authorization date and measurable bounded fiscal balance',()=>{
  for (const changed of [
    {polity:'Borealia'},{authorizedAt:'1913-01-01'},
    {amountGdpEquivalent:2_000_000_000},
  ]) assert.throws(()=>settle(state('pending',{...obligation(),...changed}),
    state('done',{...obligation(),...changed})), /authorized|GDP\/debt/);
  const zero=state('done'); delete zero.countryStats.Alba.economy.publicDebt;
  assert.throws(()=>settle(state('pending'),zero),/GDP\/debt/);
});
