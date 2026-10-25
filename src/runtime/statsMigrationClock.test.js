/*! Open Historia - two-sided finite migration and native turn integration regressions. */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCountryStatPatch } from "./countryStats.js";
import { validateNativeMigrationPlans, advanceNativeMigrationFlows } from "./statsMigrationClock.js";
import { planNativeStatsLiveTurn } from "./statsLiveTurnClock.js";
import { addGameDays, diffGameDays } from "./gameDates.js";

const from = "1913-05-08", to = "1913-06-07", until = "1914-05-08";
const sheet = (polity, residents, demographicClock = null) => mergeCountryStatPatch(null, {
  territorialComponents: [
    { geography: `${polity} North`, group: "core", population: Math.trunc(residents * 0.7), gdpPerCapita: 2000 },
    { geography: `${polity} South`, group: "integrated", population: residents - Math.trunc(residents * 0.7), gdpPerCapita: 1500 },
  ],
  economy: { gdpGrowth: 2, inflation: 1, unemployment: 5, budgetBalance: -1, publicDebt: 35 },
  continuity: { assessedDate: from, ...(demographicClock ? { demographicClock } : {}) },
});
const plan = (changes = {}) => ({ id: "qa-a-to-b", fromPolity: "Alba", toPolity: "Borea", sourceDate: from,
  endDate: until, lastDate: from, baseSourcePopulation: 1_000_000, baseDestinationPopulation: 500_000,
  totalPeople: 36_500, creditedPeople: 0, reason: "Explicit author-established finite transfer", ...changes });
const world = () => ({ ownerCodes: ["Alba", "Borea"], countryStats: {
  Alba: sheet("Alba", 1_000_000), Borea: sheet("Borea", 500_000),
}, migrationFlows: [plan()] });
const populations = (w) => Object.fromEntries(Object.entries(w.countryStats).map(([k, v]) => [k,v.population.total]));
const sum = (w) => Object.values(populations(w)).reduce((a,b)=>a+b,0);
const apply = (w, start=from, finish=to) => advanceNativeMigrationFlows(w, { baselineWorld:w, fromDate:start, toDate:finish });
const run = (w, start, finish, turnFronts = null) => {
  const boundary = planNativeStatsLiveTurn({ baseWorld:w, fromDate:start, toDate:finish,
    turnFronts, round:3, events:[] });
  assert.ok(boundary, `native plan ${start} -> ${finish}`);
  return boundary.afterEvents(w,0);
};

test("exact paired 30-day receipt conserves people, protects original state and GDP, and round trips", () => {
  const before = world(), after = apply(before);
  assert.equal(after.migrationFlows[0].creditedPeople, 3000);
  assert.equal(after.migrationFlows[0].lastDate, to);
  assert.deepEqual(populations(after), { Alba: 997000, Borea: 503000 });
  assert.equal(sum(after),sum(before));
  for (const key of ["Alba", "Borea"]) {
    const old = before.countryStats[key], current = after.countryStats[key];
    assert.equal(current.territorialComponents.reduce((x,row)=>x+row.population,0), current.population.total);
    assert.ok(Math.abs(current.economy.gdp-old.economy.gdp) <= old.economy.gdp * 0.000002);
  }
  assert.equal(before.migrationFlows[0].creditedPeople,0);
  assert.deepEqual(structuredClone(JSON.parse(JSON.stringify(after))), after);
});

test("month partitions and one long skip preserve the exact resident receipt and replay cursor", () => {
  const original = world();
  const one = apply(original,from,until);
  let monthly = original, start=from;
  while (start !== until) {
    const finish = [addGameDays(start, 30),until].sort()[0];
    monthly = apply(monthly,start,finish);
    start = finish;
  }
  assert.deepEqual(populations(monthly),populations(one));
  assert.deepEqual(monthly.migrationFlows,one.migrationFlows);
  assert.deepEqual(apply(one,until,addGameDays(until,30)),one);
  assert.deepEqual(apply(monthly,from,to), monthly, "a fully settled plan cannot be credited twice");
});

