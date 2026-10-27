import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedStatsEconomicAccounting, normalizeStatsEconomicEventAccounting } from '../../runtime/statsEconomicEventAccounting.js';
import { GAMEPLAY_TOOLS, validateGameplayPayload } from './gameplaySchemas.js';

const event = (accounting = undefined, changes = [], tags = ['Economy']) => ({
  date:'1912-01-25', title:'A coal strike', description:'Coal production was disrupted.', tags,
  ...(accounting === undefined ? {} : { economicAccounting: accounting }),
  impacts:{ polityChanges:changes },
});
const payload = (eventRow) => ({events:[eventRow],stopDate:'1912-03-31',summary:'A quarter ends.'});
const assessed = (status, reason = 'National consequences not quantified from supplied evidence.') => ({ status, reason });
const effect = {operation:'update',code:'British Empire',statsEffects:{ annualRealGrowthDelta:-2,durationDays:45,gdpCause:'production',reason:'Confirmed strike reduced mine output' }};
const verdict = (row) => validateGameplayPayload('jumpForward',payload(row));

test('economic-tagged events cannot silently omit a native outcome declaration', () => {
  assert.match(verdict(event()).error, /economicAccounting/);
  assert.equal(verdict(event(assessed('unquantified'))).valid, true);
  assert.equal(verdict(event(assessed('none','Debate did not authorize an economic measure.'))).valid, true);
  assert.equal(verdict(event(assessed('applied'))).valid, false);
});

test('typed economic effects must be explicitly matched to applied accounting', () => {
  const acknowledged = event(assessed('applied','Confirmed coal production fell for six weeks.'),[effect]);
  assert.equal(verdict(acknowledged).valid,true,verdict(acknowledged).error);
  assert.match(verdict(event(assessed('none','No national economic changes occurred.'),[effect])).error,/must be applied/);
  assert.match(verdict(event(assessed('unquantified'),[effect])).error,/must be applied/);
  assert.match(verdict(event(undefined,[effect],['Politics'])).error,/economicAccounting/);
  assert.match(verdict(event(assessed('applied'),[{operation:'update',code:'British Empire',statsEffects:{ reason:'no change' }}])).error,/measurable typed/);
});

test('non-economic political events need no meaningless Statistics declaration', () => {
  assert.equal(verdict(event(undefined,[],['Politics'])).valid,true);
  assert.deepEqual(normalizeStatsEconomicEventAccounting(assessed('unquantified')),assessed('unquantified'));
  assert.equal(normalizeStatsEconomicEventAccounting({status:'none',reason:''}),null);
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});

test('ordinary generated turns cannot overwrite native macro, population or sector writers', () => {
  for (const stats of [
    { economy: { gdp: '100B' } },
    { economy: { inflation: '12%' } },
    { economy: { unemployment: '14%' } },
    { economy: { publicDebt: '120% GDP' } },
    { economy: { budgetBalance: '-8% GDP' } },
    { economy: { gdpGrowth: '5%' } },
    { economy: { gdpPerCapita: '500' } },
    { gdpBreakdown: { industry: 30 } },
    { population: { total: 1_000_000 } },
    { territorialComponents: [] },
    { continuity: { nativeEconomyClock: {} } },
  ]) {
    const change = { operation: 'update', code: 'British Empire', stats };
    const row = event(undefined, [change], ['Politics']);
    assert.match(verdict(row).error, /native-clock-owned|is not allowed/, JSON.stringify(stats));
    const typed = event(assessed('applied', 'Measured production reduction supported by dated evidence.'),
      [change, effect]);
    assert.match(verdict(typed).error, /native-clock-owned|is not allowed/, JSON.stringify(stats));
  }
});

test('generated strategic and custom readings remain writable; administrative legacy schema remains available', () => {
  for (const stats of [
    { stability: 58 },
    { indices: { internalSecurity: 40 } },
    { customStats: { foodAutonomy: 60 } },
    { economy: { currency: 'EUR' } },
  ]) {
    assert.equal(verdict(event(undefined, [
      { operation: 'update', code: 'British Empire', stats },
    ], ['Politics'])).valid, true, JSON.stringify(stats));
  }
  assert.ok(GAMEPLAY_TOOLS.jumpForward.schema.properties.events.items.properties
    .impacts.properties.polityChanges.items.properties.stats.properties.economy.properties.inflation,
    'legacy schema field remains available for older serialized and GM paths');
});


