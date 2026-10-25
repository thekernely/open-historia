import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEventEntry, normalizeEvents } from './gameState.js';

const impact = { status:'unquantified', reason:'Coal production disruption requires measured output evidence.' };
test('accepted but unquantified economic evidence survives canonical event normalization and reload', () => {
  const event = {id:'e1912',date:'1912-01-25',title:'British strike',description:'Mining stopped.',tags:['Economy'],economicAccounting:impact};
  const normalized = normalizeEventEntry(event);
  assert.deepEqual(normalized.economicAccounting,impact);
  assert.deepEqual(normalizeEvents(JSON.parse(JSON.stringify([normalized])))[0].economicAccounting,impact);
});
test('legacy events remain readable, malformed declarations never become canonical', () => {
  assert.equal(normalizeEventEntry({title:'Old event'}).economicAccounting,undefined);
  assert.equal(normalizeEventEntry({title:'Bad',economicAccounting:{status:'applied',reason:''}}).economicAccounting,undefined);
});
