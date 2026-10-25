import test from 'node:test';
import assert from 'node:assert/strict';
import { renamePolityInWorld } from './polityRename.js';
import { applyEventImpactsToWorld, normalizeWorldState } from '../src/runtime/gameState.js';
import { mergeCountryStatPatch } from '../src/runtime/countryStats.js';

const country = 'Borduria';
const renamedCountry = 'Bordurian Republic';
const commitment = () => ({
  id:'bordurian-hull-1',polity:country,projectId:'bordurian-fleet',milestoneId:'hull-1',
  authorizedAt:'1912-01-01',amountGdpEquivalent:80_000_000,authority:'scenario',
  financing:'debt',budgetTreatment:'incremental',
});
const world = () => normalizeWorldState({
  polityOverrides: {[country]: {code:country,name:country}},
  countryStats:{[country]:mergeCountryStatPatch(null,{territorialComponents:[{
    geography:country,group:'core',population:2_000_000,gdpPerCapita:10_000,
  }],economy:{publicDebt:80,budgetBalance:-2}})},
  projects:[{id:'bordurian-fleet',name:'Bordurian Fleet',ownerCode:country,status:'active',
    milestones:[{id:'hull-1',title:'Hull accepted',status:'pending',date:'1912-02-01'}]}],
  militaryExpenditureCommitments:[commitment()],
});
const delivery = () => ({id:'deliver-hull-1',date:'1912-02-01',title:'Hull accepted',
  impacts:{projectOps:[{op:'milestone',projectId:'bordurian-fleet',milestone:{id:'hull-1',title:'Hull accepted',status:'done'}}]}});

test('renaming a country re-keys a pending scenario-priced commitment and delivers it once',()=>{
  const before=world();
  const newWorld=normalizeWorldState(renamePolityInWorld(before,country,renamedCountry).world);
  assert.equal(newWorld.militaryExpenditureCommitments[0].polity,renamedCountry);
  assert.equal(newWorld.projects[0].ownerCode,renamedCountry);
  assert.equal(Object.hasOwn(newWorld.countryStats,country),false);
  const result=applyEventImpactsToWorld({world:newWorld,events:[delivery()]}).world;
  assert.equal(result.countryStats[renamedCountry].economy.publicDebt,80.4);
  assert.equal(result.militaryExpenditureCommitments[0].paidEventId,'deliver-hull-1');
  const saved=normalizeWorldState(JSON.parse(JSON.stringify(result)));
  const replay=applyEventImpactsToWorld({world:saved,events:[delivery()]}).world;
  assert.equal(replay.countryStats[renamedCountry].economy.publicDebt,80.4);
  assert.equal(replay.militaryExpenditureCommitments[0].paidEventId,'deliver-hull-1');
  assert.equal(replay.statsEventReceipts.length,1);
});

test('renaming an already settled commitment retains payment identity and prevents re-charging',()=>{
  const paid=applyEventImpactsToWorld({world:world(),events:[delivery()]}).world;
  const renamed=normalizeWorldState(renamePolityInWorld(paid,country,renamedCountry).world);
  assert.equal(renamed.militaryExpenditureCommitments[0].polity,renamedCountry);
  assert.equal(renamed.militaryExpenditureCommitments[0].paidEventId,'deliver-hull-1');
  const replay=applyEventImpactsToWorld({world:renamed,events:[delivery()]}).world;
  assert.equal(replay.countryStats[renamedCountry].economy.publicDebt,80.4);
  assert.equal(replay.statsEventReceipts.length,paid.statsEventReceipts.length);
});
