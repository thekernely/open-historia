import test from "node:test";
import assert from "node:assert/strict";
import { addGameDays } from "./gameDates.js";
import { deriveDatedBlockadeCharges, validateDatedBlockadeEvidence } from "./statsNavalEconomicPort.js";

const days = (from, count, country = "Aland", pressure = 1) => Array.from({ length: count }, (_, i) => ({
  country, date: addGameDays(from, i + 1), pressure, covered: 0.5, by: ["Borduria"],
}));

const input = (fromDate, toDate, blockadeDays) => ({ fromDate, toDate, blockadeDays });

test("complete zero-pressure evidence is zero-cost, unavailable evidence is not zero", () => {
  assert.deepEqual(deriveDatedBlockadeCharges(input("1914-01-01", "1914-02-01", [])), []);
  assert.equal(deriveDatedBlockadeCharges(input("1914-01-01", "1914-02-01", null)), null);
  assert.equal(deriveDatedBlockadeCharges(input("1914-01-01", "1914-02-01", undefined)), null);
});

test("one year of full blockade retains the old annual severity without period-dependent rounding", () => {
  const result = deriveDatedBlockadeCharges(input("1913-01-01", "1914-01-01", days("1913-01-01", 365)));
  assert.equal(result.length, 1);
  assert.equal(result[0].pressureDays, 365);
  assert.ok(Math.abs(result[0].gdpFactor - 0.8) < 1e-12);
  assert.equal(result[0].budgetBalanceDelta, -6);
});

test("one long skip and arbitrary partitions have identical loss under identical daily observations", () => {
  const allDays = days("1914-01-01", 365, "Aland", 0.37);
  const all = deriveDatedBlockadeCharges(input("1914-01-01", "1915-01-01", allDays))[0];
  const stops = ["1914-01-31", "1914-02-28", "1914-05-15", "1914-09-01", "1915-01-01"];
  let before = "1914-01-01", factor = 1, delta = 0;
  for (const toDate of stops) {
    const chunk = allDays.filter((row) => row.date > before && row.date <= toDate);
    const [result] = deriveDatedBlockadeCharges(input(before, toDate, chunk));
    factor *= result.gdpFactor;
    delta += result.budgetBalanceDelta;
    before = toDate;
  }
  assert.ok(Math.abs(factor - all.gdpFactor) < 1e-12, `${factor} !== ${all.gdpFactor}`);
  assert.ok(Math.abs(delta - all.budgetBalanceDelta) < 1e-12);
});

test("subthreshold pressure and blockade liberation retain only real pressure-days", () => {
  const week = days("1914-08-01", 7, "Aland", 0.011);
  const full = deriveDatedBlockadeCharges(input("1914-08-01", "1914-12-01", week))[0];
  assert.equal(full.activeDays, 7);
  assert.ok(full.pressureDays > 0 && full.gdpFactor < 1);
  assert.deepEqual(deriveDatedBlockadeCharges(input("1914-08-08", "1914-12-01", [])), []);
});

test("bad dates, impossible pressure, duplicate country-days and over-limit evidence fail closed", () => {
  const from = "1914-08-01", until = "1914-08-31", [valid] = days(from, 1);
  for (const invalid of [
    { ...valid, date: from }, { ...valid, date: "1914-09-01" }, { ...valid, date: "1914-8-02" },
    { ...valid, pressure: -1 }, { ...valid, pressure: NaN }, { ...valid, pressure: 1.1 },
    { ...valid, country: "" }, { ...valid, by: [] }, { ...valid, covered: Infinity },
  ]) assert.equal(validateDatedBlockadeEvidence(input(from, until, [invalid])), null);
  assert.equal(validateDatedBlockadeEvidence(input(from, until, [valid, { ...valid, country: "aland" }])), null);
  assert.equal(validateDatedBlockadeEvidence(input(from, until, Array(12001).fill(valid))), null);
  assert.equal(validateDatedBlockadeEvidence(input("not-a-date", until, [valid])), null);
});
