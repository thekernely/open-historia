import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticMap } from '../fronts/syntheticMap.js';
import { buildWorldGrid } from '../fronts/worldGrid.js';
import { runNaval } from './engine.js';
import { normalizeNavalControlChronology, sameNavalControlChronology } from './controlChronology.js';
import { validateCompletePositiveNavalEvidence } from '../statsNavalEconomicPort.js';
const map = () => {
  const world = syntheticMap({layout: ['AAA~~~~BBBNN','AAA~~~~BBBNN','AAA~~~~BBBNN','AAA~~~~BBBNN'],
    legend:{A:'Albion', B:'Teutonia',N:'Neutralia','~':null}, west:0,north:54,step:1,key:'x'});
  return {world, grid:buildWorldGrid(world.regions,{step:.5})};
};
const fleet = {id:'blockader',name:'Grand Fleet',type:'naval',ownerCode:'Albion',strength:100,lng:6.25,lat:52.25,posture:'blockade'};
const run = (controlChanges = [], extra = {}) => {
  const {world,grid} = map();
  return runNaval({fromDate:'1914-08-01',days:30,seed:'a seed',wars:[{id:'w',status:'active',sideA:['Albion'],sideB:['Teutonia']}],
    units:[fleet],strengthOf:()=>13,controllerOf:world.controllerOf,grid,
    raised:[{country:'Albion',date:'1914-07-01'},{country:'Teutonia',date:'1914-07-01'}],controlChanges,...extra});
};
test('dated coastal occupation changes actual daily naval economic exposure', () => {
  const full=run();
  const rows=[{day:15,regionId:'r7-0',from:'Teutonia',to:'Albion',kind:'control'}];
  const taken=run(rows);
  assert.deepEqual(taken.controlChronology,rows.map(({kind,...r})=>r));
  assert.ok(taken.blockadeDays && taken.blockadePeriods);
  assert.ok(validateCompletePositiveNavalEvidence({fromDate:'1914-08-01',toDate:'1914-08-31',sea:{...taken,fromDate:'1914-08-01',days:30}}));
  const before=full.blockadeDays.reduce((sum,row)=>sum+row.pressure,0);
  const after=taken.blockadeDays.reduce((sum,row)=>sum+row.pressure,0);
  assert.notEqual(before,after,'changing a coastal region must change actual pressure, not reuse opening-map exposure');
  assert.deepEqual(run(rows).blockadeDays,taken.blockadeDays,'naval evidence is deterministic');
});
test('foreign or contradictory control identity cannot certify naval evidence', () => {
  const {world,grid}=map();
  for (const changes of [
    [{day:2,regionId:'unknown',from:'Teutonia',to:'Albion'}],
    [{day:2,regionId:'r7-0',from:'Albion',to:'Teutonia'}],
    [{day:2,regionId:'r7-0',from:'Teutonia',to:'Albion'},{day:3,regionId:'r7-0',from:'Teutonia',to:'Albion'}],
  ]) {
    assert.equal(normalizeNavalControlChronology({grid,controllerOf:world.controllerOf,changes,days:30}),null);
    const sea=run(changes);
    assert.equal(sea.blockadeDays,null);
    assert.equal(sea.blockadePeriods,null);
  }
});
test('no operating fleet is a proved zero naval pressure even across a recorded coastal capture', () => {
  const {world,grid}=map();
  const change={day:15,regionId:'r7-0',from:'Teutonia',to:'Albion',kind:'control'};
  const result=runNaval({fromDate:'1914-08-01',days:30,seed:'x',wars:[{id:'w',status:'active',sideA:['Albion'],sideB:['Teutonia']}],
    units:[],strengthOf:()=>13,controllerOf:world.controllerOf,grid,
    raised:[{country:'Albion',date:'1914-07-01'},{country:'Teutonia',date:'1914-07-01'}],
    militaryOf:()=>({sea:0,quality:50,technology:50}),controlChanges:[change]});
  assert.deepEqual(result.blockadeDays,[]);
  assert.deepEqual(result.blockadePeriods,[]);
  assert.deepEqual(result.controlChronology,[{day:15,regionId:'r7-0',from:'Teutonia',to:'Albion'}]);
});
test('repeated identical front/event receipts are one transition; a contradictory transition still fails',()=>{
  const {world,grid}=map();
  const change={day:15,regionId:'r7-0',from:'Teutonia',to:'Albion',kind:'control'};
  const twice=normalizeNavalControlChronology({grid,controllerOf:world.controllerOf,changes:[change,change],days:30});
  assert.deepEqual(twice,[{day:15,regionId:'r7-0',from:'Teutonia',to:'Albion'}]);
  assert.equal(normalizeNavalControlChronology({grid,controllerOf:world.controllerOf,changes:[change,{...change,to:'Neutralia'}],days:30}),null);
});

test('comparison accepts an exact duplicated front/event receipt but not a contradictory transition', () => {
  const change = {day:15, regionId:'r7-0', from:'Teutonia', to:'Albion'};
  assert.equal(sameNavalControlChronology([change], [change, {...change}]), true);
  assert.equal(sameNavalControlChronology([change, {...change}], [change]), true);
  assert.equal(sameNavalControlChronology([change], [change, {...change, to:'Neutralia'}]), false);
});
