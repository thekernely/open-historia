import test from "node:test";
import assert from "node:assert/strict";
import { planNativeStatsTurnChronology } from "./statsTurnChronology.js";
import { createStatsChronologyReducerBoundary } from "./statsChronologyReducer.js";
import { diffGameDays } from "./gameDates.js";

const events = [{ date: "1912-02-15", id: "policy" }, { date: "1912-02-15", id: "cabinet" }, { date: "1912-07-15", id: "shock" }];
const plan = (rows = events) => planNativeStatsTurnChronology({ fromDate: "1912-01-01", toDate: "1912-12-31", events: rows, blockadeDays: [] });
const fixture = () => ({ countryStats: { Aland: { economy: { gdp: 1000 } } }, countryStatsHistory: {}, eventLog: [] });
const boundary = (steps, rows = events) => createStatsChronologyReducerBoundary({
  events: rows,
  steps,
  accrue: (world, step) => ({ ...world, countryStats: { Aland: { economy: {
    gdp: world.countryStats.Aland.economy.gdp + diffGameDays(step.fromDate, step.toDate),
  } } } }),
  sample: (world, step) => ({ ...world, countryStatsHistory: { ...world.countryStatsHistory,
    [step.date]: world.countryStats.Aland.economy.gdp } }),
});
const run = (rows = events) => {
  const bridge = boundary(plan(rows), rows);
  let world = fixture();
  for (let index = 0; index < rows.length; index++) {
    world = bridge.beforeEvent(world, index, rows[index]);
    // Represents native event mutations that remain in the reducer's original order.
    world = { ...world, eventLog: [...world.eventLog, rows[index].id],
      countryStats: { Aland: { economy: { gdp: world.countryStats.Aland.economy.gdp - (rows[index].id === "shock" ? 100 : 0) } } } };
  }
  return bridge.afterEvents(world, rows.length);
};

test("one reducer pass retains native same-day event order and samples after the effective date", () => {
  const out = run();
  assert.deepEqual(out.eventLog, ["policy", "cabinet", "shock"]);
  assert.equal(out.countryStatsHistory["1912-01-31"], 1030);
  assert.equal(out.countryStatsHistory["1912-06-30"], 1181);
  assert.ok(out.countryStatsHistory["1912-07-31"] < 1212);
  assert.equal(Object.keys(out.countryStatsHistory).length, 12);
});

test("zero-event turn still accrues monthly with no duplicated calendar days", () => {
  const out = run([]);
  assert.equal(out.countryStats.Aland.economy.gdp, 1365);
  assert.equal(Object.keys(out.countryStatsHistory).length, 12);
  assert.equal(out.countryStatsHistory["1912-12-31"], 1365);
});

test("refuses missing, extra, reordered, or replayed event calls rather than inventing a chronology", () => {
  const missing = boundary(plan());
  assert.throws(() => missing.beforeEvent(fixture(), 1), /out of sequence/);
  const unfinished = boundary(plan());
  assert.throws(() => unfinished.afterEvents(fixture(), 0), /missing or repeated/);
  const invalid = boundary(plan());
  invalid.beforeEvent(fixture(), 0, events[0]);
  assert.throws(() => invalid.beforeEvent(fixture(), 0), /out of sequence/);
  const done = boundary(plan([]), []);
  done.afterEvents(fixture(), 0);
  assert.throws(() => done.afterEvents(fixture(), 0), /repeated/);
});

test("rejects invalid step handlers and unknown/unsupported evidence", () => {
  assert.throws(() => createStatsChronologyReducerBoundary({ steps: null }), /verified chronology/);
  assert.throws(() => boundary([{ type: "invented" }], []).afterEvents(fixture(), 0), /Unexpected/);
  assert.equal(planNativeStatsTurnChronology({ fromDate: "1912-01-01", toDate: "1912-12-31", events, blockadeDays: null }), null);
});

test("a later event cannot retroactively rewrite month-end observations", () => {
  const noShock = run([{ date: "1912-02-15", id: "policy" }, { date: "1912-02-15", id: "cabinet" }]);
  const withShock = run();
  for (const month of ["1912-01-31", "1912-02-29", "1912-03-31", "1912-04-30", "1912-05-31", "1912-06-30"]) {
    assert.equal(withShock.countryStatsHistory[month], noShock.countryStatsHistory[month]);
  }
});

test("reducer wiring is opt-in and does not split accepted event processing", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./gameState.js", import.meta.url), "utf8");
  const begin = source.indexOf("export const applyEventImpactsToWorld =");
  const end = source.indexOf("export const applyProjectOpsToWorld =", begin);
  const body = source.slice(begin, end);
  assert.match(body, /statsChronology = null/);
  assert.match(body, /statsChronology\[method\]\(nextWorld, eventIndex, acceptedEvents\[eventIndex\]\)/);
  assert.match(body, /for \(let eventIndex = 0; eventIndex < acceptedEvents\.length/);
  assert.match(body, /if \(useStatsBoundary\) settleStatsBoundary\("afterEvents", acceptedEvents\.length\)/);
  assert.equal((body.match(/applyPolityAndTerritoryImpacts\(/g) || []).length, 1);
});

test("the reducer boundary refuses changed event dates or ids despite matching indices", () => {
  const bridge = boundary(plan());
  assert.throws(() => bridge.beforeEvent(fixture(), 0, { ...events[0], id: "other" }), /identity diverged/);
  const second = boundary(plan());
  assert.throws(() => second.beforeEvent(fixture(), 0, { ...events[0], date: "1912-02-16" }), /identity diverged/);
});
