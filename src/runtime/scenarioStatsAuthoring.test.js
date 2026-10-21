/*! Open Historia — reviewed scenario Statistics authoring, no provider/network dependency. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyScenarioStatsManualEdits, authorApprovedMacroEstimates,
  createReviewedScenarioStatsSheet, scenarioStatsCoverage,
  scenarioStatsEditorValues, scenarioStatsRequiredReady,
} from './scenarioStatsAuthoring.js';
import { normalizeCountryStatSheet, normalizeCountryStatDemographicEvolution } from './countryStats.js';
import { advanceNativeDemographicClock } from './statsDemographicClock.js';
import { TEMPLATE_WORLD_OVERRIDE_KEYS } from './web/storeConstants.js';

const basis = {
  context:'Synthetic native plan derived from scenario region map',
  plan:[{ geography:'Riga' },{ geography:'Kurzeme' },{ geography:'Latgale' }],
  macroPlan:[
    {index:1,members:[{geography:'Riga',weight:5},{geography:'Kurzeme',weight:3}]},
    {index:2,members:[{geography:'Latgale',weight:2}]},
  ],
};
const proposed = ({ date='2026-01-01', ...overrides }={}) => ({
  capital:'Riga',continent:'Europe',government:'Parliamentary republic',leader:'Scenario leader',stability:75,
  indices:{ sovereignty:88, foodAutonomy:60, energyAutonomy:55, economicIndependence:70, internalSecurity:78, internationalReputation:82 },
  macro:[{index:1,group:'core',population:1200000,gdpPerCapita:25000},
    {index:2,group:'core',population:600000,gdpPerCapita:16000}],
  gdpGrowth:1.2,inflation:2.4,unemployment:6.5,publicDebt:45,budgetBalance:-2,currency:'EUR',
  agriculture:3,industry:24,services:73,
  birthRate:7,deathRate:14,birthTrendPerYear:0.05,deathTrendPerYear:-0.03,
  ...overrides,
});
const sheet = (overrides={}, options={}) => createReviewedScenarioStatsSheet({
  row:proposed(overrides),basis,date:'2026-01-01',...options,
});
const plain = x => JSON.parse(JSON.stringify(x));

test('a map-backed reviewed proposal is a truly complete native sheet, not just a number display',()=>{
  const result=sheet();
  assert.equal(result.statsSchemaVersion,1);
  assert.equal(result.population.total,1800000);
  assert.deepEqual(result.territorialComponents.map(e=>e.geography).sort(),['Kurzeme','Latgale','Riga']);
  assert.ok(result.economy.gdp>0);
  assert.equal(scenarioStatsRequiredReady(result),true);
  // Scenario-authored continuity is a native world record, not an AI countryStatSheet response.
  // The latter has a separate closed wire schema and must not be loosened for this UI.
  assert.deepEqual(normalizeCountryStatDemographicEvolution(result.continuity.demographicEvolution), result.continuity.demographicEvolution);
  assert.equal(result.continuity.demographicEvolution.birthRate,7);
  assert.equal(result.continuity.demographicEvolution.deathRate,14);
  assert.equal(result.continuity.demographicEvolution.sourceDate,'2026-01-01');
  assert.equal(result.continuity.demographicEvolution.basePopulation,result.population.total);
});

test('the calendar never invents 1913 birth rates for 2026 or vice versa',()=>{
  const modern=sheet();
  const early=createReviewedScenarioStatsSheet({row:proposed({birthRate:25,deathRate:15,birthTrendPerYear:-0.1,deathTrendPerYear:-0.08}),basis,date:'1913-01-01'});
  assert.equal(early.continuity.demographicEvolution.birthRate,25);
  assert.equal(modern.continuity.demographicEvolution.birthRate,7);
  assert.equal(modern.continuity.demographicEvolution.endDate,'2076-01-01');
  assert.equal(early.continuity.demographicEvolution.sourceDate,'1913-01-01');
  const noRates=proposed();
  for (const key of ['birthRate','deathRate','birthTrendPerYear','deathTrendPerYear']) delete noRates[key];
  const withoutRates=createReviewedScenarioStatsSheet({row:noRates,basis,date:'2026-01-01'});
  assert.equal(withoutRates.continuity?.demographicEvolution,undefined);
});

test('malformed generation is fail-closed rather than fabricating provinces or importing alien buckets',()=>{
  assert.throws(()=>sheet({macro:[]}),/Expected 2/);
  assert.throws(()=>sheet({macro:[{index:1,group:'core',population:1,gdpPerCapita:1},{index:1,group:'core',population:1,gdpPerCapita:1}]}),/duplicated/);
  assert.throws(()=>sheet({macro:[{index:1,group:'core',population:1,gdpPerCapita:1},{index:9,group:'core',population:1,gdpPerCapita:1}]}),/outside/);
  assert.throws(()=>createReviewedScenarioStatsSheet({row:proposed(),basis:{plan:[],macroPlan:[]},date:'2026-01-01'}),/no authoritative mapped/);
  assert.throws(()=>sheet({birthRate:7,deathRate:undefined}),/Death rate/);
  assert.throws(()=>sheet({agriculture:10,industry:10,services:10}),/exactly 100/);
});

test('uninhabited native regional buckets are valid; negative, fractional and entirely empty populations fail closed',()=>{
  // The live British/French errors do not include raw rejected bucket values.
  // Zero-population territory is supported by the native expansion contract.
  const withEmpty=proposed({macro:[
    {index:1,group:'core',population:1200000,gdpPerCapita:25000},
    {index:2,group:'overseas/dependent',population:0,gdpPerCapita:0},
  ]});
  const generated=createReviewedScenarioStatsSheet({row:withEmpty,basis,date:'2026-01-01'});
  assert.equal(generated.population.total,1200000);
  assert.equal(generated.territorialComponents.find((entry)=>entry.geography==='Latgale').population,0);
  assert.equal(generated.territorialComponents.find((entry)=>entry.geography==='Latgale').gdpPerCapita,1);
  assert.equal(scenarioStatsRequiredReady(generated),true);
  for (const population of [-1,2.5,'0',null]) {
    assert.throws(()=>sheet({macro:[proposed().macro[0],{index:2,group:'core',population,gdpPerCapita:500}]}),/nonnegative whole number/);
  }
  assert.throws(()=>sheet({macro:[
    {index:1,group:'core',population:0,gdpPerCapita:0},
    {index:2,group:'core',population:0,gdpPerCapita:0},
  ]}),/Total proposed territorial population must be a positive whole number/);
});

test('British Empire-like 12-bucket input can contain an empty outlying bucket without inventing people',()=>{
  const many={plan:[],macroPlan:[]};
  const macro=[];
  for(let index=1;index<=12;index++){
    const member={geography:`Mapped province ${index}`,weight:1};
    many.plan.push(member);
    many.macroPlan.push({index,members:[member]});
    macro.push({index,group:'integrated',population:index===12?0:1000,gdpPerCapita:index===12?0:500});
  }
  const result=createReviewedScenarioStatsSheet({row:{macro,customStats:{grain:500},publicDebt:0,budgetBalance:0},basis:many,date:'1912-01-01',customKeys:['grain']});
  assert.equal(result.population.total,11000);
  assert.equal(result.territorialComponents.length,12);
  assert.equal(result.territorialComponents.at(-1).population,0);
  assert.equal(result.territorialComponents.reduce((sum,entry)=>sum+entry.population,0),11000);
});

test('AI filling missing fields keeps a previous author-entered territorial ledger and macro totals',()=>{
  const authored=normalizeCountryStatSheet({
    territorialComponents:[
      {geography:'Riga',group:'core',population:1000000,gdpPerCapita:30000},
      {geography:'Kurzeme',group:'core',population:500000,gdpPerCapita:18000},
      {geography:'Latgale',group:'core',population:200000,gdpPerCapita:12000},
    ],
    economy:{gdpGrowth:4,unemployment:5,currency:'LVL',publicDebt:20},
    capital:'Author capital',
    customStats:{grain:300},
  });
  const result=sheet({capital:'AI capital',gdpGrowth:0.5}, {existing:authored});
  assert.equal(result.capital,'Author capital');
  assert.equal(result.economy.gdpGrowth,4);
  assert.equal(result.economy.currency,'LVL');
  assert.equal(result.population.total,1700000);
  assert.deepEqual(result.territorialComponents,authored.territorialComponents);
  assert.equal(result.customStats.grain,300);
  assert.equal(scenarioStatsRequiredReady(result),true);
});

test('an old authored fixed demographic plan wins over a new AI demographic proposal',()=>{
  const existing=normalizeCountryStatSheet({
    territorialComponents:[{geography:'Riga',group:'core',population:1000000,gdpPerCapita:1000},
      {geography:'Kurzeme',group:'core',population:500000,gdpPerCapita:1000},
      {geography:'Latgale',group:'core',population:500000,gdpPerCapita:1000}],
    continuity:{demographicClock:{sourceDate:'2026-01-01',lastDate:'2026-01-01',endDate:'2027-01-01',
      basePopulation:2000000,birthsPerThousand:13,deathsPerThousand:9,creditedBirths:0,creditedDeaths:0}},
  });
  const result=sheet({}, {existing});
  assert.ok(result.continuity.demographicClock);
  assert.equal(result.continuity.demographicEvolution,undefined);
});

test('an existing ledger referring to deleted or annexed geography is not silently replaced',()=>{
  const old=normalizeCountryStatSheet({territorialComponents:[{geography:'Old province',group:'core',population:1000000,gdpPerCapita:10000}]});
  assert.throws(()=>sheet({}, {existing:old}),/no longer matches the scenario map/);
});

test('scenario coverage distinguishes missing/incomplete/ready countries and custom-sheet requirements',()=>{
  const ready=sheet();
  const world={ownerCodes:['Latvia','Estonia','Lithuania'],countryStats:{Latvia:ready,Estonia:{population:{total:100}}}};
  const options=[{code:'Latvia',name:'Latvia'},{code:'Estonia',name:'Estonia'},{code:'Lithuania',name:'Lithuania'}];
  assert.deepEqual(scenarioStatsCoverage(world,options).map(({status})=>status),['ready','incomplete','missing']);
  assert.equal(scenarioStatsCoverage({...world,countryStats:{Latvia:{customStats:{grain:100}}}},options,{customKeys:['grain']})[0].status,'ready');
  assert.equal(scenarioStatsCoverage({...world,countryStats:{Latvia:{customStats:{grain:100}}}},options,{customKeys:['grain','ships']})[0].status,'incomplete');
});

test('manual editing resizes native territorial population/GDP and retains all geographic IDs',()=>{
  const before=sheet();
  const edits=scenarioStatsEditorValues(before);
  const after=applyScenarioStatsManualEdits({sheet:before,date:'2026-01-01',edits:{...edits,population:1900000,gdp:55000000000,birthRate:6,deathRate:15}});
  assert.equal(after.population.total,1900000);
  assert.ok(Math.abs(after.economy.gdp-55000000000)<5,'rounded native GDP total');
  assert.deepEqual(after.territorialComponents.map(e=>e.geography),before.territorialComponents.map(e=>e.geography));
  assert.equal(after.continuity.demographicEvolution.basePopulation,1900000);
  assert.equal(after.continuity.demographicEvolution.birthRate,6);
  assert.equal(scenarioStatsRequiredReady(after),true);
  assert.equal(before.population.total,1800000,'authoring does not mutate prior baseline');
});

test('manual creation only distributes across supplied canonical geography, no invented territorial ID',()=>{
  const macro=authorApprovedMacroEstimates(basis,1800000,36000000000);
  assert.deepEqual(macro.map(e=>e.index),[1,2]);
  assert.equal(macro.reduce((n,e)=>n+e.population,0),1800000);
  assert.equal(macro[0].gdpPerCapita,20000);
  const result=createReviewedScenarioStatsSheet({row:proposed({macro}),basis,date:'2026-01-01'});
  assert.equal(result.territorialComponents.length,3);
  assert.equal(result.population.total,1800000);
});

test('custom scenario values are persisted and readiness is tied to actual defined keys',()=>{
  const keys=['grain','treasury','ships'];
  const generated=createReviewedScenarioStatsSheet({row:{macro:proposed().macro,customStats:{grain:320,treasury:20,ships:8},publicDebt:0,budgetBalance:0},basis,date:'1300-01-01',customKeys:keys});
  assert.equal(generated.customStats.grain,320);
  assert.equal(scenarioStatsRequiredReady(generated,keys),true);
  const edits=scenarioStatsEditorValues(generated,keys);
  const updated=applyScenarioStatsManualEdits({sheet:generated,edits:{...edits,customStats:{grain:330,treasury:20,ships:8}},date:'1300-01-01',customKeys:keys});
  assert.equal(updated.customStats.grain,330);
  assert.deepEqual(updated.territorialComponents,generated.territorialComponents);
});

test('generated scenario-owned Stats detach into a new game on desktop and web, without writing active game',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const original={ownerCodes:['Latvia','Estonia'],countryStats:{Latvia:sheet(),Estonia:sheet({birthRate:6,deathRate:13})}};
  for(const file of ['server/libraryStore.js','src/runtime/web/models.js']){
    const src=readFileSync(path.join(root,file),'utf8');
    const prefix=file.startsWith('server/')?'const buildFreshWorldSeedFromScenario =':'export const buildFreshWorldSeedFromScenario =';
    const start=src.indexOf(prefix),end=src.indexOf('\n};',start);
    assert.ok(start>=0&&end>start,`actual ${file} scenario seeding function exists`);
    const fn=vm.runInNewContext(`${src.slice(start,end+3).replace(/^export /,'')}\nbuildFreshWorldSeedFromScenario`,{
      TEMPLATE_WORLD_OVERRIDE_KEYS,cloneJson:structuredClone,
    });
    const actual=plain(fn({baseWorld:{},scenarioWorld:original}));
    assert.deepEqual(actual.countryStats,plain(original.countryStats));
    actual.countryStats.Latvia.population.total=1;
    assert.equal(original.countryStats.Latvia.population.total,1800000);
  }
});

test('an initialized demographic baseline actually drives the native simulation',()=>{
  const initial=sheet();
  const world={ownerCodes:['Latvia'],countryStats:{Latvia:initial}};
  const next=advanceNativeDemographicClock(world,{fromDate:'2026-01-01',toDate:'2027-01-01'});
  assert.ok(next.countryStats.Latvia.population.total<initial.population.total);
  assert.equal(initial.continuity.demographicEvolution.creditedBirths,0);
});


test('actual scenario GeoJSON is the only source of region identities for author proposals',async()=>{
  const {projectCountryStatsScenarioCatalog,buildTargetStatsTerritorialBasisKernel}=await import('../Game/AI/countryStatsWorkerKernel.js');
  const geographic={type:'FeatureCollection',features:[
    {type:'Feature',properties:{id:'Riga',name:'Riga',gid0:'LVA'},geometry:{type:'Polygon',coordinates:[[[23,56],[24,56],[24,57],[23,56]]]}},
    {type:'Feature',properties:{id:'Tallinn',name:'Tallinn',gid0:'EST'},geometry:{type:'Polygon',coordinates:[[[24,58],[25,58],[25,59],[24,58]]]}}
  ]};
  const catalog=projectCountryStatsScenarioCatalog(geographic);
  const world={ownerCodes:['Latvia','Estonia']};
  const latvia=await buildTargetStatsTerritorialBasisKernel({bundle:{world,game:{gameDate:'2026-01-01'},events:[]},code:'Latvia',scenarioCatalog:catalog});
  assert.equal(latvia.plan.length,1);
  assert.equal(latvia.macroPlan.length,1);
  assert.equal(latvia.macroPlan[0].members[0].geography,'Latvia');
  const estimates=authorApprovedMacroEstimates(latvia,1800000,25000000000);
  const reviewed=createReviewedScenarioStatsSheet({row:proposed({macro:estimates}),basis:latvia,date:'2026-01-01'});
  assert.deepEqual(reviewed.territorialComponents.map(row=>row.geography),['Latvia']);
  assert.equal(reviewed.population.total,1800000);
  assert.equal(reviewed.territorialComponents.some(row=>row.geography==='Tallinn'),false);
});
