/*! Open Historia - accepted typed national event operations and saved receipts. */
import test from "node:test";
import assert from "node:assert/strict";
import { applyEventImpactsToWorld, normalizeEvents, normalizeWorldState } from "./gameState.js";
import { mergeCountryStatPatch } from "./countryStats.js";
import { applyWorldStorylineUpdates, projectNewStatsStorylineSources } from "../Game/AI/nativeWorldDirector.js";
import { buildUnquantifiedEconomicAssessmentContext } from "./statsUnquantifiedAssessmentContext.js";

const sheet = (multiplier = 1) => mergeCountryStatPatch(null, {
  territorialComponents: [
    { geography: "North", group: "core", population: 800_000 * multiplier, gdpPerCapita: 10_000 },
    { geography: "South", group: "integrated", population: 200_000 * multiplier, gdpPerCapita: 15_000 },
  ], economy: { publicDebt: 45, budgetBalance: -3 },
});
const world = () => ({
  polityOverrides: { Alba: { code: "Alba", name: "Alba" }, Borealia: { code: "Borealia", name: "Borealia" } },
  countryStats: { Alba: sheet(), Borealia: sheet(2) },
});
const event = (changes, id = "evt-33") => ({
  id, date: "1912-02-20", title: "Measured settlement",
  impacts: { polityChanges: changes.map((row) => ({ operation: "update", ...row })) },
});
const effect = { populationChange: -8000, populationCause: "deaths", reason: "Recorded mortality" };

test("accepted event mutates one national ledger and persists numeric receipt through normalization", () => {
  const before = world();
  const source = event([{ code: "Alba", statsEffects: effect }]);
  assert.deepEqual(normalizeEvents([source])[0].impacts.polityChanges[0].statsEffects, effect);
  const accepted = applyEventImpactsToWorld({ world: before, events: [source] }).world;
  assert.equal(before.countryStats.Alba.population.total, 1_000_000, "detached event did not mutate input");
  assert.equal(accepted.countryStats.Alba.population.total, 992_000);
  assert.equal(accepted.countryStats.Borealia.population.total, 2_000_000);
  const [receipt] = accepted.statsEventReceipts;
  assert.equal(receipt.eventId, "evt-33");
  assert.equal(receipt.polity, "Alba");
  assert.equal(receipt.date, "1912-02-20");
  assert.equal(receipt.changes.find((c) => c.metric === "population.total").delta, -8000);
  assert.deepEqual(normalizeWorldState(accepted).statsEventReceipts, accepted.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({ world: normalizeWorldState(accepted), events: [source] }), /accounted|already applied/);
});

test("malformed or conflicting effects reject entire event without partial published world", () => {
  const original = world();
  for (const change of [
    { code: "Alba", statsEffects: { ...effect, populationCause: "births" } },
    { code: "Alba", statsEffects: { ...effect, unexpected: 1 } },
    { code: "Alba", statsEffects: { ...effect, populationChange: "8000" } },
    { code: "Alba", statsEffects: { ...effect, reason: "" } },
    { code: "Alba", statsEffects: [] },
    { code: "Alba", statsEffects: effect, stats: { population: { total: 100 } } },
    { code: "Alba", statsEffects: { gdpChangePercent: -2, gdpCause: "destruction", reason: "Factory collapse" }, stats: { economy: { gdp: 100_000 } } },
  ]) {
    assert.throws(() => applyEventImpactsToWorld({ world: original, events: [event([change])] }), undefined, JSON.stringify(change));
    assert.equal(original.countryStats.Alba.population.total, 1_000_000);
    assert.equal(original.statsEventReceipts, undefined);
  }
});

test("separate polities in one accepted event receive separate measured receipts", () => {
  const next = applyEventImpactsToWorld({ world: world(), events: [event([
    { code: "Alba", statsEffects: effect },
    { code: "Borealia", statsEffects: { gdpChangePercent: -1, gdpCause: "destruction", reason: "Plant closure" } },
  ])] }).world;
  assert.equal(next.statsEventReceipts.length, 2);
  assert.deepEqual(next.statsEventReceipts.map((receipt) => receipt.polity), ["Alba", "Borealia"]);
  assert.ok(next.countryStats.Borealia.economy.gdp < world().countryStats.Borealia.economy.gdp);
});

