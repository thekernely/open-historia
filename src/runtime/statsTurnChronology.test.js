import test from "node:test";
import assert from "node:assert/strict";
import { planNativeStatsTurnChronology as plan } from "./statsTurnChronology.js";
import { compareGameDates, diffGameDays } from "./gameDates.js";

const datum = (date, pressure = 0.5) => ({ country: "Aland", date, pressure, covered: 1, by: ["Borland"] });
const input = (args = {}) => ({ fromDate: "1912-01-01", toDate: "1912-03-31", events: [], blockadeDays: [], ...args });
const types = (steps) => steps.map((row) => `${row.type}:${row.date || row.toDate}`);

test("a 90-day leap-year skip has real month-end samples, and no invented month", () => {
  const steps = plan(input());
  assert.deepEqual(steps.filter((row) => row.type === "sample").map((row) => row.date),
    ["1912-01-31", "1912-02-29", "1912-03-31"]);
  assert.deepEqual(steps.filter((row) => row.type === "tick").map((row) => [row.fromDate, row.toDate]), [
    ["1912-01-01", "1912-01-31"], ["1912-01-31", "1912-02-29"], ["1912-02-29", "1912-03-31"],
  ]);
});

test("events land before their own civil day accrues, and after all earlier days", () => {
  const steps = plan(input({ toDate: "1912-02-16", events: [
    { id: "new-assessment", date: "1912-02-15" },
    { id: "output", date: "1912-02-15" },
  ] }));
  const boundary = steps.findIndex((row) => row.type === "events");
  assert.deepEqual(steps[boundary], { type: "events", date: "1912-02-15", indices: [0, 1] });
  assert.deepEqual(steps[boundary - 1], { type: "tick", fromDate: "1912-01-31", toDate: "1912-02-14", blockadeDays: [] });
  assert.deepEqual(steps[boundary + 1], { type: "tick", fromDate: "1912-02-14", toDate: "1912-02-15", blockadeDays: [] });
  assert.ok(steps.some((row) => row.type === "sample" && row.date === "1912-02-16"));
});

test("event on month end precedes the sample; same-day start event never replays the start day", () => {
  const steps = plan(input({ toDate: "1912-01-31", events: [
    { id: "begin", date: "1912-01-01" }, { id: "end", date: "1912-01-31" },
  ] }));
  assert.deepEqual(types(steps), [
    "events:1912-01-01", "tick:1912-01-30", "events:1912-01-31", "tick:1912-01-31", "sample:1912-01-31",
  ]);
});

test("dated positive naval observations are assigned exactly once, including event days", () => {
  const days = [datum("1912-01-02"), datum("1912-02-15", 0.2), datum("1912-03-01", 0.8)];
  const steps = plan(input({ events: [{ date: "1912-02-15" }], blockadeDays: days }));
  assert.deepEqual(steps.filter((row) => row.type === "tick").flatMap((row) => row.blockadeDays), days);
  assert.ok(steps.filter((row) => row.type === "tick").some((row) =>
    row.fromDate === "1912-02-14" && row.toDate === "1912-02-15" && row.blockadeDays[0]?.date === "1912-02-15"));
});

test("null evidence is unknown, while verified empty evidence is known zero", () => {
  assert.equal(plan(input({ blockadeDays: null })), null);
  assert.ok(Array.isArray(plan(input({ blockadeDays: [] }))));
  assert.equal(plan(input({ blockadeDays: [datum("1912-01-01")] })), null);
  assert.equal(plan(input({ blockadeDays: [datum("1912-02-15"), datum("1912-02-15")] })), null);
});

