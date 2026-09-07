import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./politicalDecisionContext.js", import.meta.url), "utf8");

test("Phase009A is a read-only native projection, not an AI caller or political-state owner", () => {
  assert.doesNotMatch(source, /callAI\s*\(|fetch\s*\(|generateContent|OpenAI|anthropic|gemini/i);
  assert.doesNotMatch(source, /writeWorldState|applyPoliticalActor|ensurePoliticalProfile|Math\.random/);
  assert.match(source, /read-only projection/i);
  assert.match(source, /does not authorize changing canonical political state/i);
});

test("Phase009A keeps Political Actors authoritative and does not route politics through Stats", () => {
  assert.match(source, /getPoliticalProfile/);
  assert.match(source, /normalizePoliticalPressureState/);
  assert.match(source, /buildPoliticalKnowledgeView/);
  assert.doesNotMatch(source, /countryStats|buildCompactEconomicContext|Stats generator/i);
});

test("Phase009A encodes the actor knowledge boundary and reality-perception separation", () => {
  assert.match(source, /private political state in this capsule belongs ONLY to the named actor/i);
  assert.match(source, /actor perceptions are beliefs and may be wrong/i);
  assert.match(source, /Counterpart hidden traits\/fears\/perceptions\/disposition are intentionally absent/i);
  assert.match(source, /safeCounterpartKnowledgeLevel/);
  assert.match(source, /POLITICAL_KNOWLEDGE_LEVELS\.PUBLIC/);
});

test("Phase009A remains a shared seam and does not prematurely wire World Director or Diplomatic Chat", () => {
  assert.doesNotMatch(source, /nativeWorldDirector|gameplay\.js|defaultPrompts|worldDirectorWorker/);
  assert.match(source, /buildPoliticalDecisionContext/);
  assert.match(source, /buildBoundedPoliticalDecisionContextSet/);
});
