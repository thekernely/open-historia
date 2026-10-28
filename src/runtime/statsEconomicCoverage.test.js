import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEvents } from './gameState.js';
import { buildCountryEconomicCoverage as inspect, createCountryEconomicCoverageReader } from './statsEconomicCoverage.js';
import { buildNationalEconomicCoverageAudit } from './statsEconomicCoverageAudit.js';
import { normalizeStatsEconomicEventAccounting, validateGeneratedStatsEconomicAccounting } from './statsEconomicEventAccounting.js';

const date = '2127-11-02';
const exposure = (polity = 'Ferric Crownlands') => ({
  polity, channel: 'credit', exposure: 'direct',
  evidence: 'Commercial bank clearinghouses suspended merchant settlement orders across the Crownlands.',
});
const original = (accounting = { status: 'unquantified', reason: 'Output loss is unknown.', exposures: [exposure()] }) => ({
  id: 'collapse-2127', date: '2127-07-25', title: 'International credit freeze',
  description: 'Merchant transactions halted in the Crownlands.',
  tags: ['Economy'], storylineIds: ['global-credit-collapse'],
  economicAccounting: accounting,
});
const world = (sourceOverride = {}) => ({
  countryStats: { 'Ferric Crownlands': {}, 'Dyke-and-Rook League': {}, 'Opossum Kingdom': {} },
  storyline: null,
  storylines: [{ id: 'global-credit-collapse', status: 'active', startedDate: '2127-07-25',
    participants: ['Ferric Crownlands', 'Dyke-and-Rook League', 'Opossum Kingdom'],
    sourceEventIds: ['collapse-2127'], ...sourceOverride }],
});

test('evidenced national exposure survives canonical event save normalization unchanged and is not a GDP write', () => {
  const event = original();
  const saved = normalizeEvents(JSON.parse(JSON.stringify([event])))[0];
  assert.deepEqual(saved.economicAccounting.exposures, [exposure()]);
  assert.equal(validateGeneratedStatsEconomicAccounting([event]), '');
  const snapshot = JSON.stringify(world());
  const report = inspect({ world: world(), events: [saved], polity: 'Ferric Crownlands', date });
  assert.equal(report.status, 'documented-unquantified');
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.potentialCount, 0);
  assert.equal(report.confirmed[0].eventId, event.id);
  assert.equal(report.confirmed[0].channel, 'credit');
  assert.equal(report.confirmed[0].sourceStorylineId, 'global-credit-collapse');
  assert.equal(JSON.stringify(world()), snapshot);
});

test('1912 Ruhr regression: a direct accepted growth effect closes its own evidenced exposure', () => {
  const event = {
    id: 'event-ai-r0002-19120208-005', date: '1912-02-08',
    title: 'A massive wildcat strike erupts among coal miners in the Ruhr valley.',
    tags: ['Economy'],
    economicAccounting: { status: 'applied', reason: 'Coal mining and industrial fuel output disrupted.',
      exposures: [{ polity: 'German Empire', channel: 'production', exposure: 'direct',
        evidence: 'Total strike action halts coal output across major pits in the Ruhrland region for several weeks.' }] },
    impacts: { polityChanges: [{ operation: 'update', code: 'German Empire',
      statsEffects: { annualRealGrowthDelta: -0.2, durationDays: 30,
        gdpCause: 'production', reason: 'Coal output disruption reduced near-term growth.' } }] },
  };
  const receipt = {
    eventId: event.id, polity: 'German Empire', date: event.date,
    reason: 'Coal output disruption reduced near-term growth.',
    process: { eventId: event.id, startDate: event.date, endDate: '1912-03-09',
      annualRealGrowthDelta: -0.2, cause: 'production' }, changes: [],
  };
  const state = { countryStats: { 'German Empire': {}, 'French Republic': {} },
    statsEventReceipts: [receipt] };
  const inspectGermany = (worldValue, eventValue = event) => inspect({
    world: worldValue, events: [eventValue], polity: 'German Empire', date: '1912-03-31',
  });
  const result = inspectGermany(state);
  assert.equal(result.status, 'none');
  assert.equal(result.confirmedCount, 0);
  assert.equal(result.assessedCount, 1);
  const audit = buildNationalEconomicCoverageAudit({ world: state, events: [event], date: '1912-03-31' });
  assert.equal(audit.status, 'complete');
  assert.equal(audit.documentedUnresolvedCount, 0);
  assert.equal(audit.assessedCount, 1);
  assert.equal(inspectGermany({ ...state, statsEventReceipts: [] }).confirmedCount, 1,
    'model claim alone does not prove the growth influence was applied');
  assert.equal(inspectGermany({ ...state, statsEventReceipts: [{ ...receipt, polity: 'French Republic' }] }).confirmedCount, 1,
    'another country\'s accepted effect cannot close Germany\'s exposure');
  assert.equal(inspectGermany({ ...state, statsEventReceipts: [{ ...receipt,
    process: { ...receipt.process, annualRealGrowthDelta: -1 } }] }).confirmedCount, 1,
    'a mismatched growth influence must not close the disruption');
  assert.equal(inspectGermany({ ...state, statsEventReceipts: [{ ...receipt,
    date: '1912-02-09' }] }).confirmedCount, 1,
    'a differently dated receipt must not be assigned to the original event');
  const directGdpEvent = { ...event, impacts: { polityChanges: [{
    code: 'German Empire', statsEffects: { gdpChangePercent: -1, gdpCause: 'production',
      reason: 'Recorded output loss from the same coal production disruption.' },
  }] } };
  const directGdpReceipt = { ...receipt, process: undefined,
    changes: [{ metric: 'economy.gdp', before: 100000000, after: 99000000 }] };
  assert.equal(inspectGermany({ ...state, statsEventReceipts: [directGdpReceipt] },
    directGdpEvent).status, 'none', 'an accepted same-event GDP stock delta also closes output coverage');
  assert.equal(inspectGermany(state, { ...event, economicAccounting: {
    ...event.economicAccounting, status: 'unquantified' } }).confirmedCount, 1,
  'an explicitly unquantified event cannot borrow a receipt to claim coverage');
  assert.equal(inspectGermany(state, { ...event, impacts: { polityChanges: [{
    code: 'German Empire', statsEffects: { debtFinancedOutlayPercentGdp: 1,
      debtFinancedOutlayCause: 'relief', reason: 'Emergency debt financed relief.' } }] } }).confirmedCount, 1,
  'borrowing is not proof that an industrial output disruption was quantified');
});

