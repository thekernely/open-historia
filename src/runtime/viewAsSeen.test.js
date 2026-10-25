// Needs node_modules: gameState.js reaches assets.js, which imports maplibre-gl.
// Run: node --test src/runtime/viewAsSeen.test.js
//
// viewAsSeen is the spoiler guard for everything that speaks to the player
// during a reveal (the advisor, a leader, a suggestion). The stripping of unseen
// items is covered in unseenEvents.test.js; this covers the world it rebuilds.
import test from "node:test";
import assert from "node:assert/strict";

import { JSON_URLS, primeJson } from "./assets.js";
import { viewAsSeen } from "./gameState.js";
import { mergeCountryStatPatch } from "./countryStats.js";
import { resetStatSheetCache } from "./statsSheet.js";

const FROM = "1930-01-01";
const TO = "1930-03-01";

const polities = {
  Ruritania: { code: "Ruritania", name: "Ruritania", aliases: [] },
  Borduria: { code: "Borduria", name: "Borduria", aliases: [] },
};

const letter = (id, extra = {}) => ({
  id, title: "A letter", body: "The minister writes.", visibleTo: ["Ruritania"], sourceEventId: "e0", ...extra,
});

// The world as it stood when the skip began: the turn's restore point.
const before = {
  polityOverrides: polities,
  regionOwnershipOverrides: { r1: "Ruritania", r2: "Ruritania" },
  reports: [letter("report-1")],
  simulationReminders: [{ id: "old", text: "An old reminder." }],
};

const events = [
  { id: "e0", date: "1929-12-01", title: "An earlier turn", description: "d", impacts: {} },
  {
    id: "e1", date: "1930-01-15", title: "Borduria takes the north", description: "d",
    impacts: { regionTransfers: [{ regionId: "r1", fromCode: "Ruritania", toCode: "Borduria" }] },
  },
  {
    id: "e2", date: "1930-02-20", title: "Borduria takes the south", description: "d",
    impacts: { regionTransfers: [{ regionId: "r2", fromCode: "Ruritania", toCode: "Borduria" }] },
  },
];

// The world the skip finished with: both events applied, plus what happened
// outside the turn while it was being revealed.
const finished = {
  polityOverrides: polities,
  regionOwnershipOverrides: { r1: "Borduria", r2: "Borduria" },
  reports: [letter("report-1", { interceptedBy: ["Borduria"] }), letter("report-2", { sourceEventId: "e2" })],
  simulationReminders: [{ id: "new", text: "Borduria will not stop here." }],
  playerGoals: [{ id: "goal-1", text: "Hold the south." }],
  simulationHistory: [{ fromDate: FROM, toDate: TO, round: 3, eventIds: ["e1", "e2"] }],
};

const chats = [
  { id: "c1", linkedEventId: "e1", messages: [{ id: "m1", text: "Seen." }] },
  { id: "c2", linkedEventId: "e2", messages: [{ id: "m2", text: "Not yet." }] },
];

const game = { gameDate: TO, playerCountry: "Ruritania" };

const primeSnapshots = (snapshots) => primeJson(JSON_URLS.snapshots, snapshots);
const restorePoint = () => [{ fromDate: FROM, toDate: TO, round: 3, state: { world: before } }];

test("only the revealed events are applied to the restore point", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set(["e2"]) });

  assert.equal(seen.world.regionOwnershipOverrides.r1, "Borduria", "the revealed event moved the north");
  assert.equal(seen.world.regionOwnershipOverrides.r2, "Ruritania", "the unrevealed event must not move the south yet");
  assert.deepEqual(seen.events.map((event) => event.id), ["e0", "e1"]);
  assert.deepEqual(seen.chats.map((chat) => chat.id), ["c1"]);
  assert.deepEqual([...seen.unseen], ["e2"]);
});

test("state outside the turn comes from the finished world", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set(["e2"]) });

  assert.deepEqual(seen.world.simulationReminders, finished.simulationReminders);
  assert.deepEqual(seen.world.playerGoals, finished.playerGoals);
});

test("an interception made during the turn survives the rebuild", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set(["e2"]) });

  const report = seen.world.reports.find((entry) => entry.id === "report-1");
  assert.deepEqual(report.interceptedBy, ["Borduria"]);
  assert.equal(seen.world.reports.some((entry) => entry.id === "report-2"), false, "a paper from an unseen event");
});

