import test from "node:test";
import assert from "node:assert/strict";
import { mergeCountryStatPatch } from "./countryStats.js";
import { planStatsEventEffect } from "./statsEventEffects.js";
import { appendAcceptedStatsReceipt, normalizeStatsEventReceipts } from "./statsEventReceipts.js";

const base = () => mergeCountryStatPatch(null, {
  territorialComponents: [
    { geography: "North", group: "core", population: 800_000, gdpPerCapita: 10_000 },
    { geography: "South", group: "integrated", population: 200_000, gdpPerCapita: 15_000 },
  ], economy: { publicDebt: 45, budgetBalance: -3 },
});
const plan = (effect, options = {}) => planStatsEventEffect({
  effect, sheet: base(), eventId: "evt-12", ...options,
});

test("typed deaths conserve component GDP while reducing population exactly", () => {
  const before = base();
  const proposed = plan({ populationChange: -8_000, populationCause: "deaths", reason: "Recorded deaths" });
  const after = mergeCountryStatPatch(before, proposed.patch, { continuity: { accountedEventIds: ["evt-12"] } });
  assert.equal(after.population.total, 992_000);
  assert.equal(after.territorialComponents.reduce((sum, part) => sum + part.population, 0), 992_000);
  assert.ok(Math.abs(after.economy.gdp - before.economy.gdp) < before.economy.gdp * 0.000002);
  assert.deepEqual(after.continuity.accountedEventIds, ["evt-12"]);
});

test("typed GDP destruction scales canonical production rather than a separate number", () => {
  const before = base();
  const proposed = plan({ gdpChangePercent: -2, gdpCause: "destruction", reason: "Destroyed capacity" });
  const after = mergeCountryStatPatch(before, proposed.patch);
  assert.ok(Math.abs(after.economy.gdp / before.economy.gdp - .98) < 0.000001);
  assert.equal(after.population.total, before.population.total);
  assert.ok(after.economy.publicDebt > before.economy.publicDebt,
    "same nominal debt becomes a higher share after GDP destruction");
  assert.ok(Math.abs(after.economy.publicDebt * after.economy.gdp
    - before.economy.publicDebt * before.economy.gdp) < before.economy.gdp * .00005,
    "debt ratio rounding is bounded to half of its 0.0001-point precision");
});

test("signed causes, bounds, shape and conflicting absolute patches fail closed", () => {
  const valid = { populationChange: 10_000, populationCause: "births", reason: "Observed births" };
  for (const effect of [
    { ...valid, populationChange: -10_000 }, { ...valid, populationChange: 200_001 },
    { ...valid, populationChange: "100" }, { ...valid, populationChange: 0 },
    { ...valid, unknown: 1 }, { ...valid, reason: " " },
    { ...valid, reason: "x".repeat(241) },
    { gdpChangePercent: -95, gdpCause: "destruction", reason: "Loss" },
    { gdpChangePercent: 4, gdpCause: "destruction", reason: "Loss" },
    { gdpChangePercent: Number.NaN, gdpCause: "production", reason: "Gain" },
    { gdpChangePercent: 4, gdpCause: "production" },
    { reason: "No mutation" }, null, [],
  ]) assert.throws(() => plan(effect), undefined, JSON.stringify(effect));
  assert.throws(() => plan(valid, { absoluteStats: { population: { total: 5 } } }), /conflicts/);
  assert.throws(() => plan({ gdpChangePercent: -1, gdpCause: "destruction", reason: "Damage" },
    { absoluteStats: { economy: { gdp: 500 } } }), /conflicts/);
  assert.throws(() => plan(valid, { eventId: "" }), /identity/);
  assert.throws(() => plan(valid, { sheet: { ...base(), territorialComponents: [] } }), /territorial/);
  assert.throws(() => plan(valid, { sheet: { ...base(), continuity: { accountedEventIds: ["evt-12"] } } }), /accounted/);
});

test("receipts use actual post-write canonical numbers and retain missing versus zero", () => {
  const before = base();
  const effect = plan({ populationChange: 10_000, populationCause: "immigration", reason: "  Arrivals  " });
  const after = mergeCountryStatPatch(before, effect.patch);
  const world = { statsEventReceipts: [] };
  appendAcceptedStatsReceipt(world, { eventId: "evt-12", polity: "Alba", date: "1912-02-20",
    reason: effect.reason, before, after });
  assert.equal(world.statsEventReceipts.length, 1);
  assert.equal(world.statsEventReceipts[0].changes[0].metric, "population.total");
  assert.equal(world.statsEventReceipts[0].changes[0].delta, 10_000);
  assert.throws(() => appendAcceptedStatsReceipt(world, { eventId: "evt-12", polity: "Alba",
    date: "1912-02-20", reason: "Repeated", before, after }), /Duplicate/);
  assert.equal(normalizeStatsEventReceipts([{
    eventId: "e", polity: "Alba", date: "1912-02-20", changes: [{ metric: "economy.budgetBalance", before: null, after: 0 }],
  }])[0].changes[0].delta, null);
  assert.deepEqual(normalizeStatsEventReceipts([{ eventId: "bad", polity: "Alba", date: "not-a-date", changes: [] }]), []);
});

