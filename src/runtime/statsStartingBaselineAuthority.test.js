/*! Open Historia — scenario-approved starting Stats must not trigger AI recalibration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewedScenarioStatsSheet, applyScenarioStatsManualEdits, scenarioStatsEditorValues } from './scenarioStatsAuthoring.js';
import { normalizeCountryStatSheet, normalizeCountryStatContinuity } from './countryStats.js';
import { isReviewedStartingBaseline, needsLegacyComponentCapAudit, needsStartPopulationCalibrationAudit } from './statsStartingBaselineAuthority.js';

const atStart={startDate:'1912-01-01',date:'1912-01-01',round:1};
const row={
 capital:'Riga',continent:'Europe',government:'Republic',leader:'Prime Minister',stability:70,
 indices:{sovereignty:75,foodAutonomy:60,energyAutonomy:60,economicIndependence:70,internalSecurity:75,internationalReputation:65},
 macro:[{index:1,group:'core',population:90000,gdpPerCapita:1000}],
 gdpGrowth:2,inflation:3,unemployment:4,publicDebt:40,budgetBalance:-1,currency:'EUR',
 agriculture:30,industry:30,services:40,
 birthRate:30,deathRate:15,birthTrendPerYear:-0.1,deathTrendPerYear:-0.1,
};
const basis={plan:[{geography:'Riga'}],macroPlan:[{index:1,members:[{geography:'Riga',weight:1}]}]};
const accepted=(input=row)=>createReviewedScenarioStatsSheet({row:input,basis,date:atStart.startDate});

test('author-reviewed complete mapped baseline loads at start without old migration, with or without demographics',()=>{
 for (const demographic of [true,false]) {
  const proposal={...row};
  if (!demographic) for (const field of ['birthRate','deathRate','birthTrendPerYear','deathTrendPerYear']) delete proposal[field];
  const sheet=accepted(proposal);
  assert.deepEqual(sheet.continuity.scenarioBaseline, {version:1,source:'scenario-author-reviewed',date:'1912-01-01'});
  assert.equal(isReviewedStartingBaseline(sheet,atStart),true);
  assert.equal(needsStartPopulationCalibrationAudit(sheet,atStart),false);
  assert.equal(needsLegacyComponentCapAudit(sheet),false);
  const saved=normalizeCountryStatSheet(JSON.parse(JSON.stringify(sheet)));
  assert.equal(isReviewedStartingBaseline(saved,atStart),true,'native save/reload preserves approval');
 }
});

test('1912 pre-provenance scenario with accepted dated demographic evolution is still trusted',()=>{
 const sheet=accepted();
 const prior=normalizeCountryStatSheet({...sheet,continuity:{assessedDate:'1912-01-01',demographicEvolution:sheet.continuity.demographicEvolution}});
 assert.equal(prior.continuity.scenarioBaseline,undefined);
 assert.equal(isReviewedStartingBaseline(prior,atStart),true);
 assert.equal(needsStartPopulationCalibrationAudit(prior,atStart),false);
 const invalid={...prior,continuity:{...prior.continuity,demographicEvolution:{...prior.continuity.demographicEvolution,basePopulation:42}}};
 assert.equal(isReviewedStartingBaseline(invalid,atStart),false);
 assert.equal(needsStartPopulationCalibrationAudit(invalid,atStart),true);
 assert.equal(needsStartPopulationCalibrationAudit(prior,{...atStart,startDate:'1913-01-01',date:'1913-01-01'}),true);
});

test('old unmarked complete sheets still request calibration at start, never mid-campaign',()=>{
 const sheet=accepted();
 const old=normalizeCountryStatSheet({...sheet,continuity:{assessedDate:'1912-01-01'}});
 assert.equal(isReviewedStartingBaseline(old,atStart),false);
 assert.equal(needsStartPopulationCalibrationAudit(old,atStart),true);
 assert.equal(needsStartPopulationCalibrationAudit(old,{...atStart,round:2,date:'1912-02-01'}),false);
 assert.equal(needsStartPopulationCalibrationAudit(old,{...atStart,round:2}),false);
 assert.equal(needsStartPopulationCalibrationAudit(old,{...atStart,round:1,date:'1912-02-01'}),false);
});

test('legacy truncated 64-component ambiguity is never bypassed by scenario marker',()=>{
 const sheet=accepted();
 const rows=Array.from({length:64},(_,i)=>({...sheet.territorialComponents[0],geography:`Province ${i+1}`}));
 const marked={...sheet,territorialComponents:rows};
 assert.equal(needsLegacyComponentCapAudit(marked),true);
 assert.equal(needsLegacyComponentCapAudit({...marked,continuity:{...marked.continuity,populationCalibrationVersion:2}}),false);
});

test('unknown/invalid approval metadata fails native continuity, never becomes trusted authorization',()=>{
 const sheet=accepted();
 for (const bad of [{version:2,source:'scenario-author-reviewed',date:'1912-01-01'},
 {version:1,source:'ai-estimate',date:'1912-01-01'},
 {version:1,source:'scenario-author-reviewed',date:'tomorrow'},
 {version:1,source:'scenario-author-reviewed',date:'1912-01-01',forged:true}]) {
  assert.equal(normalizeCountryStatContinuity({...sheet.continuity,scenarioBaseline:bad}).scenarioBaseline,undefined);
  assert.equal(isReviewedStartingBaseline({...sheet,continuity:{...sheet.continuity,scenarioBaseline:bad,demographicEvolution:undefined}},atStart),false);
 }
});

test('manual edits keep author approval after validation; no extra AI authority or values added',()=>{
 const original=accepted();
 const changed=applyScenarioStatsManualEdits({sheet:original,edits:{...scenarioStatsEditorValues(original),gdpGrowth:3},date:'1912-01-01'});
 assert.equal(changed.continuity.scenarioBaseline.source,'scenario-author-reviewed');
 assert.equal(changed.economy.gdpGrowth,3);
 assert.equal(changed.population.total,original.population.total);
});