test('multi-country coverage reader preserves independent single-country results without rewriting the world', () => {
  const w = world();
  const events = normalizeEvents([original()]);
  const originalWorld = JSON.stringify(w);
  const originalEvents = JSON.stringify(events);
  const reader = createCountryEconomicCoverageReader({ world: w, events, date,
    viewerPolity: 'Opossum Kingdom' });
  for (const polity of ['Ferric Crownlands', 'Dyke-and-Rook League', 'Opossum Kingdom', 'Nonexistent Polity']) {
    assert.deepEqual(reader(polity, 2), inspect({
      world: w, events, polity, viewerPolity: 'Opossum Kingdom', date, maxRows: 2,
    }), 'reader result differs for ' + polity);
  }
  assert.equal(JSON.stringify(w), originalWorld);
  assert.equal(JSON.stringify(events), originalEvents);
});

test('a storyline participant is a potential exposure, not a confirmed economically disrupted country', () => {
  const events = normalizeEvents([original()]);
  const candidate = inspect({ world: world(), events, polity: 'Dyke-and-Rook League', date });
  assert.equal(candidate.status, 'potential-unverified');
  assert.equal(candidate.confirmedCount, 0);
  assert.equal(candidate.potentialCount, 1);
  const noSource = inspect({ world: world({ status: 'resolved' }), events, polity: 'Dyke-and-Rook League', date });
  assert.equal(noSource.status, 'none');
  assert.equal(inspect({world:world(),events,polity:'Nonexistent Polity',date}).status, 'none');
});

test('legacy saved unquantified crisis events retain tentative coverage without manufacturing direct evidence', () => {
  const events = normalizeEvents([original({status:'unquantified',reason:'No reliable national output estimate.'})]);
  const report = inspect({ world: world(), events, polity:'Ferric Crownlands', date });
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.potentialCount, 1);
  assert.equal(report.status, 'potential-unverified');
});

test('accepted later receipts can close one country without silently resolving the entire global event', () => {
  const w = world();
  w.statsEventReceipts = [{
    eventId: 'new-crisis-assessment', date:'2127-10-30', polity:'Ferric Crownlands',
    sourceStorylineId:'global-credit-collapse', assessesUnquantifiedEventId:'collapse-2127',
    reason:'New evidence for national output forecast.',
    process: {eventId:'new-crisis-assessment',startDate:'2127-10-30',endDate:'2127-11-30',
      annualRealGrowthDelta:-3,cause:'trade',sourceStorylineId:'global-credit-collapse',
      economicShockEstimate: {basis:'simulation-estimate',channel:'credit',exposure:'direct',
        evidence:'Commercial bank clearinghouses suspended merchant settlement orders across the Crownlands.'}},
    changes:[],
  }];
  const before=inspect({world:w,events:[original()],polity:'Ferric Crownlands',date:'2127-10-29'});
  const after=inspect({world:w,events:[original()],polity:'Ferric Crownlands',date});
  const elsewhere=inspect({world:w,events:[original()],polity:'Opossum Kingdom',date});
  assert.equal(before.confirmedCount, 1);
  assert.equal(after.confirmedCount, 0);
  assert.equal(after.assessedCount, 1);
  assert.equal(elsewhere.potentialCount, 1);
});

test('malformed, duplicate and future events or nonexistent source IDs fail closed', () => {
  const ev = original();
  assert.equal(inspect({world:world(),events:[ev,ev],polity:'Ferric Crownlands',date}).confirmedCount,0);
  assert.equal(inspect({world:world(),events:[{...ev,date:'2128-01-01'}],polity:'Ferric Crownlands',date}).confirmedCount,0);
  assert.equal(inspect({world:world({sourceEventIds:[]}),events:[ev],polity:'Opossum Kingdom',date}).potentialCount,0);
  assert.equal(inspect({world:world(),events:[ev],polity:'Ferric Crownlands',date:'bad-date'}).status,'none');
  assert.equal(inspect({world:world(),events:[ev],polity:'Ferric Crownlands',date}).confirmed[0].active,true);
});