test('finite measured economic disruption persists through the canonical reducer and normalized receipts', () => {
  const source = world();
  source.countryStats.Alba = mergeCountryStatPatch(source.countryStats.Alba, {
    economy: { gdpGrowth: 3, inflation: 1, unemployment: 4, budgetBalance: 0 },
    continuity: { assessedDate: '1912-01-01' },
  });
  const shock = {
    annualRealGrowthDelta: -10, durationDays: 45, gdpCause: 'production',
    reason: 'Documented temporary stoppage',
  };
  const changed = applyEventImpactsToWorld({ world: source, events: [event([
    { code: 'Alba', statsEffects: shock },
  ])] }).world;
  assert.equal(changed.countryStats.Alba.economy.gdp, source.countryStats.Alba.economy.gdp,
    'a finite growth-rate influence must not invent an immediate national GDP loss');
  assert.equal(changed.countryStats.Alba.continuity.economicInfluences.length, 1);
  const [receipt] = changed.statsEventReceipts;
  assert.equal(receipt.eventId, 'evt-33');
  assert.equal(receipt.process.annualRealGrowthDelta, -10);
  assert.deepEqual(normalizeWorldState(changed).statsEventReceipts, changed.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({ world: changed, events: [event([
    { code: 'Alba', statsEffects: shock },
  ])] }), /accounted|already applied/);
});


test('native strategic deltas settle once, persist their receipts, and preserve world input', () => {
  const source = world();
  source.countryStats.Alba = mergeCountryStatPatch(source.countryStats.Alba, {
    stability: 65, indices: { internalSecurity: 53, foodAutonomy: 80 },
  });
  const operation = event([{ code: 'Alba', statsEffects: { stabilityDelta: -3,
    indexDeltas: { internalSecurity: -4 },
    reason: 'Verified interruption in law enforcement and public administration' } }]);
  const next = applyEventImpactsToWorld({ world: source, events: [operation] }).world;
  assert.equal(source.countryStats.Alba.stability, 65);
  assert.equal(next.countryStats.Alba.stability, 62);
  assert.equal(next.countryStats.Alba.indices.internalSecurity, 49);
  assert.equal(next.countryStats.Alba.indices.foodAutonomy, 80);
  assert.equal(next.countryStats.Alba.economy.gdp, source.countryStats.Alba.economy.gdp);
  assert.deepEqual(next.statsEventReceipts[0].changes.map(({metric}) => metric),
    ['stability','indices.internalSecurity']);
  assert.deepEqual(normalizeWorldState(next).statsEventReceipts, next.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({ world: next, events: [operation] }), /accounted/);
});

test('live canonical event applier uses active custom definition for bounded independent deltas and records exactly once', () => {
  const definition = { custom: true, sections: [{ key: 'resources', label: 'Resources', stats: [
    { key: 'grain', label: 'Grain', kind: 'number', minimum: 0, maximum: 150, decimals: 0 },
    { key: 'gdpDisplay', label: 'GDP card', kind: 'currency', nativeMetric: 'gdp' },
  ] }] };
  const before = world();
  before.countryStats.Alba = mergeCountryStatPatch(before.countryStats.Alba, { customStats: { grain: 75 } });
  const source = event([{ code: 'Alba', statsEffects: {
    customStatDeltas: { grain: -10 }, reason: 'Recorded famine and depleted stores',
  } }], 'grain-incident');
  assert.throws(() => applyEventImpactsToWorld({ world: before, events: [source] }), /active custom scenario definition/);
  const next = applyEventImpactsToWorld({ world: before, events: [source], statSheetDefinition: definition }).world;
  assert.equal(before.countryStats.Alba.customStats.grain, 75);
  assert.equal(next.countryStats.Alba.customStats.grain, 65);
  assert.equal(next.countryStats.Alba.economy.gdp, before.countryStats.Alba.economy.gdp);
  assert.deepEqual(next.statsEventReceipts[0].changes.map(({ metric, delta }) => [metric, delta]),
    [['customStats.grain', -10]]);
  assert.deepEqual(normalizeWorldState(next).statsEventReceipts, next.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({ world: next, events: [source], statSheetDefinition: definition }), /accounted/);
  const invalid = event([{ code: 'Alba', statsEffects: {
    customStatDeltas: { gdpDisplay: -10 }, reason: 'Never mutate a read-only native binding',
  } }], 'bad-custom');
  assert.throws(() => applyEventImpactsToWorld({ world: before, events: [invalid], statSheetDefinition: definition }), /scenario-defined|initialized/);
});

