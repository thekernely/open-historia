import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const responseSource = await readFile(new URL("./politicalResponse.js", import.meta.url), "utf8");

test("political response is a native pure calculation layer, not an AI or timeline-event generator", () => {
  assert.doesNotMatch(responseSource, /from\s+["\'][^"\']*(?:Game\/AI|gameplay)[^"\']*["\']/i);
  assert.doesNotMatch(responseSource, /(?:createEvent|eventImpact|chatCompletion|openai|anthropic|gemini)\s*\(/i);
  assert.match(responseSource, /POLITICAL_ACTOR_OPS\.SET_PARTY_SUPPORT/);
  assert.match(responseSource, /POLITICAL_ACTOR_OPS\.SET_POWER_BLOC_INFLUENCE/);
});

test("Phase005C2 does not silently become the political clock or write canonical world state itself", () => {
  assert.doesNotMatch(responseSource, /(?:setInterval|setTimeout|readGameState|writeGameState|saveGame)\s*\(/i);
  assert.match(responseSource, /Phase005C3 owns the/i);
  assert.match(responseSource, /clock\/cadence/i);
});
