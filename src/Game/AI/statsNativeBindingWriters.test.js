/*! Contract: native-bound national cards never enter legacy AI value writers. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");

test("periodic AI auditing exits before examining or writing native-bound sheet values", () => {
  const body = source.slice(source.indexOf("const refreshTrackedCustomStatsIfDue"), source.indexOf("const requestConflictSheets", source.indexOf("const refreshTrackedCustomStatsIfDue")) > -1 ? source.indexOf("const requestConflictSheets", source.indexOf("const refreshTrackedCustomStatsIfDue")) : undefined);
  assert.match(body, /if \(nationalStatsAuthoringContract\(definition\)\.boundRows\.length\) return world;/);
  assert.ok(body.indexOf("nationalStatsAuthoringContract(definition).boundRows.length") < body.indexOf("askTrackedStats("));
});

test("direct player-first-reading AI generation refuses to regenerate any bound national baseline", () => {
  const body = source.slice(source.indexOf("export const generateCountryStatSheet ="));
  assert.match(body, /if \(nationalStatsAuthoringContract\(statSheetDefinition\)\.boundRows\.length\)/);
  assert.match(body, /nationalStatsPresentationCoverage\(statSheetDefinition, existing\)\.ready/);
  assert.ok(body.indexOf("nationalStatsAuthoringContract(statSheetDefinition).boundRows.length") < body.indexOf("return generateScenarioCustomStatSheet({"));
});

test("background and multiplayer first readings honor native-bound display readiness", () => {
  const body = source.slice(source.indexOf("export const ensureCountryStatSheet ="), source.indexOf("const generateScenarioCustomStatSheet ="));
  assert.equal((body.match(/nationalStatsPresentationCoverage\(definition, persisted\)\.ready/g) || []).length, 2);
  assert.match(body, /if \(nativeBound && needBackend && complete\) throw new Error/);
});
