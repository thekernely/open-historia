import test from "node:test";
import assert from "node:assert/strict";
import { JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA, GAMEPLAY_TOOLS } from "./gameplaySchemas.js";

const effects = (schema) => schema.properties.events.items.properties.impacts
  .properties.polityChanges.items.properties.statsEffects;

test("ordinary turns and GM can each emit strictly typed national effects", () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    const stat = effects(schema);
    assert.equal(stat.type, "object");
    assert.equal(stat.additionalProperties, false);
    assert.deepEqual(stat.properties.populationCause.enum, ["births", "deaths", "immigration", "emigration"]);
    assert.deepEqual(stat.properties.gdpCause.enum, ["production", "destruction", "trade", "policy"]);
    assert.equal(stat.properties.populationChange.type, "integer");
    assert.equal(stat.properties.gdpChangePercent.type, "number");
    assert.deepEqual(stat.required, ["reason"]);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});


test('both provider transports expose bounded relative strategic effect proposals', () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    const stat = effects(schema);
    assert.equal(stat.properties.stabilityDelta.type, 'integer');
    assert.equal(stat.properties.stabilityDelta.minimum, -20);
    assert.equal(stat.properties.indexDeltas.maxProperties, 12);
    assert.equal(stat.properties.indexDeltas.additionalProperties.type, 'integer');
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});

test('both provider transports expose exact-event finite influence resolutions', () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    const value = effects(schema).properties.resolveGrowthInfluenceEventId;
    assert.equal(value.type,'string');
    if (schema === GAME_MASTER_SCHEMA) assert.match(value.description,/EXACT canonical source event ID/);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});

test('jump and Game Master schemas expose optional causal storyline identity', () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    const source = effects(schema).properties.sourceStorylineId;
    assert.equal(source.type, 'string');
    assert.equal(effects(schema).required.includes('sourceStorylineId'), false);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});

test('jump and Game Master schemas expose guarded event-linked strategic or resource recovery', () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    assert.equal(effects(schema).properties.recoveryOfEventId.type, 'string');
    assert.equal(effects(schema).required.includes('recoveryOfEventId'), false);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length < 28200);
});

test('both transports distinguish one-off borrowed outlays from military ratings and deficits',()=>{
  for (const schema of [JUMP_FORWARD_SCHEMA,GAME_MASTER_SCHEMA]) {
    const row=effects(schema).properties;
    assert.equal(row.debtFinancedOutlayPercentGdp.type,'number');
    assert.equal(row.debtFinancedOutlayPercentGdp.minimum,0.0001);
    assert.equal(row.debtFinancedOutlayPercentGdp.maximum,5);
    assert.deepEqual(row.debtFinancedOutlayCause.enum,['procurement','mobilization','relief','reconstruction']);
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length<28200);
});

test('both provider transports expose an explicitly estimated, bounded crisis mechanism', () => {
  for (const schema of [JUMP_FORWARD_SCHEMA, GAME_MASTER_SCHEMA]) {
    const shape=effects(schema).properties.economicShockEstimate;
    assert.equal(shape.additionalProperties,false);
    assert.deepEqual(shape.required,['basis','channel','exposure','evidence']);
    assert.deepEqual(shape.properties.basis.enum,['simulation-estimate']);
    assert.deepEqual(shape.properties.exposure.enum,['direct','dependent']);
    assert.ok(shape.properties.channel.enum.includes('credit'));
  }
  assert.ok(JSON.stringify(GAMEPLAY_TOOLS.jumpForward.schema).length<28200);
});