test('dated economic resolution travels through native event applier and world normalization', () => {
  const source = world();
  source.countryStats.Alba = mergeCountryStatPatch(source.countryStats.Alba, {
    economy: { gdpGrowth: 3, inflation: 1, unemployment: 4 },
    continuity: { assessedDate: '1912-01-01' },
  });
  const shock = event([{ code:'Alba', statsEffects: {
    annualRealGrowthDelta:-6, durationDays:120, gdpCause:'production',
    reason:'Coal mines were closed in verified labor stoppage',
  }}], 'strike');
  const started=applyEventImpactsToWorld({world:source,events:[shock]}).world;
  const beforeGDP=started.countryStats.Alba.economy.gdp;
  const settlement=event([{ code:'Alba', statsEffects: {
    resolveGrowthInfluenceEventId:'strike', reason:'Strike settlement put miners back to work',
  }}], 'settlement');
  settlement.date='1912-03-10';
  const resolved=applyEventImpactsToWorld({world:started,events:[settlement]}).world;
  assert.equal(resolved.countryStats.Alba.economy.gdp,beforeGDP);
  assert.equal(started.countryStats.Alba.continuity.economicInfluences[0].resolvedDate,undefined);
  assert.deepEqual(resolved.statsEventReceipts[1].resolution,
    {eventId:'strike',resolvedDate:'1912-03-10',resolvedByEventId:'settlement'});
  assert.equal(resolved.countryStats.Alba.continuity.economicInfluences[0].resolvedDate,'1912-03-10');
  assert.deepEqual(normalizeWorldState(resolved).statsEventReceipts,resolved.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({world:resolved,events:[settlement]}),/accounted/);
});

test('measured strategic effects preserve an existing active storyline source through canonical receipts', () => {
  const before = world();
  before.storylines = [{ id: 'alba-unrest', title: 'Alba labor crisis', status: 'active',
    participants: ['Alba'], startedDate: '1912-01-01' }];
  before.countryStats.Alba = mergeCountryStatPatch(before.countryStats.Alba, {
    stability: 70, indices: { internalSecurity: 58 },
  });
  const source = { ...event([{ code: 'Alba', statsEffects: {
    stabilityDelta: -3, sourceStorylineId: 'alba-unrest',
    reason: 'Identified collapse in state services during the existing unrest',
  } }], 'unrest-effects'), storylineIds: ['alba-unrest'] };
  const applied = applyEventImpactsToWorld({ world: before, events: [source] }).world;
  assert.equal(applied.countryStats.Alba.stability, 67);
  assert.equal(applied.statsEventReceipts[0].sourceStorylineId, 'alba-unrest');
  assert.deepEqual(normalizeWorldState(applied).statsEventReceipts, applied.statsEventReceipts);
  const wrong = { ...source, storylineIds: ['wrong'] };
  assert.throws(() => applyEventImpactsToWorld({ world: before, events: [wrong] }), /active, event-linked storyline/);
});

