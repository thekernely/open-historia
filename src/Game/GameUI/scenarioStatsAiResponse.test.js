/*! Regression tests for accepted single-country/multi-country AI envelopes. */
import test from "node:test";
import assert from "node:assert/strict";
import { interpretScenarioStatsAiResponse, buildScenarioStartingStatsTool } from "./scenarioStatsAiResponse.js";

const russia = [{ code: "Russian Empire", name: "Russian Empire" }];
const stats = { macro: [{ index: 1, population: 1200000, gdpPerCapita: 500 }] };
const get = (answer, expected = russia) => interpretScenarioStatsAiResponse(answer, expected);

test("normal countries-array JSON text from actual callAI envelope", () => {
  const answer = { rawText: JSON.stringify({ countries: [{ code: "Russian Empire", ...stats }] }), toolInput: null };
  assert.deepEqual(get(answer)["Russian Empire"].row.macro, stats.macro);
});

test("accepts a single-country result object instead of forcing countries[] wrapper", () => {
  assert.deepEqual(get({ rawText: JSON.stringify({ code: "Russian Empire", ...stats }), toolInput: null })["Russian Empire"].row.macro, stats.macro);
  assert.deepEqual(get({ rawText: JSON.stringify({ country: { code: "Russian Empire", ...stats } }), toolInput: null })["Russian Empire"].row.macro, stats.macro);
});

test("supports a country-keyed object without inventing a different country's identity", () => {
  assert.deepEqual(get({ countries: { "Russian Empire": stats } })["Russian Empire"].row.macro, stats.macro);
  assert.deepEqual(get({ "Russian Empire": stats })["Russian Empire"].row.macro, stats.macro);
});

test("matches explicit human display name when code was omitted but name is exact", () => {
  assert.deepEqual(get({ countries: [{ name: "Russian Empire", ...stats }] })["Russian Empire"].row.macro, stats.macro);
});

test("does not misassign another country's figures or anonymous records", () => {
  const other = get({ countries: [{ code: "French Republic", ...stats }] })["Russian Empire"];
  assert.equal(other.row, null);
  assert.match(other.error, /Received: French Republic/);
  const unnamed = get({ countries: [stats] })["Russian Empire"];
  assert.equal(unnamed.row, null);
  assert.match(unnamed.error, /unlabelled/);
});

test("an explicit mismatched code cannot be laundered through a matching display name", () => {
  const result = get({ countries: [{ code: "French Republic", name: "Russian Empire", ...stats }] })["Russian Empire"];
  assert.equal(result.row, null);
});

test("duplicate identity remains a hard rejection", () => {
  const result = get({ countries: [
    { code: "Russian Empire", ...stats }, { code: "russian empire", ...stats },
  ] })["Russian Empire"];
  assert.equal(result.row, null);
  assert.match(result.error, /duplicate/);
});

test("multi-country batches cannot mix up source records", () => {
  const france = { code: "French Republic", name: "French Republic" };
  const payload = { countries: [{ code: france.code, macro: [1] }, { code: "Russian Empire", macro: [2] }] };
  const result = get(payload, [russia[0], france]);
  assert.deepEqual(result["Russian Empire"].row.macro, [2]);
  assert.deepEqual(result[france.code].row.macro, [1]);
});

test("invalid/non-JSON replies describe missing records without falsely succeeding", () => {
  const result = get({ rawText: "Sorry, I cannot supply statistics", toolInput: null })["Russian Empire"];
  assert.equal(result.row, null);
  assert.match(result.error, /no usable country records/);
});


test("native scenario alias resolution is allowed only when it identifies the selected canonical polity", () => {
  const answer = { countries: [{ code: "Russia", ...stats }] };
  const resolved = interpretScenarioStatsAiResponse(answer, russia, { resolveIdentity: (name) => name === "Russia" ? "Russian Empire" : name });
  assert.deepEqual(resolved["Russian Empire"].row.macro, stats.macro);
  assert.equal(get(answer)["Russian Empire"].row, null);
});

test("a countries object may itself be a single identified country", () => {
  assert.deepEqual(get({ countries: { code: "Russian Empire", ...stats } })["Russian Empire"].row.macro, stats.macro);
});


