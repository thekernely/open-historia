import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticMap } from './fronts/syntheticMap.js';
import { buildWorldGrid } from './fronts/worldGrid.js';
import { runNaval } from './naval/engine.js';
import { planNativeStatsLiveTurn } from './statsLiveTurnClock.js';
import { mergeCountryStatPatch } from './countryStats.js';
const fixture=()=>{
  const map=syntheticMap({layout:['AAA~~~~BBBNN','AAA~~~~BBBNN','AAA~~~~BBBNN','AAA~~~~BBBNN'],
    legend:{A:'Albion',B:'Teutonia',N:'Neutralia','~':null},west:0,north:54,step:1,key:'x'});
  const grid=buildWorldGrid(map.regions,{step:.5});
  const regionCatalog=map.regions.map((row)=>({id:row.id,name:row.name,owner:map.controllerOf(row.id)}));
  const stats={};
  for(const c of ['Albion','Teutonia']) {
    const own=regionCatalog.filter(row=>row.owner===c);
    const components=own.map((row,index)=>({geography:row.name,group:'core',
      population:index===own.length-1?1000000-83333*(own.length-1):83333,gdpPerCapita:1000}));
    stats[c]=mergeCountryStatPatch(null,{
    territorialComponents:components,
    economy:{gdpGrowth:3,inflation:2,unemployment:7,budgetBalance:-2,publicDebt:40},
    continuity:{assessedDate:'1914-08-01',demographicEvolution:{version:1,sourceDate:'1914-08-01',endDate:'1960-12-31',lastDate:'1914-08-01',basePopulation:1000000,birthRate:30,deathRate:10,birthTrendPerYear:0,deathTrendPerYear:0,creditedBirths:0,creditedDeaths:0,birthFraction:0,deathFraction:0,influences:[]}},
  });
  }
  const world={ownerCodes:['Albion','Teutonia'],wars:[{id:'war-1',status:'active',sideA:['Albion'],sideB:['Teutonia']}],
    regionOwnershipOverrides:{},countryStats:stats};
  const change={day:15,regionId:'r7-0',from:'Teutonia',to:'Albion',kind:'control'};
  const raw=runNaval({fromDate:'1914-08-01',days:30,seed:'a seed',wars:world.wars,
    units:[{id:'u1',name:'Grand Fleet',type:'naval',ownerCode:'Albion',strength:100,lng:6.25,lat:52.25,posture:'blockade'}],
    raised:[{country:'Albion',date:'1914-07-01'},{country:'Teutonia',date:'1914-07-01'}],
    strengthOf:()=>13,controllerOf:map.controllerOf,grid,controlChanges:[change]});
  const sea={...raw,fromDate:'1914-08-01',days:30};
  return {world,change,sea,regionCatalog};
};
const argumentsOf=({world,change,sea,regionCatalog})=>({baseWorld:world,regionCatalog,fromDate:'1914-08-01',toDate:'1914-08-31',round:2,
  events:[{id:'front',date:'1914-08-16',impacts:{regionControlOps:[{regionId:change.regionId,fromCode:change.from,toCode:change.to,by:'front'}]}}],
  warUpdates:[],turnFronts:{flips:[change],sea}});
test('a verified dated coastal capture retains both belligerents in native monthly GDP and demographic chronology',()=>{
  const fixtureData=fixture();
  const plan=planNativeStatsLiveTurn(argumentsOf(fixtureData));
  assert.ok(plan,'complete time-changing naval evidence should permit wartime cutover');
  let after=plan.beforeEvent(fixtureData.world,0,argumentsOf(fixtureData).events[0]);
  after=plan.afterEvents(after,1);
  for (const code of ['Albion','Teutonia']) {
    assert.equal(after.countryStatsHistory[code].at(-1).date,'1914-08-31');
    assert.equal(after.countryStats[code].continuity.nativeEconomyClock.lastDate,'1914-08-31');
    assert.ok(after.countryStats[code].population.total>1000000);
  }
  assert.ok(after.countryStats.Teutonia.economy.gdp<after.countryStats.Albion.economy.gdp);
});
test('a coastal flip without its exact naval control receipts remains out of the native cutover',()=>{
  const fixtureData=fixture();
  for (const invalidSea of [
    {...fixtureData.sea, controlChronology:undefined},
    {...fixtureData.sea, controlChronology:[]},
    {...fixtureData.sea, controlChronology:fixtureData.sea.controlChronology.map(x=>({...x,day:14}))},
    {...fixtureData.sea, blockadeDays:null},
    {...fixtureData.sea, blockadePeriods:null},
  ]) assert.equal(planNativeStatsLiveTurn(argumentsOf({...fixtureData,sea:invalidSea})),null);
});

test('the same exact front and authored control receipt cannot disable complete maritime settlement',()=>{
  const fixtureData=fixture();
  const args=argumentsOf(fixtureData);
  args.events.push({id:'authored',date:'1914-08-16',impacts:{regionControlOps:[{
    regionId:fixtureData.change.regionId,fromCode:fixtureData.change.from,
    toCode:fixtureData.change.to,by:'author',
  }]}});
  assert.ok(planNativeStatsLiveTurn(args),'normalization of one transition must match two exact source receipts');
});