test('accepted national recovery can only restore remaining damage recorded for the same country', () => {
  const origin = world();
  origin.countryStats.Alba = mergeCountryStatPatch(origin.countryStats.Alba, {
    stability: 72, indices: { foodAutonomy: 80 },
  });
  // Give the unrelated polity a valid target value so this exercises the
  // cross-polity recovery guard rather than the missing-baseline guard.
  origin.countryStats.Borealia = mergeCountryStatPatch(origin.countryStats.Borealia, {
    stability: 60,
  });
  const loss = event([{ code:'Alba', statsEffects:{stabilityDelta:-8,indexDeltas:{foodAutonomy:-10},
    reason:'Verified wartime devastation of transport and food supply'} }], 'damage');
  loss.date = '1912-02-20';
  const first = applyEventImpactsToWorld({world:origin,events:[loss]}).world;
  const repair = event([{ code:'Alba', statsEffects:{recoveryOfEventId:'damage',stabilityDelta:3,
    indexDeltas:{foodAutonomy:6},reason:'Verified restoration of food deliveries and local order'} }], 'recovery');
  repair.date = '1912-03-10';
  const recovered = applyEventImpactsToWorld({world:first,events:[repair]}).world;
  assert.equal(recovered.countryStats.Alba.stability,67);
  assert.equal(recovered.countryStats.Alba.indices.foodAutonomy,76);
  assert.equal(recovered.statsEventReceipts[1].recoversEventId,'damage');
  assert.equal(normalizeWorldState(recovered).statsEventReceipts[1].recoversEventId,'damage');
  const excessive = event([{code:'Alba',statsEffects:{recoveryOfEventId:'damage',
    indexDeltas:{foodAutonomy:5},reason:'Attempted duplicate reconstruction credit'}}], 'double-credit');
  excessive.date = '1912-03-11';
  assert.throws(()=>applyEventImpactsToWorld({world:recovered,events:[excessive]}),/recovery/);
  assert.equal(recovered.countryStats.Alba.indices.foodAutonomy,76);
  const other = event([{code:'Borealia',statsEffects:{recoveryOfEventId:'damage',
    stabilityDelta:1,reason:'Invented unrelated recovery'}}], 'foreign');
  other.date = '1912-03-11';
  assert.throws(()=>applyEventImpactsToWorld({world:recovered,events:[other]}),/recovery/);
  assert.equal(recovered.countryStats.Borealia.stability,60);
  assert.equal(recovered.statsEventReceipts.length,2);
});

test('an accepted appropriation debits national debt exactly once without changing GDP or annual deficit', () => {
  const initial=world();
  const outlay=event([{code:'Alba',statsEffects:{
    debtFinancedOutlayPercentGdp:0.8,debtFinancedOutlayCause:'relief',
    reason:'Emergency relief funded with a documented 0.8 percent GDP bond issue',
  }}], 'bond-issue-1912');
  const next=applyEventImpactsToWorld({world:initial,events:[outlay]}).world;
  assert.equal(next.countryStats.Alba.economy.publicDebt,45.8);
  assert.equal(next.countryStats.Alba.economy.budgetBalance,-3);
  assert.equal(next.countryStats.Alba.economy.gdp,initial.countryStats.Alba.economy.gdp);
  assert.deepEqual(next.statsEventReceipts[0].changes.map(({metric})=>metric),
    ['economy.publicDebt']);
  assert.ok(Math.abs(next.statsEventReceipts[0].changes[0].delta-0.8)<1e-10);
  assert.deepEqual(normalizeWorldState(next).statsEventReceipts,next.statsEventReceipts);
  assert.throws(()=>applyEventImpactsToWorld({world:next,events:[outlay]}),/accounted|already/);
  assert.equal(initial.statsEventReceipts,undefined);
});

test('borrowing propagates into existing treasury-derived military funding, without rewriting rated spending', async () => {
  const {treasuryFactor,forcesFunding} = await import('./militaryFunding.js');
  const before=world();
  before.countryStats.Alba=mergeCountryStatPatch(before.countryStats.Alba,{economy:{publicDebt:75}});
  const action=event([{code:'Alba',statsEffects:{
    debtFinancedOutlayPercentGdp:2,debtFinancedOutlayCause:'procurement',
    reason:'Legislature enacted and borrowed two percent GDP for procurement',
  }}],'confirmed-war-bonds');
  const after=applyEventImpactsToWorld({world:before,events:[action]}).world;
  assert.ok(treasuryFactor(after.countryStats.Alba)<treasuryFactor(before.countryStats.Alba));
  assert.ok(forcesFunding({sheet:after.countryStats.Alba})<forcesFunding({sheet:before.countryStats.Alba}));
  assert.equal(forcesFunding({sheet:after.countryStats.Alba,military:{spending:85}}),
    forcesFunding({sheet:before.countryStats.Alba,military:{spending:85}}),
    'separately assessed military spending ratings remain the military owner');
});