test("malformed, duplicate, unknown, cursor and overdraw cases fail closed without partial mutation", () => {
  const source = world();
  const bad = [
    { totalPeople: 999999 }, { totalPeople: "36500" }, { creditedPeople: 1 },
    { fromPolity: "Borea", toPolity: "Borea" }, { fromPolity: "Ghost" },
    { sourceDate: "1913-05-09" }, { endDate: "1930-01-01" },
    { reason: "" }, { lastDate: to },
  ];
  for (const override of bad) {
    const w = { ...source, migrationFlows: [plan(override)] };
    assert.throws(() => apply(w),/Native migration/, JSON.stringify(override));
  }
  const duplicate = { ...source, migrationFlows: [plan(), plan()] };
  assert.throws(() => validateNativeMigrationPlans(duplicate),/invalid identity/);
  const reserve = { ...source, frontPersonnel: { Alba: { unavailable: 900000, unresolved: 90000 } },
    migrationFlows: [plan({ totalPeople: 200000 })] };
  assert.throws(() => advanceNativeMigrationFlows(reserve,{fromDate:from,toDate:until}),/overdraw/);
  assert.deepEqual(populations(reserve),populations(source));
});

test("one year of native turn vs monthly native turns reconcile migrants and historical samples", () => {
  const original = world();
  const yearly = run(original,from,until);
  let monthly = original, cursor = from;
  for (const historyDate of yearly.countryStatsHistory.Alba.map((r)=>r.date)) {
    monthly = run(monthly,cursor,historyDate);
    cursor = historyDate;
  }
  assert.deepEqual(populations(monthly),populations(yearly));
  assert.deepEqual(monthly.migrationFlows,yearly.migrationFlows);
  assert.deepEqual(monthly.countryStatsHistory,yearly.countryStatsHistory);
  assert.equal(sum(monthly),sum(original));
  for (const polity of ["Alba","Borea"]) {
    assert.equal(monthly.countryStats[polity].economy.gdp,yearly.countryStats[polity].economy.gdp);
    assert.equal(monthly.countryStats[polity].economy.publicDebt,yearly.countryStats[polity].economy.publicDebt);
  }
});

test("future start within a long turn is bounded at its own authored anchor", () => {
  const first = '1913-06-01', end='1913-07-01';
  const w = world();
  w.migrationFlows = [plan({sourceDate:first,lastDate:first,endDate:end,baseSourcePopulation:1000000,
    baseDestinationPopulation:500000,totalPeople:3000})];
  // No demographic or prior authorized movement: the authored start anchor remains equal.
  const next = run(w,from,end);
  assert.equal(next.migrationFlows[0].creditedPeople,3000);
  assert.deepEqual(populations(next),{Alba:997000,Borea:503000});
});

// The actual naval simulator emits complete daily + period + thresholded
// evidence. Reuse the production evidence shape in the existing blockade
// suite, rather than inventing a standalone migration-only engine path.
const sea = (start,finish) => {
  const n=diffGameDays(start,finish), days=[];
  if (start === from) days.push({country:'Alba',date:addGameDays(start,2),pressure:0.8,covered:0.5,by:['Borea']});
  const groups = new Map();
  for (let i=1;i<=n;i++) {
    const date=addGameDays(start,i), month=date.slice(0,7), dates=groups.get(month)||[];
    dates.push(date);groups.set(month,dates);
  }
  const periods=[...groups.values()].map((dates)=>{
    const observed=days.filter((row)=>dates.includes(row.date));
    return { country:'Alba',fromDate:dates[0],toDate:dates.at(-1), days:dates.length,
      activeDays:observed.length,pressure:observed.reduce((x,r)=>x+r.pressure,0)/dates.length,
      covered:observed.length?0.5:0,by:observed.length?['Borea']:[] };
  });
  const avg=days.reduce((x,r)=>x+r.pressure,0)/n;
  return {sea:{fromDate:start,days:n,blockadeDays:days,blockadePeriods:periods,
    blockades:avg>=0.02?[{country:'Alba',pressure:Math.round(avg*1000)/1000,days:days.length,by:['Borea'],covered:.5}]:[]}};
};

