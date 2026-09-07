import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const gameplay = fs.readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");
const prompts = fs.readFileSync(new URL("./gameplayPrompts.js", import.meta.url), "utf8");
const schemas = fs.readFileSync(new URL("./gameplaySchemas.js", import.meta.url), "utf8");
const context = fs.readFileSync(new URL("./politicalDecisionContext.js", import.meta.url), "utf8");

test("events and decisions have a structured institution membership mutation channel", () => {
  assert.match(gameplay, /joining\/leaving an alliance, union, organization, pact or regional bloc MUST emit institutionUpdates/i);
  assert.match(schemas, /institutionUpdates/);
  assert.match(gameplay, /applyInstitutionUpdates\(/);
  assert.match(gameplay, /refreshPowerStatus\(/);
});

test("Round Zero compiles formal institutions alongside relations, agreements and wars", () => {
  assert.match(gameplay, /institution:active/);
  assert.match(gameplay, /date=institution founding\/establishment date/);
  assert.match(gameplay, /enforceTemporalBaseline: true/);
  assert.match(gameplay, /agreement start\/effective date/);
  assert.match(gameplay, /allowUnboundBaseline: true/);
  assert.match(gameplay, /ensureObjectiveConflictRelations\(/);
});

test("Political Decision Context consumes formal institutions without making badges authoritative", () => {
  assert.match(context, /institutionsForPolity|buildInstitutionContext/);
  assert.match(context, /institution/i);
});