test("receipt storage stays bounded and does not become lifetime replay authority", () => {
  const sample = { eventId: "s", polity: "Alba", date: "1912-02-20", changes: [
    { metric: "economy.gdp", before: 4, after: 3 },
  ] };
  assert.equal(normalizeStatsEventReceipts(Array.from({ length: 1202 }, (_, i) => ({ ...sample, eventId: `e-${i}` }))).length, 1200);
});

test("finite replay uses durable accounted ID before capacity, including an expired influence", () => {
  const shock = { annualRealGrowthDelta: -10, durationDays: 45,
    gdpCause: "production", reason: "Documented stoppage" };
  const occupied = { ...base(), continuity: {
    accountedEventIds: ["evt-12"], economicInfluences: [{
      eventId: "evt-12", startDate: "1912-02-20", endDate: "1912-04-05",
      annualRealGrowthDelta: -10, cause: "production", reason: "Documented stoppage",
    }],
  } };
  assert.throws(() => plan(shock, { sheet: occupied, eventDate: "1912-02-20" }), /already accounted/);
  assert.throws(() => plan(shock, { sheet: {
    ...occupied, continuity: { accountedEventIds: ["evt-12"], economicInfluences: [] },
  }, eventDate: "1913-05-01" }), /already accounted/);
  // Old/migrated state can still carry the process but lack the accounted ID.
  assert.throws(() => plan(shock, { sheet: {
    ...occupied, continuity: { economicInfluences: occupied.continuity.economicInfluences },
  }, eventDate: "1912-02-20" }), /already applied/);
});

test('a later, source-linked recovery is capped by an accepted depletion and its prior recoveries', () => {
  const first = { eventId:'loss', polity:'Alba', date:'1912-01-10', reason:'Verified warehouse damage',
    changes: [{metric:'stability',before:70,after:65,delta:-5},
      {metric:'indices.foodAutonomy',before:80,after:70,delta:-10},
      {metric:'customStats.grain',before:100,after:80,delta:-20}] };
  const recovery = {eventId:'repair-1', polity:'Alba', date:'1912-01-20', reason:'Partial recovery',
    recoversEventId:'loss', changes:[{metric:'indices.foodAutonomy',before:70,after:74,delta:4},
      {metric:'customStats.grain',before:80,after:90,delta:10}]};
  const sheet = mergeCountryStatPatch(base(), {
    stability:65, indices:{foodAutonomy:74}, customStats:{grain:90},
  });
  const definition = {custom:true,sections:[{key:'resources',label:'Resources',stats:[
    {key:'grain',label:'Grain',kind:'number',minimum:0,maximum:200,decimals:0},
  ]}]};
  const options = { sheet, eventId:'repair-2', eventDate:'1912-02-01', polity:'Alba',
    receipts:[first,recovery], statSheetDefinition:definition };
  const planned = planStatsEventEffect({ ...options, effect:{
    recoveryOfEventId:'loss', stabilityDelta:3, indexDeltas:{foodAutonomy:6}, customStatDeltas:{grain:8},
    reason:'Documented repairs to damaged facilities',
  }});
  assert.equal(planned.recoveryOfEventId,'loss');
  assert.equal(planned.patch.stability,68);
  assert.equal(planned.patch.indices.foodAutonomy,80);
  assert.equal(planned.patch.customStats.grain,98);
  for (const changes of [
    {indexDeltas:{foodAutonomy:7}}, {stabilityDelta:6},
    {customStatDeltas:{grain:11}},     {indexDeltas:{foodAutonomy:-2}},
  ]) assert.throws(() => planStatsEventEffect({ ...options, effect:{
    recoveryOfEventId:'loss', reason:'Unverified recovery claim', ...changes,
  }}), /recover|recovery/i);
  for (const changed of [
    {eventDate:'1912-01-09'}, {polity:'Other'}, {receipts:[]},
    {receipts:[first,{...recovery, changes:[{metric:'stability',before:65,after:70,delta:5}]}]},
  ]) assert.throws(() => planStatsEventEffect({ ...options, ...changed, effect:{
    recoveryOfEventId:'loss', stabilityDelta:1, reason:'Attempted recovery',
  }}), /recover|recovery/i);
  assert.throws(() => planStatsEventEffect({ ...options, effect:{
    recoveryOfEventId:'loss', populationChange:100, populationCause:'births', reason:'No demographic recovery shortcuts',
  }}), /recover|recovery/i);
});

