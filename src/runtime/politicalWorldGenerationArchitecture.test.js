import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./politicalWorldGeneration.js", import.meta.url), "utf8");

test("Phase006A is a native validation/planning contract, not an AI caller or runtime simulator", () => {
  assert.doesNotMatch(source, /fetch\s*\(|OpenAI|anthropic|generateContent|simulateTimelineJump|nativeWorldDirector/i);
  assert.doesNotMatch(source, /behavioralDisposition\s*[:=]\s*\{/);
  assert.match(source, /FORBIDDEN_GENERATED_FIELDS/);
});

test("Phase006A encodes bounded relevance batching and missing-only application", () => {
  assert.match(source, /Math\.min\(12/);
  assert.match(source, /allowEntityExpansion/);
  assert.match(source, /mergeMissingPoliticalActor/);
  assert.match(source, /scenario-date boundary/);
});