test('an accepted country-specific estimated crisis pressure survives canonical event application and reload',()=>{
  const initial=world();
  initial.storylines=[{id:'credit-crisis',status:'active',startedDate:'1912-01-15',
    participants:['Alba'],title:'Credit crisis',kind:'crisis',pressure:70,momentum:5,state:'Clearinghouses closed'}];
  const estimate={basis:'simulation-estimate',channel:'credit',exposure:'direct',
    evidence:'Alba clearinghouses shut down payments, and established merchant credit contracts cannot settle.'};
  const incident=event([{code:'Alba',statsEffects:{sourceStorylineId:'credit-crisis',
    annualRealGrowthDelta:-8,durationDays:40,gdpCause:'trade',economicShockEstimate:estimate,
    reason:'An estimated credit disruption affects Alba merchant production for forty days'}}], 'dated-crisis');
  incident.storylineIds=['credit-crisis'];
  const accepted=applyEventImpactsToWorld({world:initial,events:[incident]}).world;
  const normalized=normalizeWorldState(accepted);
  assert.equal(normalized.countryStats.Alba.continuity.economicInfluences[0].sourceStorylineId,'credit-crisis');
  assert.deepEqual(normalized.countryStats.Alba.continuity.economicInfluences[0].economicShockEstimate,estimate);
  assert.deepEqual(normalized.statsEventReceipts[0].process.economicShockEstimate,estimate);
  assert.equal(normalized.countryStats.Borealia.continuity?.economicInfluences?.length??0,0);
  assert.throws(()=>applyEventImpactsToWorld({world:normalized,events:[incident]}),/accounted/i);
  const bad=event([{code:'Borealia',statsEffects:incident.impacts.polityChanges[0].statsEffects}], 'fake-participant');
  bad.storylineIds=['credit-crisis'];
  assert.throws(()=>applyEventImpactsToWorld({world:initial,events:[bad]}),/storyline|participat/i);
});

test('a newly accepted same-day crisis may source one estimate before the storyline is canonically merged', () => {
  const initial = world();
  const source = event([{ code: 'Alba', statsEffects: {
    sourceStorylineId: 'new-credit-crisis', annualRealGrowthDelta: -4, durationDays: 30,
    gdpCause: 'trade', economicShockEstimate: { basis: 'simulation-estimate',
      channel: 'credit', exposure: 'direct',
      evidence: 'Alba clearinghouses have stopped settling the merchant guilds existing loan contracts.' },
    reason: 'Estimated thirty-day credit disruption following confirmed merchant settlement failures',
  } }], 'first-day-pressure');
  source.storylineIds = ['new-credit-crisis'];
  const update = { id: 'new-credit-crisis', kind: 'economy', status: 'active',
    title: 'Banking crisis in Alba', participants: ['Alba'],
    startedDate: source.date, eventIndexes: [0],
    state: 'Bank settlement networks fail during this accepted event.' };
  const projected = projectNewStatsStorylineSources({
    world: initial, updates: [update], events: [source], stopDate: '1912-03-01', round: 2,
  });
  assert.equal(projected.length, 1);
  assert.throws(() => applyEventImpactsToWorld({ world: initial, events: [source] }), /storyline/);
  const impacted = applyEventImpactsToWorld({
    world: initial, events: [source], statsSourceStorylines: projected,
  }).world;
  assert.equal(impacted.storylines.length, 0, 'provisional source does not rewrite storylines');
  assert.equal(impacted.statsEventReceipts[0].sourceStorylineId, 'new-credit-crisis');
  assert.equal(impacted.countryStats.Alba.continuity.economicInfluences[0].annualRealGrowthDelta, -4);
  assert.equal(impacted.countryStats.Borealia.continuity?.economicInfluences?.length ?? 0, 0);
  const merged = applyWorldStorylineUpdates({
    world: impacted, updates: [update], events: [source], stopDate: '1912-03-01', round: 2,
  }).world;
  assert.equal(merged.storylines.find((row) => row.id === 'new-credit-crisis')?.status, 'active');
  assert.equal(merged.statsEventReceipts[0].sourceStorylineId, 'new-credit-crisis');
  assert.deepEqual(normalizeWorldState(merged).statsEventReceipts, merged.statsEventReceipts);
  assert.throws(() => applyEventImpactsToWorld({
    world: merged, events: [source], statsSourceStorylines: projected,
  }), /accounted/i);
  const unrelated = event([{ code: 'Borealia', statsEffects: source.impacts.polityChanges[0].statsEffects }], 'bad-bystander');
  unrelated.storylineIds = ['new-credit-crisis'];
  assert.throws(() => applyEventImpactsToWorld({
    world: initial, events: [unrelated], statsSourceStorylines: projected,
  }), /storyline/i);
  assert.throws(() => applyEventImpactsToWorld({
    world: initial, events: [source],
    statsSourceStorylines: [{ ...projected[0], startedDate: '1912-03-01' }],
  }), /storyline/i);
});

