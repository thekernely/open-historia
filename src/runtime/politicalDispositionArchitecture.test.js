import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(here, name), "utf8");

test("Phase005C4 disposition is native deterministic calculation, not an AI/event generator", () => {
  const source = read("politicalDisposition.js");
  assert.doesNotMatch(source, /fetch\s*\(|openai|anthropic|gemini|generateContent|timeline|world event/i);
  assert.match(source, /structured canonical inputs/i);
  assert.match(source, /does NOT parse ideology\/goals\/fears\/ambitions prose/i);
});

test("Phase005C4 does not yet wire disposition into World Director behavior", () => {
  const disposition = read("politicalDisposition.js");
  const kernel = read("politicalBackgroundKernel.js");
  assert.doesNotMatch(disposition, /nativeWorldDirector|promptContext|gameplay\.js/);
  assert.match(kernel, /advancePoliticalDispositionBatch/);
});
