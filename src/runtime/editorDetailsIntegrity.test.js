import test from "node:test";
import assert from "node:assert/strict";
import { editorDetailsIssue } from "./editorDetailsIntegrity.js";
const scenario = (id = "scenario-a") => ({ scenario: { id }, data: { game: {}, world: {} } });
const game = (id = "game-a") => ({ game: { id }, data: { game: {}, world: {} } });
test("accepts matching complete desktop or web details without altering them", () => {
  assert.equal(editorDetailsIssue({ kind: "scenario", expectedId: "scenario-a", details: scenario() }), null);
  assert.equal(editorDetailsIssue({ kind: "game", expectedId: "game-a", details: game() }), null);
});
test("rejects incorrect editor kind, missing record, wrong identity and missing payload", () => {
  const inputs = [
    [{ kind: "scenario", expectedId: "scenario-a", details: game() }, "missing-record"],
    [{ kind: "game", expectedId: "game-a", details: scenario() }, "missing-record"],
    [{ kind: "scenario", expectedId: "scenario-a", details: scenario("scenario-b") }, "wrong-record"],
    [{ kind: "scenario", expectedId: "scenario-a", details: {} }, "missing-record"],
    [{ kind: "scenario", expectedId: "scenario-a", details: null }, "missing-details"],
    [{ kind: "scenario", expectedId: "scenario-a", details: { ...scenario(), data: {} } }, "missing-world-or-game"],
    [{ kind: "scenario", expectedId: "scenario-a", details: { ...scenario(), data: { game: {}, world: null } } }, "missing-world-or-game"],
    [{ kind: null, expectedId: "scenario-a", details: scenario() }, "unknown-kind"],
    [{ kind: "scenario", expectedId: "", details: scenario() }, "missing-expected-id"],
  ];
  for (const [args, expected] of inputs) assert.equal(editorDetailsIssue(args), expected);
});
test("allows sparse worlds and never manufactures missing state", () => {
  const item = scenario();
  const snapshot = JSON.stringify(item);
  assert.equal(editorDetailsIssue({ kind: "scenario", expectedId: "scenario-a", details: item }), null);
  assert.equal(JSON.stringify(item), snapshot);
});