test("declares one mandatory schema-enforced slot per exact requested country", () => {
  const targets = [
    { code: "Dominion of Canada", name: "Dominion of Canada" },
    { code: "Dominion of New Zealand", name: "Dominion of New Zealand" },
    { code: "Dutch East Indies", name: "Dutch East Indies" },
  ];
  const output = buildScenarioStartingStatsTool(targets);
  assert.equal(output.name, "submit_scenario_starting_statistics");
  assert.deepEqual(output.schema.required, [
    "country1Json", "country1PublicDebt", "country1BudgetBalance",
    "country2Json", "country2PublicDebt", "country2BudgetBalance",
    "country3Json", "country3PublicDebt", "country3BudgetBalance",
  ]);
  assert.deepEqual(output.schema.properties.country1PublicDebt, {
    type: "number", minimum: 0, maximum: 1000,
    description: output.schema.properties.country1PublicDebt.description,
  });
  assert.deepEqual(output.schema.properties.country2BudgetBalance, {
    type: "number", minimum: -1000, maximum: 1000,
    description: output.schema.properties.country2BudgetBalance.description,
  });
  assert.ok(output.schema.properties.country1Json.description.includes("Dominion of Canada"));
  assert.ok(output.schema.properties.country2Json.description.includes("Dominion of New Zealand"));
  assert.ok(output.schema.properties.country3Json.description.includes("Dutch East Indies"));
  assert.equal(output.schema.additionalProperties, false);
  assert.throws(() => buildScenarioStartingStatsTool([]), /1 to 3/);
  assert.throws(() => buildScenarioStartingStatsTool([...targets, ...targets]), /1 to 3/);
});

test("binds Canada, New Zealand and East Indies by native slots without AI abbreviations", () => {
  const expected = [
    { code: "Dominion of Canada", name: "Dominion of Canada" },
    { code: "Dominion of New Zealand", name: "Dominion of New Zealand" },
    { code: "Dutch East Indies", name: "Dutch East Indies" },
  ];
  const answer = { toolInput: {
    country1Json: JSON.stringify({ ...stats, gdpGrowth: 1 }), country1PublicDebt: 12, country1BudgetBalance: -1,
    country2Json: JSON.stringify({ ...stats, gdpGrowth: 2 }), country2PublicDebt: 35, country2BudgetBalance: -2,
    country3Json: JSON.stringify({ ...stats, gdpGrowth: 3 }), country3PublicDebt: 64, country3BudgetBalance: 0,
  }, rawText: "" };
  const result = get(answer, expected);
  for (const [index, target] of expected.entries()) {
    assert.equal(result[target.code].error, "");
    assert.equal(result[target.code].row.code, target.code);
    assert.equal(result[target.code].row.gdpGrowth, index + 1);
    assert.equal(result[target.code].row.publicDebt, [12, 35, 64][index]);
    assert.equal(result[target.code].row.budgetBalance, [-1, -2, 0][index]);
  }
});

test("conflicting country identity inside schema-assigned slot fails closed", () => {
  const expected = [
    { code: "Dominion of Canada", name: "Dominion of Canada" },
    { code: "Dominion of New Zealand", name: "Dominion of New Zealand" },
  ];
  const result = get({ toolInput: {
    country1Json: JSON.stringify({ code: "NZL", ...stats }), country1PublicDebt: 20, country1BudgetBalance: 0,
    country2Json: JSON.stringify({ ...stats }), country2PublicDebt: 30, country2BudgetBalance: 0,
  } }, expected);
  assert.equal(result[expected[0].code].row, null);
  assert.match(result[expected[0].code].error, /conflicting country identity NZL/);
  assert.equal(result[expected[1].code].error, "");
});

test("missing or unexpected native slots cannot be assigned to another country", () => {
  const expected = [{ code: "French Indochina", name: "French Indochina" }, { code: "Ethiopia", name: "Ethiopia" }];
  let result = get({ toolInput: { country2Json: JSON.stringify(stats) } }, expected);
  assert.equal(result[expected[0].code].row, null);
  assert.match(result[expected[1].code].error, /numeric publicDebt/);
  result = get({ toolInput: { country1Json: JSON.stringify(stats), country9Json: JSON.stringify(stats) } }, expected);
  assert.equal(result[expected[0].code].row, null);
  assert.match(result[expected[0].code].error, /unrequested country slot/);
});

test("accepts native provider toolInput containing countriesJson as serialized JSON", () => {
  const answer = { rawText: "", toolInput: { countriesJson: JSON.stringify([{ code: "Russian Empire", ...stats }]) } };
  assert.deepEqual(get(answer)["Russian Empire"].row.macro, stats.macro);
});

test("accepts provider JSON-text fallback matching declared tool schema", () => {
  const answer = { rawText: JSON.stringify({ countriesJson: JSON.stringify([{ code: "Russian Empire", ...stats }]) }), toolInput: null };
  assert.deepEqual(get(answer)["Russian Empire"].row.macro, stats.macro);
});

test("malformed tool country array fails closed without guessing a country", () => {
  const answer = { toolInput: { countriesJson: "not JSON" }, rawText: "" };
  const result = get(answer)["Russian Empire"];
  assert.equal(result.row, null);
  assert.match(result.error, /no usable country records/);
  assert.match(result.error, /countriesJson tool field did not contain a JSON array/);
});

test("tool transport still rejects swapped or duplicate country identities", () => {
  const wrong = get({ toolInput: { countriesJson: JSON.stringify([{ code: "Belgian Congo", ...stats }]) }, rawText: "" })["Russian Empire"];
  assert.equal(wrong.row, null);
  assert.match(wrong.error, /Belgian Congo/);
  const duplicated = get({ toolInput: { countriesJson: JSON.stringify([{ code: "Russian Empire", ...stats }, { code: "Russian Empire", ...stats }]) }, rawText: "" })["Russian Empire"];
  assert.equal(duplicated.row, null);
  assert.match(duplicated.error, /duplicate/);
});

