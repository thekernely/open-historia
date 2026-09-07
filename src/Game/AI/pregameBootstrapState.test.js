import test from "node:test";
import assert from "node:assert/strict";

import {
  hasPregameBootstrapMarker,
  isAtRoundOneStart,
  isPregameBootstrapPending,
  mergePregameEventLogs,
  mergePregameSimulationHistory,
} from "./pregameBootstrapState.js";

test("pregame completion is keyed to the explicit pregame marker, not generic history", () => {
  const world = {
    startingTimelineText: "World before round one",
    simulationHistory: [{ mode: "manual-event", eventIds: ["event-start"] }],
  };
  assert.equal(hasPregameBootstrapMarker(world), false);
  assert.equal(isPregameBootstrapPending({ game: { round: 1, startDate: "2014-03-22", gameDate: "2014-03-22" }, world }), true);
});

test("pregame marker completes Round Zero and blocks another bootstrap", () => {
  const world = {
    startingTimelineText: "World before round one",
    simulationHistory: [{ mode: "pregame", eventIds: ["event-pregame"] }],
  };
  assert.equal(hasPregameBootstrapMarker(world), true);
  assert.equal(isPregameBootstrapPending({ game: { round: 1, startDate: "2014-03-22", gameDate: "2014-03-22" }, world }), false);
});

test("Round Zero cannot run after the campaign has advanced", () => {
  const world = { startingTimelineText: "World before round one", simulationHistory: [] };
  assert.equal(isAtRoundOneStart({ round: 2, startDate: "2014-03-22", gameDate: "2014-04-01" }), false);
  assert.equal(isPregameBootstrapPending({ game: { round: 2, startDate: "2014-03-22", gameDate: "2014-04-01" }, world }), false);
});

test("start-day intel events are preserved while pre-game events are added chronologically", () => {
  const existing = [{ id: "intel-1", date: "2014-03-22", title: "Russian airborne exercises near Pskov", description: "Detected near the border.", source: "player" }];
  const generated = [
    { id: "pg-1", date: "2014-02-22", title: "Yanukovych flees Kyiv", description: "The government collapses.", source: "pregame" },
    { id: "pg-2", date: "2014-03-18", title: "Crimea annexation agreement signed", description: "Russia signs the accession agreement.", source: "pregame" },
  ];
  const result = mergePregameEventLogs(existing, generated);
  assert.deepEqual(result.bootstrapEvents.map((event) => event.id), ["pg-1", "pg-2"]);
  assert.deepEqual(result.mergedEvents.map((event) => event.id), ["pg-1", "pg-2", "intel-1"]);
});

test("an exact existing card keeps its canonical id so Round-Zero links survive event-log dedupe", () => {
  const existing = [{ id: "manual-1", date: "2014-03-01", title: "Treaty signed", description: "A standing treaty enters force.", source: "manual" }];
  const generated = [{ id: "generated-1", date: "2014-03-01", title: "Treaty signed", description: "A standing treaty enters force.", storylineIds: ["storyline-treaty"], source: "pregame" }];
  const result = mergePregameEventLogs(existing, generated);
  assert.equal(result.bootstrapEvents[0].id, "manual-1");
  assert.equal(result.mergedEvents.length, 1);
  assert.deepEqual(result.mergedEvents[0].storylineIds, ["storyline-treaty"]);
});

test("pregame history is merged without destroying manual or GM timeline records", () => {
  const existing = [
    { mode: "manual-event", eventIds: ["manual-1"] },
    { mode: "game-master", eventIds: ["gm-1"] },
  ];
  const pregame = { mode: "pregame", eventIds: ["pg-1"] };
  const merged = mergePregameSimulationHistory(existing, pregame);
  assert.deepEqual(merged.map((entry) => entry.mode), ["pregame", "manual-event", "game-master"]);
});