test('an evidenced, dated debt-financed outlay changes only the public debt stock', () => {
  const before = base();
  const proposed = plan({
    debtFinancedOutlayPercentGdp: 0.75, debtFinancedOutlayCause: 'procurement',
    reason: 'Confirmed debt-funded procurement at 0.75 percent of annual GDP',
  }, {eventDate: '1912-02-20'});
  const after = mergeCountryStatPatch(before, proposed.patch, {continuity:{accountedEventIds:['evt-12']}});
  assert.equal(after.economy.publicDebt, 45.75);
  assert.equal(after.economy.budgetBalance, -3, 'one-off borrowing does not rewrite an annual deficit rate');
  assert.equal(after.economy.gdp, before.economy.gdp, 'borrowing does not manufacture production');
  assert.equal(after.population.total, before.population.total);
  assert.equal(after.continuity.accountedEventIds.includes('evt-12'), true);
  const receiptWorld = {};
  appendAcceptedStatsReceipt(receiptWorld, {eventId:'evt-12',polity:'Alba',date:'1912-02-20',reason:proposed.reason,before,after});
  assert.deepEqual(receiptWorld.statsEventReceipts[0].changes.map(({metric,delta})=>[metric,delta]),
    [['economy.publicDebt',0.75]]);
  assert.deepEqual(normalizeStatsEventReceipts(JSON.parse(JSON.stringify(receiptWorld.statsEventReceipts))), receiptWorld.statsEventReceipts);
});

test('debt-financed outlays refuse unsupported amounts, missing fiscal baselines or dual economic writers', () => {
  const valid = {debtFinancedOutlayPercentGdp:1.5,debtFinancedOutlayCause:'mobilization',reason:'Funded government mobilization'};
  for (const effect of [
    {...valid,debtFinancedOutlayPercentGdp:0}, {...valid,debtFinancedOutlayPercentGdp:-1},
    {...valid,debtFinancedOutlayPercentGdp:5.01}, {...valid,debtFinancedOutlayPercentGdp:0.00001},
    {...valid,debtFinancedOutlayPercentGdp:0.123456}, {...valid,debtFinancedOutlayPercentGdp:'1'},
    {...valid,debtFinancedOutlayPercentGdp:Infinity}, {...valid,debtFinancedOutlayCause:'battle'},
    {...valid,debtFinancedOutlayCause:undefined},
    {...valid,gdpChangePercent:-1,gdpCause:'destruction'},
    {...valid,annualRealGrowthDelta:-2,gdpCause:'policy',durationDays:90},
    {...valid,populationChange:-100,populationCause:'deaths'},
    {...valid,resolveGrowthInfluenceEventId:'old'},
    {...valid,recoveryOfEventId:'loss',stabilityDelta:1},
  ]) assert.throws(()=>plan(effect,{eventDate:'1912-02-20'}), undefined, JSON.stringify(effect));
  assert.throws(()=>plan(valid,{eventDate:'1912-02-20',absoluteStats:{economy:{publicDebt:90}}}),/conflicts/);
  assert.throws(()=>plan(valid,{eventDate:'bad-date'}),/outlay/);
  assert.throws(()=>plan(valid,{eventDate:'1912-02-20',sheet:{...base(),economy:{gdp:1e8}}}),/outlay/);
  assert.throws(()=>plan(valid,{eventDate:'1912-02-20',sheet:{...base(),economy:{publicDebt:45}}}),/outlay/);
  assert.throws(()=>plan(valid,{eventDate:'1912-02-20',sheet:mergeCountryStatPatch(base(),{economy:{publicDebt:999}})}),/outlay/);
});

test('a booked debt outlay remains additive alongside the independent fiscal deficit accrual', async () => {
  const {advanceNativeFiscalClock} = await import('./statsFiscalClock.js');
  const initial=base();
  const indexed={ownerCodes:['Alba'],countryStats:{Alba:mergeCountryStatPatch(initial,{
    continuity:{assessedDate:'1912-01-01'},
  })}};
  const untilEvent=advanceNativeFiscalClock(indexed,{baselineWorld:indexed,fromDate:'1912-01-01',toDate:'1912-02-20'});
  const before=untilEvent.countryStats.Alba;
  const p=plan({debtFinancedOutlayPercentGdp:1.25,debtFinancedOutlayCause:'reconstruction',
    reason:'Established reconstruction bonds, 1.25 percent of GDP'},{sheet:before,eventDate:'1912-02-20'});
  const borrowed={...untilEvent,countryStats:{...untilEvent.countryStats,Alba:mergeCountryStatPatch(before,p.patch)}};
  assert.equal(borrowed.countryStats.Alba.economy.publicDebt,
    Math.round((before.economy.publicDebt+1.25)*10000)/10000);
  const continued=advanceNativeFiscalClock(borrowed,{baselineWorld:borrowed,fromDate:'1912-02-20',toDate:'1912-03-20'});
  assert.ok(continued.countryStats.Alba.economy.publicDebt>borrowed.countryStats.Alba.economy.publicDebt);
  assert.equal(continued.countryStats.Alba.continuity.fiscalClock.lastDate,'1912-03-20');
  assert.equal(continued.countryStats.Alba.economy.budgetBalance,-3);
  assert.deepEqual(advanceNativeFiscalClock(continued,{baselineWorld:continued,fromDate:'1912-02-20',toDate:'1912-03-20'}),continued);
});
