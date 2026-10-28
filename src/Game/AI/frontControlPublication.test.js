import test from "node:test";
import assert from "node:assert/strict";
import { addGameDays } from "../../runtime/gameDates.js";
import { EVENT_IMPACT_KEYS, normalizeEvents, applyEventImpactsToWorld } from "../../runtime/gameState.js";
import { planNativeStatsTurnChronology } from "../../runtime/statsTurnChronology.js";
import { planNativeStatsLiveTurn } from "../../runtime/statsLiveTurnClock.js";
import { mergeCountryStatPatch } from "../../runtime/countryStats.js";
import { attachFrontFlips, frontRunSpan, stripFrontOps } from "./frontTurn.js";
import { publishDatedFrontControlEvents } from "./frontControlPublication.js";

const fromDate = "2024-03-01", toDate = "2024-03-31";
const event = (id, date, extra = {}) => ({ id, date, title: id, description: "A reported event", source: "ai", impacts: {}, ...extra });
const flip = (day, regionId = "r1", extras = {}) => ({
  day, date: addGameDays(fromDate, day), regionId, from: "Aland", to: "Borduria",
  battlefield: "Aland - Borduria front", kind: "control", ...extras,
});
const publish = (events, flips, extras = {}) => publishDatedFrontControlEvents({
  events, flips, fromDate, toDate, round: 7, ...extras,
});
const frontOps = (item) => (item.impacts?.regionControlOps || []).filter((op) => op.by === "front");

test("front control is published at its real date, not a later unrelated narrative date", () => {
  const narrated = event("report", "2024-03-25", { impacts: {
    regionControlOps: [{ op: "contest", regionId: "r0", fromCode: "Aland", actorCode: "Borduria" }],
  } });
  const flips = [flip(8), flip(14, "r2")];
  const { dayOf } = frontRunSpan({ fromDate, toDate, events: [narrated] });
  const provisional = attachFrontFlips([narrated], flips, { dayOf }).events;
  assert.equal(frontOps(provisional[0]).length, 2, "legacy publication originally deferred both captures");
  const published = publish(provisional, flips);
  assert.deepEqual(published.map((row) => [row.date, row.id]), [
    ["2024-03-09", "event-native-front-r0007-20240309"],
    ["2024-03-15", "event-native-front-r0007-20240315"],
    ["2024-03-25", "report"],
  ]);
  assert.deepEqual(published.map((row) => frontOps(row).length), [1, 1, 0]);
  assert.equal(published[2].impacts.regionControlOps[0].op, "contest", "authored operations are not removed");
  assert.equal(published[0].source, "front");
  assert.deepEqual(published[0], publish(published, flips)[0], "repeated publication is idempotent");
  const normalized = normalizeEvents(published);
  assert.deepEqual(normalized.map((row) => row.id), published.map((row) => row.id));
  assert.deepEqual(normalized.map((row) => row.date), published.map((row) => row.date));
  const steps = planNativeStatsTurnChronology({ fromDate, toDate, events: normalized, blockadeDays: [] });
  assert.ok(steps);
  assert.deepEqual(steps.filter((step) => step.type === "events").map((step) => step.date), ["2024-03-09", "2024-03-15", "2024-03-25"]);
});

test("native control is applied through the existing canonical event writer on the true day", () => {
  const actual = publish([], [flip(8)]);
  const world = { ownerCodes: ["Aland", "Borduria"], regionOwnershipOverrides: { r1: "Aland" },
    polityOverrides: { Aland: { code: "Aland", name: "Aland" }, Borduria: { code: "Borduria", name: "Borduria" } } };
  const applied = applyEventImpactsToWorld({ world, events: actual, colors: {} }).world;
  assert.equal(applied.regionOwnershipOverrides.r1, "Borduria");
  assert.equal(applied.regionSovereigntyOverrides.r1, "Aland");
  assert.equal(actual[0].date, "2024-03-09");
  assert.equal(world.regionOwnershipOverrides.r1, "Aland", "input world stays unmodified");
});

test("same-date public narrative is reused; private reports cannot conceal a public capture", () => {
  const visible = event("same-day", "2024-03-09", { impacts: {
    regionControlOps: [{ op: "control", regionId: "r1", fromCode: "Aland", toCode: "Borduria", by: "front" }],
  } });
  const secret = event("private", "2024-03-15", { audience: ["Aland"], impacts: {
    regionControlOps: [{ op: "control", regionId: "r2", fromCode: "Aland", toCode: "Borduria", by: "front" }],
  } });
  const later = event("later", "2024-03-22", { impacts: { groupOps: [{ op: "take", name: "Group X", regionIds: ["r9"], by: "front" }] } });
  const published = publish([visible, secret, later], [flip(8), flip(14, "r2")]);
  assert.deepEqual(published.map((entry) => entry.id), [
    "same-day", "private", "event-native-front-r0007-20240315", "later",
  ]);
  assert.equal(frontOps(published[0]).length, 1);
  assert.equal(frontOps(published[1]).length, 0);
  assert.equal(frontOps(published[2]).length, 1);
  assert.equal(published[2].audience, undefined);
  assert.deepEqual(published[3].impacts.groupOps, later.impacts.groupOps);
  const unrelated = publish([event("unrelated", "2024-03-09")], [flip(8)]);
  assert.deepEqual(unrelated.map((row) => row.id), ["unrelated", "event-native-front-r0007-20240309"]);
  assert.equal(frontOps(unrelated[0]).length, 0, "same date alone is not a proven narrative association");
});

