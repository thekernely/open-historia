import test from "node:test";
import assert from "node:assert/strict";
import { reviewScenarioNationalMetricAliases } from "./statsMetricAliasReview.js";

const definition = (stats = []) => ({ sections: [{ key: "economy", label: "Economy", stats }] });
const metric = (key, label = key) => ({ key, label, kind: "number" });

test("Czech GDP disagreement is reported without choosing, normalizing or mutating either value", () => {
  const def = definition([metric("gdp", "Nominal GDP"), metric("publicDebt")]);
  const sheet = { economy: { gdp: 297_500_000_000, publicDebt: 43 }, customStats: { gdp: 300_000_000_000, publicDebt: 45 } };
  const before = structuredClone(sheet);
  const report = reviewScenarioNationalMetricAliases(def, sheet);
  assert.deepEqual(report.map(({ key, status }) => [key, status]), [["gdp", "different"], ["publicDebt", "different"]]);
  assert.equal(report[0].nativePath, "economy.gdp");
  assert.equal(report[0].customPath, "customStats.gdp");
  assert.equal(report[0].nativeValue, 297_500_000_000);
  assert.equal(report[0].customValue, 300_000_000_000);
  assert.ok(report.every((row) => row.reviewRequired));
  assert.deepEqual(sheet, before);
  assert.equal(def.sections[0].stats[0].key, "gdp");
});

test("identical readings still have separate authorities and require review", () => {
  const report = reviewScenarioNationalMetricAliases(definition([metric("gdp")]), {
    economy: { gdp: 100 }, customStats: { gdp: 100 },
  });
  assert.equal(report[0].status, "same-reading");
  assert.equal(report[0].reviewRequired, true);
});

test("missing is not zero, while legitimate zero remains a concrete comparison", () => {
  const def = definition([metric("publicDebt"), metric("inflation")]);
  const report = reviewScenarioNationalMetricAliases(def, { economy: { publicDebt: 0 }, customStats: { publicDebt: 0, inflation: 2 } });
  assert.deepEqual(report.map((r) => [r.status, r.nativeValue, r.customValue]), [
    ["same-reading", 0, 0], ["native-unset", null, 2],
  ]);
  const missing = reviewScenarioNationalMetricAliases(def, { economy: { publicDebt: 0 }, customStats: { inflation: 0 } });
  assert.equal(missing[0].status, "custom-unset");
  assert.equal(missing[0].customValue, null);
});

test("legitimate different semantic keys are never matched on similar labels or substrings", () => {
  const def = definition([metric("gdpPPP", "GDP"), metric("grain", "GDP"), metric("gdpGrowthPerMonth", "GDP growth")]);
  assert.deepEqual(reviewScenarioNationalMetricAliases(def, {
    economy: { gdp: 700, gdpGrowth: 4 },
    customStats: { gdpPPP: 900, grain: 3, gdpGrowthPerMonth: 2 },
  }), []);
});

test("non-custom standard sheets have no parallel custom ledger candidates", () => {
  assert.deepEqual(reviewScenarioNationalMetricAliases(null, { economy: { gdp: 12 }, customStats: { gdp: 3 } }), []);
  assert.deepEqual(reviewScenarioNationalMetricAliases({ custom: false, ...definition([metric("gdp")]) }, { economy: { gdp: 12 }, customStats: { gdp: 3 } }), []);
});

test("population, stability, sector and derived per-capita references are read without recomputation", () => {
  const def = definition([metric("totalPopulation"), metric("nationalStability"), metric("agricultureShare"), metric("gdpPerCapita")]);
  const report = reviewScenarioNationalMetricAliases(def, {
    population: { total: 2_000_000 }, stability: 70, gdpBreakdown: { agriculture: 25 }, economy: { gdp: 100_000_000 },
    customStats: { totalPopulation: 2_000_000, nationalStability: 65, agricultureShare: 30, gdpPerCapita: 50 },
  });
  assert.deepEqual(report.map((row) => row.status), ["same-reading", "different", "different", "native-unset"]);
  assert.equal(report[3].nativeValue, null); // no fabricated GDP/person using a possibly different scope
});