test("the date moves back to the last event shown", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set(["e2"]) });

  assert.equal(seen.game.gameDate, "1930-01-15");
  assert.equal(seen.game.playerCountry, "Ruritania");
});

// The shape advisor.jsx and chat.jsx pass: no chats.
test("the reduced { world, events, game } call works", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, game }, { unseen: new Set(["e2"]) });

  assert.equal(seen.world.regionOwnershipOverrides.r2, "Ruritania");
  assert.equal(seen.game.gameDate, "1930-01-15");
  assert.deepEqual(seen.events.map((event) => event.id), ["e0", "e1"]);
  assert.deepEqual(seen.chats, []);
});

test("with nothing unseen everything comes back as given", async () => {
  primeSnapshots(restorePoint());
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set() });

  assert.equal(seen.world, finished);
  assert.equal(seen.events, events);
  assert.equal(seen.game, game);
});

test("without a restore point the finished world is kept, less the unseen papers", async () => {
  primeSnapshots([]);
  const seen = await viewAsSeen({ world: finished, events, chats, game }, { unseen: new Set(["e2"]) });

  assert.equal(seen.world.regionOwnershipOverrides.r2, "Borduria", "nothing to stage from");
  assert.deepEqual(seen.world.reports.map((entry) => entry.id), ["report-1"]);
  assert.equal(seen.game.gameDate, "1930-01-15");
});

const grainDefinition = { custom: true, version: 2, sections: [{ key: "resources", label: "Resources", stats: [
  { key: "grain", label: "Stored grain", kind: "number", minimum: 0, maximum: 200, decimals: 0 },
  { key: "gdpDisplay", label: "GDP", kind: "currency", nativeMetric: "gdp" },
] }] };
const grainEvent = (id, date, delta) => ({
  id, date, title: "Grain distribution", description: "Recorded distribution of grain.",
  impacts: { polityChanges: [{ operation: "update", code: "Ruritania",
    statsEffects: { customStatDeltas: { grain: delta }, reason: "Recorded removal from grain reserves" } }] },
});

test("a staged custom-resource event uses the active scenario definition and never reveals an unseen later change", async () => {
  primeJson(JSON_URLS.stats, grainDefinition);
  resetStatSheetCache();
  const baseline = { ...before, countryStats: { Ruritania: mergeCountryStatPatch(null,
    { customStats: { grain: 100 } }) } };
  primeSnapshots([{ fromDate: FROM, toDate: TO, round: 3, state: { world: baseline } }]);
  const e1 = grainEvent("e1", "1930-01-15", -10);
  const e2 = grainEvent("e2", "1930-02-20", -20);
  const finalWorld = { ...finished, countryStats: { Ruritania: mergeCountryStatPatch(null,
    { customStats: { grain: 70 } }) } };
  const seen = await viewAsSeen({ world: finalWorld, events: [events[0], e1, e2], game },
    { unseen: new Set(["e2"]) });
  assert.equal(seen.world.countryStats.Ruritania.customStats.grain, 90);
  assert.equal(seen.world.statsEventReceipts.length, 1);
  assert.equal(seen.world.statsEventReceipts[0].eventId, "e1");
  assert.deepEqual(seen.events.map((row) => row.id), ["e0", "e1"]);
  assert.equal(finalWorld.countryStats.Ruritania.customStats.grain, 70);
});

test("an invalid custom-scenario definition fails closed instead of exposing end-of-turn stats", async () => {
  primeJson(JSON_URLS.stats, { custom: true, version: 2, sections: [{ key: "other", label: "Other", stats: [
    { key: "timber", label: "Timber", kind: "number", minimum: 0, maximum: 200, decimals: 0 },
  ] }] });
  resetStatSheetCache();
  const baseline = { ...before, countryStats: { Ruritania: mergeCountryStatPatch(null,
    { customStats: { grain: 100 } }) } };
  primeSnapshots([{ fromDate: FROM, toDate: TO, round: 3, state: { world: baseline } }]);
  await assert.rejects(() => viewAsSeen({ world: { ...finished, countryStats: {
    Ruritania: mergeCountryStatPatch(null, { customStats: { grain: 70 } }),
  } }, events: [events[0], grainEvent("e1", "1930-01-15", -10), grainEvent("e2", "1930-02-20", -20)], game },
  { unseen: new Set(["e2"]) }), /Could not reconstruct the visible world/);
});