test("native positive naval exposure and simultaneous two-sided migration both settle; no second writer", () => {
  const w = {...world(),wars:[{id:'war-1913',status:'active'}]};
  const after=run(w,from,to,sea(from,to));
  assert.deepEqual(populations(after),{Alba:997000,Borea:503000});
  assert.equal(after.migrationFlows[0].creditedPeople,3000);
  assert.ok(after.countryStats.Alba.economy.gdp < w.countryStats.Alba.economy.gdp * 1.01);
  assert.ok(after.countryStatsHistory.Alba?.length && after.countryStatsHistory.Borea?.length);
});

import { renamePolityInWorld } from "../../server/polityRename.js";
test("canonical polity rename carries both migration references and their progress", () => {
  const first = apply(world());
  const renamed = renamePolityInWorld(first, "Alba", "Alban Republic").world;
  assert.equal(renamed.migrationFlows[0].fromPolity, "Alban Republic");
  assert.equal(renamed.migrationFlows[0].creditedPeople, 3000);
  const moved = advanceNativeMigrationFlows(renamed, { fromDate: to, toDate: addGameDays(to, 30) });
  assert.ok(moved.countryStats["Alban Republic"].population.total < renamed.countryStats["Alban Republic"].population.total);
  assert.equal(moved.countryStats.Borea.population.total - renamed.countryStats.Borea.population.total,
    renamed.countryStats["Alban Republic"].population.total - moved.countryStats["Alban Republic"].population.total);
});

test("1913 two-country regression distinguishes natural German growth from exactly conserved migration", () => {
  const austria = 44_700_000, germany = 78_240_034;
  const natural = { sourceDate: from, endDate: until, lastDate: from, basePopulation: germany,
    birthsPerThousand:25, deathsPerThousand:15, creditedBirths:0, creditedDeaths:0 };
  const original = { ownerCodes:['Austria-Hungary','German Empire'], countryStats:{
    'Austria-Hungary':sheet('Austria-Hungary',austria),
    'German Empire':sheet('German Empire',germany,natural),
  }, migrationFlows:[plan({fromPolity:'Austria-Hungary',toPolity:'German Empire',
    baseSourcePopulation:austria,baseDestinationPopulation:germany})] };
  const after=run(original,from,to);
  assert.equal(after.countryStats['Austria-Hungary'].population.total,44_697_000);
  assert.equal(after.countryStats['German Empire'].population.total,78_307_298);
  assert.equal(after.countryStats['German Empire'].continuity.demographicClock.creditedBirths,160_660);
  assert.equal(after.countryStats['German Empire'].continuity.demographicClock.creditedDeaths,96_396);
  assert.equal(after.migrationFlows[0].creditedPeople,3000);
  assert.equal(sum(after)-sum(original),64_264,
    'the combined population grows by births-minus-deaths, never by cross-border migration');
});

test("two concurrent individually valid plans cannot jointly overdraw the source", () => {
  const base=world();
  const second={...plan({id:'qa-a-to-c',toPolity:'Coria',baseDestinationPopulation:500000,
    totalPeople:200000})};
  const original={...base,ownerCodes:['Alba','Borea','Coria'],
    countryStats:{...base.countryStats,Coria:sheet('Coria',500000)},
    migrationFlows:[plan({totalPeople:200000}),second],
    frontPersonnel:{Alba:{unavailable:800000,unresolved:100000}} };
  assert.throws(()=>apply(original,from,until),/reserve overdraw/);
  assert.equal(original.countryStats.Alba.population.total,1_000_000);
  assert.equal(original.migrationFlows[0].creditedPeople,0);
  assert.equal(original.migrationFlows[1].creditedPeople,0);
});