test("scenario-wide review counts matching duplicates and numeric disagreements without changing readiness or state", async () => {
  const { summarizeScenarioNationalMetricAliasReviews, serializeScenarioNationalMetricReviewCsv } = await import("./statsMetricAliasReview.js");
  const def = definition([metric("gdp"), metric("inflation"), metric("publicDebt"), metric("foodAutonomy")]);
  const world = { countryStats: {
    Latvia: { economy: { gdp: 100, inflation: 0, publicDebt: 30 }, customStats: { gdp: 100, inflation: 5, publicDebt: 30, foodAutonomy: 60 } },
    Estonia: { economy: { gdp: 80, inflation: 2 }, customStats: { gdp: 90, inflation: 2 } },
    Lithuania: { economy: { gdp: 250 }, customStats: { foodAutonomy: 80 } },
  } };
  const original = structuredClone(world);
  const roster = [{ code: "Estonia", name: "Estonia" }, { code: "Latvia", name: "Latvia" }, { code: "Latvia", name: "Duplicate seat" }, { code: "Lithuania", name: "Lithuania" }];
  const report = summarizeScenarioNationalMetricAliasReviews(def, world, roster);
  assert.deepEqual([report.countries, report.matching, report.conflicting, report.rows.length], [2, 3, 2, 5]);
  assert.deepEqual(report.rows.map((r) => [r.countryCode, r.key, r.status]), [
    ["Estonia", "gdp", "different"], ["Estonia", "inflation", "same-reading"],
    ["Latvia", "gdp", "same-reading"], ["Latvia", "inflation", "different"], ["Latvia", "publicDebt", "same-reading"],
  ]);
  assert.deepEqual(world, original);
  const csv = serializeScenarioNationalMetricReviewCsv(report);
  assert.equal(csv.trimEnd().split("\r\n").length, 6);
  assert.match(csv, /"Latvia","Latvia","inflation","economy.inflation","0","customStats.inflation","5","different","yes"/);
});

test("native-bound renamed cards disclose orphan legacy copies, without multiplying a duplicate through repeat GDP cards", () => {
  const def = { custom: true, sections: [{ key: "overview", label: "Overview", stats: [
    { key: "gdpHero", label: "GDP headline", nativeMetric: "gdp", kind: "currency" },
    { key: "gdpDetails", label: "GDP details", nativeMetric: "gdp", kind: "currency" },
  ] }] };
  const sheet = { economy: { gdp: 100 }, customStats: { gdp: 80, gdpHero: 100 } };
  const original = structuredClone(sheet);
  const report = reviewScenarioNationalMetricAliases(def, sheet);
  assert.deepEqual(report.map((r) => [r.key, r.status]), [["gdpHero", "same-reading"], ["gdp", "different"]]);
  assert.ok(report.every((r) => r.reviewRequired));
  assert.deepEqual(sheet, original);
  assert.deepEqual(reviewScenarioNationalMetricAliases(def, { economy: { gdp: 100 }, customStats: { foodAutonomy: 50 } }), []);
});

test("CSV export escapes spreadsheet formulas, commas and quotes in authored country names without rounding numeric evidence", async () => {
  const { serializeScenarioNationalMetricReviewCsv } = await import("./statsMetricAliasReview.js");
  const report = { rows: [{ countryCode: "=SUM(1)", countryName: '+cmd,"bad"', key: "gdp", nativePath: "economy.gdp",
    nativeValue: 297500000000, customPath: "customStats.gdp", customValue: 300000000000, status: "different", reviewRequired: true }] };
  const csv = serializeScenarioNationalMetricReviewCsv(report);
  assert.match(csv, /^"Country code","Country"/);
  assert.match(csv, /"'=SUM\(1\)","'\+cmd,""bad"""/);
  assert.match(csv, /"297500000000"/);
  assert.match(csv, /"300000000000"/);
  assert.equal(csv.split("\r\n").length, 3); // includes final blank line
});


test("CSV preserves negative and zero numeric statistics without mistaking them for spreadsheet expressions", async () => {
  const { serializeScenarioNationalMetricReviewCsv } = await import("./statsMetricAliasReview.js");
  const csv = serializeScenarioNationalMetricReviewCsv({ rows: [{
    countryCode: "Latvia", countryName: "Latvia", key: "budgetBalance", nativePath: "economy.budgetBalance", nativeValue: -5,
    customPath: "customStats.budgetBalance", customValue: 0, status: "different", reviewRequired: true,
  }] });
  assert.match(csv, /"economy.budgetBalance","-5","customStats.budgetBalance","0","different"/);
  assert.doesNotMatch(csv, /"'-5"/);
});