test("invalid, missing, reversed, out-of-range and unordered accepted events fail closed", () => {
  for (const events of [
    [{ id: "missing" }], [{ date: "1912-04-01" }], [{ date: "1911-12-31" }],
    [{ date: "1912-02-16" }, { date: "1912-02-15" }], [{ date: "1912-02-30" }],
  ]) assert.equal(plan(input({ events })), null);
  assert.equal(plan(input({ toDate: "1911-01-01" })), null);
  assert.equal(plan(input({ toDate: "1920-01-01" })), null);
  assert.equal(plan(input({ events: Array.from({ length: 1001 }, () => ({ date: "1912-01-01" })) })), null);
});

test("ancient signed BCE dates step over year zero without Gregorian-string ordering", () => {
  const fromDate = "-0001-12-30", toDate = "0001-01-31";
  const steps = plan({ fromDate, toDate, events: [{ date: "0001-01-01" }], blockadeDays: [] });
  assert.ok(steps);
  assert.equal(steps.find((row) => row.type === "events").date, "0001-01-01");
  assert.ok(steps.some((row) => row.type === "sample" && row.date === "-0001-12-31"));
  assert.equal(steps.filter((row) => row.type === "tick").reduce((n, row) => n + diffGameDays(row.fromDate, row.toDate), 0), diffGameDays(fromDate,toDate));
});

test("the accepted chronology and pressure-day projection are deterministic", () => {
  const state = input({ events: [{ date: "1912-01-31" }, { date: "1912-02-29" }], blockadeDays: [datum("1912-02-01")] });
  const unchanged = structuredClone(state);
  const a = plan(state);
  const b = plan(state);
  assert.deepEqual(a, b);
  assert.deepEqual(state, unchanged);
  assert.equal(a.filter((row) => row.type === "tick").flatMap((row) => row.blockadeDays).length, 1);
});

test("monthly partitioning and annual partitioning agree on canonical day and observation coverage", () => {
  const fromDate = "1912-01-01", toDate = "1912-12-31";
  const observations = [datum("1912-01-16"), datum("1912-05-18",0.3), datum("1912-12-01")];
  const yearly = plan({ fromDate, toDate, events: [], blockadeDays: observations });
  const monthlyDates = yearly.filter((s) => s.type === "sample").map((s) => s.date);
  let cursor = fromDate, monthly = [];
  for (const stop of monthlyDates) {
    const subset = observations.filter((item) => compareGameDates(item.date,cursor)>0 && compareGameDates(item.date,stop)<=0);
    const portion = plan({ fromDate: cursor, toDate: stop, events: [], blockadeDays: subset });
    monthly.push(...portion); cursor = stop;
  }
  const sum = (steps) => steps.filter((s) => s.type === "tick").reduce((n, s) => n + diffGameDays(s.fromDate,s.toDate),0);
  assert.equal(sum(yearly),sum(monthly));
  assert.deepEqual(yearly.filter((s) => s.type === "tick").flatMap((s)=>s.blockadeDays), observations);
  assert.deepEqual(monthly.filter((s) => s.type === "tick").flatMap((s)=>s.blockadeDays), observations);
});


// Exercise the chronology with the actual native clock kernels, without
// changing gameplay.js or claiming that normal turns have been rewired.
import { mergeCountryStatPatch } from "./countryStats.js";
import { advanceNativeDemographicClock } from "./statsDemographicClock.js";
import { advanceNativeMacroEconomyClock } from "./statsNativeEconomyClock.js";
import { advanceNativeProductionClock } from "./statsProductionClock.js";
import { advanceNativeFiscalClock } from "./statsFiscalClock.js";
import { captureCountryStatsHistory } from "./countryStats.js";

