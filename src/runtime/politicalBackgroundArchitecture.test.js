import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(here, name), "utf8");

test("Phase005C3 keeps structural politics native and does not turn it into an AI/event generator", () => {
  const structural = read("politicalStructuralPressure.js");
  const background = read("politicalBackground.js");
  const kernel = read("politicalBackgroundKernel.js");
  for (const source of [structural, background, kernel]) {
    assert.doesNotMatch(source, /runJsonTask|openai|timelineCurator|nativeWorldDirector/i);
    assert.doesNotMatch(source, /writeEventsState|eventUpdates|generate.*event/i);
  }
  assert.match(background, /advancePoliticalBackgroundBatchInWorker/);
  assert.match(background, /applyPoliticalActorOperations/);
  assert.match(kernel, /advancePoliticalPressureBatch/);
  assert.match(kernel, /advancePoliticalResponseBatch/);
});

test("Phase005C3 keeps multi-tick political response work off the UI thread with no compute fallback", () => {
  const client = read("politicalBackgroundClient.js");
  const worker = read("politicalBackgroundWorker.js");
  assert.match(client, /new Worker/);
  assert.match(client, /politicalBackgroundWorker\.js/);
  assert.match(client, /NO main-thread compute fallback/);
  assert.doesNotMatch(client, /advancePoliticalBackgroundKernel/);
  assert.match(worker, /advancePoliticalBackgroundKernel/);
});

test("Phase005C3 structural derivation reads canonical ledgers and does not claim ownership of them", () => {
  const structural = read("politicalStructuralPressure.js");
  assert.match(structural, /countryStats/);
  assert.match(structural, /relations/);
  assert.match(structural, /wars/);
  assert.doesNotMatch(structural, /writeWorldState|applyWarUpdates|applyDiplomaticUpdates|mergeCountryStatPatch/);
});

test("the actual turn pipeline invokes political background after due Stats refresh and before persistence", () => {
  const gameplay = fs.readFileSync(path.join(here, "../Game/AI/gameplay.js"), "utf8");
  const statsIndex = gameplay.indexOf("refreshTrackedCountryStatsIfDue");
  const politicsIndex = gameplay.indexOf("advancePoliticalBackgroundSimulation({");
  const writeIndex = gameplay.indexOf("writeWorldState(nextWorld)", politicsIndex);
  assert.ok(statsIndex >= 0);
  assert.ok(politicsIndex > statsIndex);
  assert.ok(writeIndex > politicsIndex);
});