test('strategic-only typed consequences require no spurious economic accounting declaration', () => {
  const change = { operation:'update',code:'British Empire',statsEffects: {
    indexDeltas: { internalSecurity: -3 }, reason: 'Police institutions lost control of the region',
  }};
  const political = event(undefined, [change], ['Politics']);
  assert.equal(verdict(political).valid, true, verdict(political).error);
  assert.equal(verdict(event(assessed('none', 'No macroeconomic change is asserted.'), [change], ['Economy'])).valid,
    true, 'economic accounting can explicitly declare no numerical economic impact');
  assert.match(verdict(event(assessed('applied'), [change], ['Economy'])).error,
    /applied economic change without any typed/);
  const noEffect = event(undefined, [{ operation:'update',code:'British Empire', statsEffects: {
    indexDeltas: {}, reason: 'Narrative only',
  }}], ['Politics']);
  assert.match(verdict(noEffect).error, /measurable typed/);
  assert.equal(verdict(event(assessed('applied'), [change, effect], ['Economy'])).valid,
    true, 'mixed strategic and economic effects need one legitimate economic declaration');
});

test('custom resource causal changes require truthful economic accounting only when Economy-tagged', () => {
  const resource = { operation: 'update', code: 'British Empire', statsEffects: {
    customStatDeltas: { grain: -5 }, reason: 'Documented loss of grain reserve',
  } };
  assert.equal(verdict(event(undefined, [resource], ['Politics'])).valid, true);
  assert.equal(verdict(event(assessed('applied', 'Measured decline in the national grain reserves.'),
    [resource], ['Economy'])).valid, true);
  assert.match(verdict(event(assessed('unquantified'), [resource], ['Economy'])).error, /must be applied/);
  assert.match(verdict(event(assessed('applied'), [{...resource, statsEffects:{ reason:'missing' }}], ['Economy'])).error, /measurable typed/);
});

test('verified resolution is an economically applied consequence, not a spurious no-change event', () => {
  const change = {operation:'update',code:'British Empire',statsEffects:{
    resolveGrowthInfluenceEventId:'coal-strike-1912', reason:'Miners signed and enacted a return-to-work agreement',
  }};
  const row = event(assessed('applied','Documented resumption of operations ends the prior growth disturbance.'),
    [change], ['Politics']);
  assert.equal(verdict(row).valid,true,verdict(row).error);
  assert.match(verdict(event(assessed('none','Production was unchanged.'), [change])).error,/must be applied/);
  assert.match(verdict(event(undefined, [change],['Politics'])).error,/economicAccounting/);
  assert.match(verdict(event(assessed('applied'), [{...change, statsEffects:{reason:'missing'}}])).error,/measurable typed/);
});

test('one-off borrowed fiscal expenditure is an applied economic effect, never implicit war spending', () => {
  const borrowed = {operation:'update',code:'British Empire',statsEffects:{
    debtFinancedOutlayPercentGdp:0.75,debtFinancedOutlayCause:'procurement',
    reason:'A verified new debt-financed appropriation equal to 0.75 percent of GDP',
  }};
  const claimed = event(assessed('applied','New government borrowing is specifically quantified.'),[borrowed],['Economy']);
  assert.equal(verdict(claimed).valid,true,verdict(claimed).error);
  assert.match(verdict(event(assessed('unquantified'),[borrowed])).error,/must be applied/);
  assert.match(verdict(event(undefined,[borrowed],['Politics'])).error,/economicAccounting/);
  assert.equal(verdict(event(assessed('unquantified'),[],['Economy'])).valid,true,
    'a war without a measured fiscal outlay remains unquantified');
});