test("failed chronological or referential verification does not publish unsupported control", () => {
  const cases = [
    () => publish([], [flip(0)]),
    () => publish([], [flip(40)]),
    () => publish([], [flip(8, "", {})]),
    () => publish([], [flip(8, "r1", { date: "2024-03-10" })]),
    () => publish([], [flip(8), flip(8)]),
    () => publish([event("a", "2024-03-20"), event("b", "2024-03-10")], [flip(8)]),
    () => publish([event("a", "2024-03-10")], [flip(8)], { historicalIds: ["a"] }),
    () => publish([], [flip(8)], { historicalIds: ["event-native-front-r0007-20240309"] }),
  ];
  for (const [i, execute] of cases.entries()) {
    assert.throws(execute, /Native front control publication refused:/, `case ${i}`);
  }
  const noChange = [event("n", "3rd of Afteryule")];
  assert.equal(publishDatedFrontControlEvents({ events: noChange, flips: [flip(8)], fromDate: "Year 3", toDate: "Year 4" }), noChange);
  assert.equal(publish([event("report", "2024-03-20")], [] ).length, 1);
  assert.deepEqual(stripFrontOps(publish([], [flip(8)]))[0].impacts.regionControlOps, []);
});

test("date-true native event survives the full wartime Statistics and territory fold", () => {
  const components = (name) => [{ geography: name + " Province", group: "core", population: 1000000, gdpPerCapita: 1000 }];
  const national = (name) => mergeCountryStatPatch(null, {
    territorialComponents: components(name),
    economy: { gdpGrowth: 3, inflation: 2, unemployment: 7, budgetBalance: -2, publicDebt: 40 },
    continuity: { assessedDate: fromDate },
  });
  const world = {
    ownerCodes: ["Aland", "Borduria"],
    wars: [{ id: "war-1", status: "active", sideA: ["Aland"], sideB: ["Borduria"] }],
    countryStats: { Aland: national("Aland"), Borduria: national("Borduria") },
    regionOwnershipOverrides: {},
  };
  const capture = flip(8);
  const events = normalizeEvents(publish([], [capture]));
  const catalog = [
    { id: "r1", name: "Aland Province", owner: "Aland" },
    { id: "r2", name: "Borduria Province", owner: "Borduria" },
  ];
  const fronts = {
    flips: [capture], starts: [], joins: [],
    sea: { fromDate, days: 30, blockades: [], blockadeDays: [], blockadePeriods: [],
      controlChronology: [{ day: 8, regionId: "r1", from: "Aland", to: "Borduria" }] },
  };
  const native = planNativeStatsLiveTurn({ baseWorld: world, turnFronts: fronts, warUpdates: [],
    fromDate, toDate, events, round: 7, regionCatalog: catalog });
  assert.ok(native, "the exact dated mutation and navy history must admit one native writer");
  const after = applyEventImpactsToWorld({ world, colors: {}, events,
    statsChronology: native, regionCatalog: catalog, round: 7 }).world;
  assert.equal(after.regionOwnershipOverrides.r1, "Borduria");
  assert.equal(after.regionSovereigntyOverrides.r1, "Aland");
  for (const name of ["Aland", "Borduria"]) {
    assert.equal(after.countryStats[name].continuity.nativeEconomyClock.lastDate, toDate);
    assert.equal(after.countryStatsHistory[name].at(-1).date, toDate);
  }
  assert.ok(!Object.hasOwn(world, "regionSovereigntyOverrides"), "original world remains unchanged");
});

test("a newly published front event has the COMPLETE canonical impact shape for downstream gameplay consumers", () => {
  // The territory reducer normalizes a separate copy and can appear green
  // even when gameplay later loops over event.impacts.createdChats directly.
  // This is a regression for a real 60-day full simulateTimelineJump failure.
  const narrative = event("narrated", "2024-03-25");
  const published = publish([narrative], [flip(8), flip(14, "r2")]);
  assert.equal(published.length, 3);
  assert.equal(published[2], narrative, "already normalized AI carriers are not rewritten");
  for (const native of published.filter((entry) => entry.source === "front")) {
    assert.equal(native.title, "Frontline control changes");
    assert.equal(native.impacts.regionControlOps.length, 1);
    for (const family of EVENT_IMPACT_KEYS) {
      assert.ok(Array.isArray(native.impacts[family]), "missing canonical family "+family);
    }
    assert.deepEqual(native.impacts.createdChats, [], "later chat publication must safely iterate");
    assert.deepEqual(native.impacts.projectOps, []);
    assert.deepEqual(native.impacts.regionTransfers, []);
    assert.deepEqual(native.impacts.unitOps, []);
    const stored = normalizeEvents([native])[0];
    assert.equal(stored.id, native.id);
    assert.equal(stored.date, native.date);
    assert.equal(stored.impacts.regionControlOps.length, native.impacts.regionControlOps.length);
    assert.deepEqual(stored.impacts.createdChats, [], "the persistence normalizer retains the full shape");
  }
});