test('later national crisis assessments reference a prior unquantified event exactly once per country', () => {
  const baseline = world();
  baseline.storylines = [{
    id: 'credit-crisis-review', kind: 'economy', status: 'active', title: 'Credit collapse',
    startedDate: '1912-01-17', participants: ['Alba', 'Borealia'],
    sourceEventIds: ['initial-credit-loss'], pressure: 80, momentum: 12,
  }];
  const original = { ...event([], 'initial-credit-loss'), date: '1912-01-17',
    storylineIds: ['credit-crisis-review'], tags: ['Economy'],
    economicAccounting: { status: 'unquantified',
      reason: 'International clearing banks stopped settlements, but national GDP exposures were not established.' } };
  const estimate = { basis: 'simulation-estimate', channel: 'credit', exposure: 'direct',
    evidence: 'Alba merchants lost functioning letter-of-credit settlement, preventing confirmed commercial shipments.' };
  const change = { sourceStorylineId: 'credit-crisis-review',
    assessesUnquantifiedEventId: 'initial-credit-loss',
    annualRealGrowthDelta: -5, durationDays: 30, gdpCause: 'trade',
    economicShockEstimate: estimate,
    reason: 'New evidence of thirty days of blocked Alba merchant settlements warrants an uncertain national pressure.' };
  const followup = { ...event([{code:'Alba', statsEffects:change}], 'credit-loss-alba'),
    storylineIds:['credit-crisis-review'] };
  const apply = (w, current, history) => applyEventImpactsToWorld({
    world: w, events: [current], historicalEvents: history,
  }).world;
  assert.throws(() => apply(baseline, followup, []), /follow-up/i,
    'an uncommitted or unknown original cannot authorize assessment');
  const first = apply(baseline, followup, [original]);
  assert.equal(first.statsEventReceipts[0].assessesUnquantifiedEventId, original.id);
  assert.equal(first.statsEventReceipts[0].polity, 'Alba');
  assert.equal(first.countryStats.Alba.continuity.economicInfluences[0].annualRealGrowthDelta, -5);
  assert.equal(first.countryStats.Borealia.continuity?.economicInfluences?.length ?? 0, 0);
  // A legacy or malformed receipt can carry the original assessment ID
  // without an accepted bounded numerical estimate. All three readers
  // normalize it away; it must not preempt the writer's first valid effect.
  const phantom = {
    eventId: 'phantom-previous', polity: 'Alba', date: '1912-02-01',
    assessesUnquantifiedEventId: original.id,
    sourceStorylineId: 'credit-crisis-review',
    reason: 'Legacy metadata claimed an assessment that did not settle.',
    changes: [],
  };
  const phantomProcess = { ...phantom, process: {
    eventId: phantom.eventId, startDate: phantom.date, endDate: '1912-02-28',
    annualRealGrowthDelta: -3, cause: 'trade', sourceStorylineId: phantom.sourceStorylineId,
  } };
  for (const malformed of [phantom, phantomProcess]) {
    const before = normalizeWorldState({ ...baseline, statsEventReceipts: [malformed] });
    // Use the literal raw malformed record too: a partially migrated/injected
    // world can reach the writer before normalized save publication.
    const literal = { ...baseline, statsEventReceipts: [malformed] };
    for (const input of [literal, before]) {
      const result = apply(input, followup, [original]);
      const newReceipt = result.statsEventReceipts.find((row) => row.eventId === followup.id);
      assert.equal(newReceipt?.assessesUnquantifiedEventId, original.id,
        'a non-admitted receipt must not block the first valid assessment');
      assert.equal(result.countryStats.Alba.continuity.economicInfluences[0].annualRealGrowthDelta, -5);
    }
  }
  const saved = normalizeWorldState(JSON.parse(JSON.stringify(first)));
  assert.equal(saved.statsEventReceipts[0].assessesUnquantifiedEventId, original.id,
    'assessment identity survives canonical save normalization');
  const brief = buildUnquantifiedEconomicAssessmentContext(saved, [original, followup], '1912-03-01');
  assert.match(brief, /acceptedAssessedPolities=\["Alba"\]/);
  assert.match(brief, /Borealia/);
  assert.match(brief, /1 of 1 canonical declarations/,
    'the original global declaration remains an incomplete review, not globally closed');

  const second = { ...event([{ code:'Borealia', statsEffects: {
    ...change, annualRealGrowthDelta:-3,
    economicShockEstimate: { ...estimate, exposure: 'dependent',
      evidence: 'Borealia exporters lost a documented settlement route through Alba merchant credit intermediaries.' },
    reason:'Fresh dependent settlement evidence supports a thirty day Borealia credit pressure.',
  }}], 'credit-loss-borealia'), storylineIds:['credit-crisis-review'] };
  const both = apply(first, second, [original, followup]);
  assert.deepEqual(both.statsEventReceipts.map((r) => r.polity).sort(), ['Alba','Borealia']);
  const duplicate = { ...followup, id:'credit-loss-alba-again' };
  assert.throws(() => apply(both, duplicate, [original, followup, second]), /follow-up/i,
    'a later event cannot assess the same original cause twice for one country');
  const noReceipt = {...both, statsEventReceipts: []};
  assert.throws(() => apply(noReceipt, duplicate, [original, followup, second]), /follow-up/i,
    'retained historical event IDs prevent duplicate assessment after receipt pruning');

  // A retained event is not proof that its claimed assessment was ACCEPTED:
  // older legacy/partial history can carry a naked source reference, or a
  // future, duplicate, wrong-source or nonquantified pseudo-assessment.
  // The Country Panel and AI briefing already reject these claims; the writer
  // must not block the first real, evidenced country-level settlement either.
  const misleading = {
    ...followup, id: 'malformed-previous-claim', date: '1912-02-18',
    impacts: {polityChanges:[{code:'Alba',statsEffects:{
      ...change, economicShockEstimate: undefined,
    }}]},
  };
  const wrongSource = {...misleading, id: 'wrong-source-claim',
    storylineIds:['unrelated-credit-source'],
    impacts:{polityChanges:[{code:'Alba',statsEffects:{...change}}]}};
  const futureClaim = {...misleading, id:'future-claim', date:'1912-04-01',
    impacts:{polityChanges:[{code:'Alba',statsEffects:{...change}}]}};
  const sameDayClaim = {...misleading, id:'same-day-claim', date:original.date,
    impacts:{polityChanges:[{code:'Alba',statsEffects:{...change}}]}};
  for (const history of [
    [original, misleading], [original, wrongSource],
    [original, futureClaim], [original, sameDayClaim],
    [original, {...followup, id:'duplicated-claim'}, {...followup, id:'duplicated-claim'}],
  ]) {
    const accepted = apply(baseline, followup, history);
    assert.equal(accepted.statsEventReceipts[0].assessesUnquantifiedEventId, original.id,
      'invalid retained claim must not bar the first valid assessed effect');
    assert.equal(accepted.countryStats.Alba.continuity.economicInfluences[0].annualRealGrowthDelta, -5);
  }
  assert.throws(() => apply(baseline, followup, [{...original, economicAccounting:{
    status:'none', reason:'No verified national economy event occurred during negotiations.'}}]), /follow-up/i);
  assert.throws(() => apply(baseline, followup, [{...original, storylineIds:['other-crisis']}]), /follow-up/i);
  assert.throws(() => apply(baseline, followup, [{...original, date:'1912-02-20'}]), /follow-up/i);
  assert.throws(() => apply({ ...baseline, storylines: [{ ...baseline.storylines[0],
    startedDate: '1912-01-18' }] }, followup, [original]), /follow-up/i,
    'a causal storyline that began after the original event cannot be reused');
  assert.throws(() => apply(baseline, followup, [original, original]), /follow-up/i);

  // Mixed event: a measured positive intervention in another polity does not
  // settle Alba's separately recorded, still-unquantified credit disruption.
  const exposure = { polity: 'Alba', channel: 'credit', exposure: 'direct',
    evidence: 'Alba merchant banks suspended letters of credit for export settlement despite outside relief.' };
  const mixed = { ...original, economicAccounting: {
    status: 'applied', reason: 'An emergency barter programme was funded, while Alba bank disruption remained unmeasured.',
    exposures: [exposure],
  }};
  const mixedResult = apply(baseline, followup, [mixed]);
  assert.equal(mixedResult.statsEventReceipts[0].assessesUnquantifiedEventId, original.id);
  const differentCountryOnly = { ...mixed, economicAccounting: {
    ...mixed.economicAccounting, exposures: [{...exposure, polity: 'Borealia'}],
  }};
  assert.throws(() => apply(baseline, followup, [differentCountryOnly]), /follow-up/i);
});