test('malformed exposure declarations and false none status are rejected at the generated-event boundary', () => {
  const invalid = [
    [{...exposure(),evidence:'too short'}],
    [{...exposure(),channel:'unknown'}],
    [exposure(),exposure()],
    Array.from({length:9},()=>exposure('Nation')),
    [{...exposure(),fabricatedGDP:30}],
    'not an array',
  ];
  for(const list of invalid) {
    const acc={status:'unquantified',reason:'Impact not measured.',exposures:list};
    assert.equal(normalizeStatsEconomicEventAccounting(acc),null);
    assert.match(validateGeneratedStatsEconomicAccounting([original(acc)]),/economicAccounting.exposures/);
  }
  assert.match(validateGeneratedStatsEconomicAccounting([original({
    status:'none',reason:'No impact.',exposures:[exposure()],
  })]),/economicAccounting.exposures/);
  assert.deepEqual(normalizeStatsEconomicEventAccounting({status:'unquantified',reason:'Unknown loss.'}),
    {status:'unquantified',reason:'Unknown loss.'});
});

test('read model caps displayed evidence but keeps exact unresolved counts', () => {
  const events=Array.from({length:8},(_,index)=>({
    ...original(),id:'crisis-'+index,date:'2127-08-0'+(index+1),
    economicAccounting:{status:'unquantified',reason:'Material losses unresolved.',exposures:[exposure()]},
  }));
  const w=world({sourceEventIds:events.map((event)=>event.id)});
  const r=inspect({world:w,events,polity:'Ferric Crownlands',date,maxRows:2});
  assert.equal(r.confirmedCount,8);
  assert.equal(r.confirmed.length,2);
});
test('private intelligence economic events do not leak into another viewer polity Statistics pane', () => {
  const privateEvent={...original(),audience:['The Forest Brothers']};
  assert.equal(inspect({world:world(),events:[privateEvent],polity:'Ferric Crownlands',
    viewerPolity:'Opossum Kingdom',date}).status,'none');
  assert.equal(inspect({world:world(),events:[privateEvent],polity:'Ferric Crownlands',
    viewerPolity:'The Forest Brothers',date}).status,'documented-unquantified');
});
test('the Economy pane loads canonical events lazily and distinguishes documented from tentative coverage', () => {
  const source = readFileSync(new URL('../Game/GameUI/stats.jsx', import.meta.url), 'utf8');
  assert.match(source, /readEventsState\(\{ force: false \}\)/);
  assert.match(source, /if \(!active \|\| statsView !== "economy" \|\| !player\.date\) return undefined/);
  assert.match(source, /buildCountryEconomicCoverage\(\{/);
  assert.match(source, /viewerPolity: player\.code/);
  assert.match(source, /countryEconomicCoverage\.confirmedCount > 0/);
  assert.match(source, /The active crisis storyline links this polity/);
  assert.match(source, /!statSheetDefinition\.custom && countryEconomicCoverage\.status !== "none"/);
  assert.match(source, /setEconomicEventHistory\(\{ status: "error"/,
    'a failed event-history fetch is not treated as zero unmodeled impact');
  assert.match(source, /Economic event history could not be loaded/);
  assert.match(source, /setEconomicHistoryRetry\(\(current\) => current \+ 1\)/);
  assert.match(source, /worldSnapshot\?\.countryEconomicCoverageView/,
    'Economy uses the viewer-scoped host coverage summary in shared games');
  assert.match(source, /Shared-game coverage for other countries shows publicly documented disruptions only/);
});
test('a later accepted source-linked assessment closes legacy tentative exposure even after receipt pruning', () => {
  const old=original({status:'unquantified',reason:'A named crisis exists without country-specific measurement.'});
  const assessedEvent={
    id:'followup',date:'2127-10-30',storylineIds:['global-credit-collapse'],
    impacts:{polityChanges:[{code:'Ferric Crownlands',statsEffects:{
      sourceStorylineId:'global-credit-collapse',assessesUnquantifiedEventId:'collapse-2127',
      annualRealGrowthDelta:-3,durationDays:30,gdpCause:'trade',
      economicShockEstimate:{basis:'simulation-estimate',channel:'credit',exposure:'direct',
        evidence:'Commercial bank clearinghouses suspended merchant settlement orders across the Crownlands.'},
      reason:'Subsequent credit records support a bounded national loss estimate.',
    }}]},
  };
  const w=world();
  const result=inspect({world:w,events:[old,assessedEvent],
    polity:'Ferric Crownlands',date});
  assert.equal(result.status,'none');
  assert.equal(result.assessedCount,1);
  assert.equal(result.potentialCount,0);
  assert.equal(inspect({world:w,events:[old,assessedEvent],
    polity:'Dyke-and-Rook League',date}).potentialCount,1);
});