const clockFixture = () => ({
  ownerCodes: ["Aland"],
  countryStats: {
    Aland: mergeCountryStatPatch(null, {
      territorialComponents: [{ geography: "Aland Capital", group: "core", population: 1000000, gdpPerCapita: 1000 }],
      economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
      continuity: { assessedDate: "1912-01-01" },
    }),
  },
});
const runClockPlan = (world, planSteps, events = []) => {
  let next = world;
  for (const step of planSteps) {
    if (step.type === "events") {
      for (const index of step.indices) {
        const event = events[index];
        if (event?.gdpMultiplier) {
          const sheet = next.countryStats.Aland;
          next = { ...next, countryStats: { ...next.countryStats, Aland: mergeCountryStatPatch(sheet, {
            economy: { gdp: Math.round(sheet.economy.gdp * event.gdpMultiplier * 100) / 100 },
          }, { maxAggregateRescale: 10 }) } };
        }
      }
    } else if (step.type === "tick") {
      const baselineWorld = next;
      next = advanceNativeDemographicClock(next, { baselineWorld, fromDate: step.fromDate, toDate: step.toDate });
      next = advanceNativeMacroEconomyClock(next, { fromDate: step.fromDate, toDate: step.toDate });
      next = advanceNativeProductionClock(next, { fromDate: step.fromDate, toDate: step.toDate });
      next = advanceNativeFiscalClock(next, { baselineWorld, fromDate: step.fromDate, toDate: step.toDate });
    } else if (step.type === "sample") {
      next = captureCountryStatsHistory(next, { date: step.date, round: 2 });
    }
  }
  return next;
};

test("staged clock pipeline produces distinct real month-end readings, not copies of its last month", () => {
  const planned = plan({ fromDate: "1912-01-01", toDate: "1912-12-31", events: [], blockadeDays: [] });
  const result = runClockPlan(clockFixture(), planned);
  const history = result.countryStatsHistory.Aland;
  assert.equal(history.length, 12);
  assert.equal(history[0].date, "1912-01-31");
  assert.equal(history.at(-1).date, "1912-12-31");
  assert.ok(new Set(history.map((item) => item.economy?.gdp ?? item.gdp)).size > 1, "the GDP series changes under the native clock");
  const rates = history.map((item) => item.economy?.gdpGrowth ?? item.gdpGrowth).filter((value) => typeof value === "number");
  assert.ok(new Set(rates).size > 1, "the native growth rate is not a flat, repeated assessment");
});

test("a dated one-off GDP shock affects later days, not the months before it", () => {
  const empty = plan({ fromDate: "1912-01-01", toDate: "1912-12-31", events: [], blockadeDays: [] });
  const baseline = runClockPlan(clockFixture(), empty);
  const events = [{ date: "1912-07-15", gdpMultiplier: 0.90 }];
  const altered = runClockPlan(clockFixture(), plan({ fromDate: "1912-01-01", toDate: "1912-12-31", events, blockadeDays: [] }), events);
  const untouched = baseline.countryStatsHistory.Aland;
  const changed = altered.countryStatsHistory.Aland;
  assert.deepEqual(changed.slice(0,6), untouched.slice(0,6), "future July event may not rewrite January-June observations");
  assert.ok(changed.at(-1).gdp < untouched.at(-1).gdp, "the one-off GDP loss survives later native progression");
});


test("real native clock outputs converge for a one-year schedule versus independent monthly turns", () => {
  const fromDate = "1912-01-01", toDate = "1912-12-31";
  const whole = runClockPlan(clockFixture(), plan({ fromDate, toDate, events: [], blockadeDays: [] }));
  let monthly = clockFixture(), cursor = fromDate;
  for (const stop of whole.countryStatsHistory.Aland.map((row) => row.date)) {
    monthly = runClockPlan(monthly, plan({ fromDate: cursor, toDate: stop, events: [], blockadeDays: [] }));
    cursor = stop;
  }
  const a = whole.countryStats.Aland;
  const b = monthly.countryStats.Aland;
  assert.ok(Math.abs(a.economy.gdp - b.economy.gdp) < 1000, `GDP ${a.economy.gdp} versus ${b.economy.gdp}`);
  assert.equal(a.continuity.nativeEconomyClock.lastDate, b.continuity.nativeEconomyClock.lastDate);
  assert.deepEqual(whole.countryStatsHistory.Aland, monthly.countryStatsHistory.Aland);
});