test('a dated national crisis assessment follows canonical polity identity after a rename', () => {
  const initial = world();
  const oldName = 'Alba', newName = 'New Alba';
  initial.countryStats[newName] = initial.countryStats[oldName];
  delete initial.countryStats[oldName];
  initial.polityOverrides[newName] = { code: newName, name: newName, formerNames: [oldName] };
  delete initial.polityOverrides[oldName];
  initial.storylines = [{
    id: 'legacy-credit-crisis', title: 'Old Alba credit crisis', kind: 'economy',
    startedDate: '1912-01-17', status: 'active',
    participants: [oldName], sourceEventIds: ['legacy-crisis-event'],
  }];
  const original = {
    ...event([], 'legacy-crisis-event'), date: '1912-01-17',
    storylineIds: ['legacy-credit-crisis'], tags: ['Economy'],
    economicAccounting: {
      status: 'unquantified', reason: 'Clearing suspensions disrupted the former Alba economic area without a measured rate.',
      exposures: [{ polity: oldName, channel: 'credit', exposure: 'direct',
        evidence: 'Merchants in Alba could not settle commercial credits through their national clearing banks.' }],
    },
  };
  const change = {
    sourceStorylineId: 'legacy-credit-crisis', assessesUnquantifiedEventId: original.id,
    annualRealGrowthDelta: -3, durationDays: 30, gdpCause: 'trade',
    economicShockEstimate: {
      basis: 'simulation-estimate', channel: 'credit', exposure: 'direct',
      evidence: 'Former Alba merchants lost trade clearing services for a documented thirty-day interval.',
    },
    reason: 'Dated documented clearing failures now support a bounded national estimate.',
  };
  const reassess = {
    ...event([{ code: newName, statsEffects: change }], 'alba-later-assessment'),
    storylineIds: ['legacy-credit-crisis'],
  };
  const accepted = applyEventImpactsToWorld({
    world: initial, events: [reassess], historicalEvents: [original],
  }).world;
  assert.equal(accepted.statsEventReceipts[0].polity, newName);
  assert.equal(accepted.statsEventReceipts[0].assessesUnquantifiedEventId, original.id);
  assert.equal(accepted.countryStats[newName].continuity.economicInfluences[0].annualRealGrowthDelta, -3);
  assert.equal(accepted.countryStats[oldName], undefined, 'no phantom old account');
  const mixedOrigin = { ...original, economicAccounting: {
    ...original.economicAccounting, status: 'applied',
    reason: "Another national effect was measured, while the renamed country's credit disruption remained unresolved.",
  } };
  const mixedAssessment = applyEventImpactsToWorld({
    world: initial, events: [reassess], historicalEvents: [mixedOrigin],
  }).world;
  assert.equal(mixedAssessment.statsEventReceipts[0].assessesUnquantifiedEventId, original.id,
    'historical exposure names are resolved before testing a mixed applied event');
  assert.throws(() => applyEventImpactsToWorld({
    world: accepted, events: [{ ...reassess, id: 'duplicate-country-assessment' }],
    historicalEvents: [original, reassess],
  }), /follow-up/i, 'rename aliases do not permit duplicate country closure');
  const unrelated = {
    ...event([{ code: 'Borealia', statsEffects: change }], 'unrelated-claim'),
    storylineIds: ['legacy-credit-crisis'],
  };
  assert.throws(() => applyEventImpactsToWorld({
    world: initial, events: [unrelated], historicalEvents: [original],
  }), /storyline|follow-up/i, 'the rename must not authorize unrelated countries');
});
