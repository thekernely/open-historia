import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const clientSource = await readFile(new URL("./politicalPressureClient.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("./politicalPressureWorker.js", import.meta.url), "utf8");

test("political pressure simulation is worker-only and has no main-thread compute fallback", () => {
  assert.match(clientSource, /new Worker\(/);
  assert.match(clientSource, /openhistoria-political-pressure/);
  assert.match(clientSource, /worker-unavailable/);
  assert.doesNotMatch(clientSource, /advancePoliticalPressureBatch\s*\(/);
});

test("worker receives the compact political-pressure payload rather than importing game/world state", () => {
  assert.match(workerSource, /advancePoliticalPressureBatch/);
  assert.doesNotMatch(workerSource, /gameState|readWorldState|readGameStateBundle|regionOwnership|MapLibre/i);
});