test("the Scenario Editor uses the bounded per-batch tool schema", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /tool:\s*buildScenarioStartingStatsTool\(prepared\)/);
  assert.match(source, /OUTPUT TOOL SLOT: country/);
});


test("missing, invalid and conflicting mandatory fiscal tool scalars fail closed for the correct slot", () => {
  const expected = [{ code: "Abeyi Special Administrative Area", name: "Abeyi Special Administrative Area" }, { code: "Ambazonia", name: "Ambazonia" }];
  const good = {
    country1Json: JSON.stringify(stats), country1PublicDebt: 0, country1BudgetBalance: -3.5,
    country2Json: JSON.stringify(stats), country2PublicDebt: 120, country2BudgetBalance: 0,
  };
  assert.equal(get({ toolInput: good }, expected)[expected[0].code].row.publicDebt, 0);
  for (const value of [undefined, "40", null, -1, 1001, Infinity, NaN]) {
    const payload = { ...good, country1PublicDebt: value };
    const result = get({ toolInput: payload }, expected);
    assert.equal(result[expected[0].code].row, null);
    assert.match(result[expected[0].code].error, /numeric publicDebt/);
    assert.equal(result[expected[1].code].row.publicDebt, 120);
  }
  const conflicting = get({ toolInput: { ...good, country1Json: JSON.stringify({ ...stats, publicDebt: 98 }) } }, expected);
  assert.equal(conflicting[expected[0].code].row, null);
  assert.match(conflicting[expected[0].code].error, /conflicting publicDebt/);
  assert.equal(conflicting[expected[1].code].error, "");
  const extra = get({ toolInput: { ...good, country3PublicDebt: 80 } }, expected);
  assert.match(extra[expected[0].code].error, /unrequested country slot/);
  assert.equal(extra[expected[1].code].row, null);
});

test("required fiscal scalars survive JSON-text transport and preserve identity", () => {
  const target = [{ code: "Arab Republic of Egypt", name: "Arab Republic of Egypt" }];
  const toolInput = { country1Json: JSON.stringify(stats), country1PublicDebt: 63.4, country1BudgetBalance: -5.5 };
  const fromText = get({ rawText: JSON.stringify(toolInput), toolInput: null }, target);
  assert.deepEqual(fromText[target[0].code].row.macro, stats.macro);
  assert.equal(fromText[target[0].code].row.publicDebt, 63.4);
  assert.equal(fromText[target[0].code].row.budgetBalance, -5.5);
});

test("a slot with separately typed fiscal values produces a complete reviewed native country sheet", async () => {
  const { createReviewedScenarioStatsSheet, scenarioStatsRequiredReady } = await import("../../runtime/scenarioStatsAuthoring.js");
  const expected = [{ code: "Ambazonia", name: "Ambazonia" }];
  const row = {
    capital: "Buea", continent: "Africa", government: "Transitional administration", leader: "Scenario leader", stability: 46,
    indices: { sovereignty: 35, foodAutonomy: 48, energyAutonomy: 40, economicIndependence: 41, internalSecurity: 38, internationalReputation: 30 },
    gdpGrowth: 1.2, inflation: 3.4, unemployment: 15, currency: "scenario units",
    agriculture: 30, industry: 25, services: 45,
    macro: [{ index: 1, group: "core", population: 20000, gdpPerCapita: 450 }],
  };
  const resolved = get({ toolInput: { country1Json: JSON.stringify(row), country1PublicDebt: 27, country1BudgetBalance: -4 } }, expected);
  assert.equal(resolved.Ambazonia.error, "");
  const sheet = createReviewedScenarioStatsSheet({
    row: resolved.Ambazonia.row, date: "2026-01-01",
    basis: { plan: [{ geography: "Test Region" }], macroPlan: [{ index: 1, members: [{ geography: "Test Region", weight: 1 }] }] },
  });
  assert.equal(sheet.economy.publicDebt, 27);
  assert.equal(sheet.economy.budgetBalance, -4);
  assert.equal(scenarioStatsRequiredReady(sheet), true);
});

test("Gemini provider conversion retains the shallow required fiscal numeric fields", async () => {
  const { toGeminiSchema } = await import("../AI/geminiSchema.js");
  const tool = buildScenarioStartingStatsTool([{ code: "Ambazonia", name: "Ambazonia" }]);
  const converted = toGeminiSchema(tool.schema);
  assert.deepEqual(converted.required, ["country1Json", "country1PublicDebt", "country1BudgetBalance"]);
  assert.equal(converted.properties.country1PublicDebt.type, "number");
  assert.equal(converted.properties.country1PublicDebt.minimum, 0);
  assert.equal(converted.properties.country1BudgetBalance.minimum, -1000);
  assert.equal(converted.additionalProperties, undefined);
});