test('explicitly estimated systemic pressure is an applied typed mutation, never silent unquantified accounting',()=>{
  const crisis={operation:'update',code:'Dyke-and-Rook League',statsEffects:{
    sourceStorylineId:'global-financial-collapse-2127',annualRealGrowthDelta:-8,durationDays:60,gdpCause:'trade',
    economicShockEstimate:{basis:'simulation-estimate',channel:'credit',exposure:'direct',
      evidence:'Amsterdam settlement and merchant clearinghouses cannot reconcile the affected claims.'},
    reason:'Unmeasured crisis impact estimated as a finite annual growth pressure',
  }};
  const applied=event(assessed('applied','A dated country-specific economic simulation estimate is proposed.'),[crisis]);
  assert.equal(verdict(applied).valid,true,verdict(applied).error);
  assert.match(verdict(event(assessed('unquantified'),[crisis])).error,/must be applied/);
  assert.match(verdict(event(assessed('none','No measurable disruption'),[crisis])).error,/must be applied/);
});
test('provider credit-crisis candidate reports ALL three actual faults without silently dropping evidence', () => {
  const source = {
    operation:'update',code:'Dyke-and-Rook League',statsEffects: {
      assessesUnquantifiedEventId:'event-ai-r0003-21270822-008',
      sourceStorylineId:'global-financial-collapse-2127',
      annualRealGrowthDelta:-1.2,durationDays:45,gdpCause:'trade',
      reason:'Commercial credit markets have stopped clearing transactions across trade hubs.',
    },
  };
  const accounting={status:'applied',
    reason:'Documented national credit restrictions caused liquidity contraction. '.repeat(4),
    exposures:[
      {polity:'Dyke-and-Rook League',channel:'credit',exposure:'direct',
        evidence:'National merchant banks cannot settle commercial import credit.'},
      {polity:'Dyke-and-Rook League',channel:'trade',exposure:'direct',
        evidence:'Shipping finance remains locked by commodity-scrip conversion.'},
    ],
  };
  const outcome=validateGeneratedStatsEconomicAccounting([event(accounting,[source])]);
  assert.match(outcome,/duplicate polity: dyke-and-rook league/);
  assert.match(outcome,/reason must be at most 240 characters/);
  assert.match(outcome,/statsEffects\.economicShockEstimate is required/);
  const repaired=event({
    ...accounting,
    reason:'A supported national liquidity contraction is estimated for the first time.',
    exposures:[accounting.exposures[0]],
  },[{...source,statsEffects:{...source.statsEffects,
    economicShockEstimate:{basis:'simulation-estimate',channel:'credit',exposure:'direct',
      evidence:'National merchant banks cannot settle commercial import credit.'},
  }}]);
  assert.equal(validateGeneratedStatsEconomicAccounting([repaired]),'');
  assert.equal(verdict(repaired).valid,true,verdict(repaired).error);
  const withoutExposure={...repaired,economicAccounting:{...repaired.economicAccounting,exposures:[]},
    impacts:{polityChanges:[{...repaired.impacts.polityChanges[0],
      statsEffects:{...source.statsEffects}}]}};
  assert.match(verdict(withoutExposure).error,/economicShockEstimate is required/);
});

test('estimated crisis pressures cannot smuggle debt borrowing or another independent mutation through generated-event admission', () => {
  const accounting=assessed('applied','A bounded temporary country-specific credit pressure is estimated.');
  const base={operation:'update',code:'Dyke-and-Rook League',statsEffects:{
    sourceStorylineId:'global-financial-collapse-2127',
    assessesUnquantifiedEventId:'event-ai-r0003-21270822-008',
    annualRealGrowthDelta:-1.2,durationDays:45,gdpCause:'trade',
    economicShockEstimate:{basis:'simulation-estimate',channel:'credit',exposure:'direct',
      evidence:'Merchant credit clearing has ceased at the affected national ports.'},
    reason:'Documented national credit clearing disruption',
  }};
  assert.equal(verdict(event(accounting,[base])).valid,true);
  for(const [field,value] of [
    ['debtFinancedOutlayPercentGdp',0.5],
    ['gdpChangePercent',-1],
    ['populationChange',-1000],
    ['stabilityDelta',-3],
    ['indexDeltas',{financialStability:-5}],
  ]) {
    const proposed={...base,statsEffects:{...base.statsEffects,[field]:value}};
    const output=verdict(event(accounting,[proposed]));
    assert.equal(output.valid,false,field);
    assert.match(output.error,/economicShockEstimate cannot be combined with/);
    assert.ok(output.error.includes(field));
  }
});

test('borrowing must carry its independently authorized spending cause, never a silent outlay', () => {
  const accounting=assessed('applied','Dated national borrowing and debt relief must be documented.');
  const base={operation:'update',code:'Dyke-and-Rook League',statsEffects:{
    annualRealGrowthDelta:-1.2,durationDays:30,gdpCause:'trade',
    sourceStorylineId:'global-financial-collapse-2127',
    reason:'Documented contraction in merchant trade due to credit paralysis',
  }};
  const missingCause=event(accounting,[{
    ...base,statsEffects:{...base.statsEffects,debtFinancedOutlayPercentGdp:0.005},
  }]);
  assert.match(verdict(missingCause).error,/debtFinancedOutlayCause must accompany/);
  const orphanCause=event(accounting,[{
    ...base,statsEffects:{...base.statsEffects,debtFinancedOutlayCause:'relief'},
  }]);
  assert.match(verdict(orphanCause).error,/debtFinancedOutlayCause must accompany/);
  assert.equal(verdict(event(accounting,[base])).valid,true,
    'an effect with no unsupported borrowing must remain admissible');
});

test('generated Economy events expose bounded qualitative national coverage without a new GDP writer', () => {
  for (const key of ['jumpForward','autoJumpForward']) {
    const schema = GAMEPLAY_TOOLS[key].schema.properties.events.items.properties.economicAccounting;
    assert.equal(schema.properties.exposures.type,'array');
    assert.equal(schema.properties.exposures.maxItems,8);
    assert.deepEqual(schema.properties.exposures.items.required,['polity','channel','exposure','evidence']);
    assert.equal(schema.properties.exposures.items.additionalProperties,false);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});
