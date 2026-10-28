/*! Open Historia — accepted Intervene journal IDs vs new AI event IDs. */
import test from "node:test";
import assert from "node:assert/strict";
import { allocateCanonicalTurnEventIds, remapLedgerEventIds } from "./eventIdentity.js";

const event = (id, date, source = "ai") => ({
  id, date, source, title: "A dated event", impacts: {},
});

test("Intervene retains unique accepted AI and native front IDs in the same canonical round", () => {
  const historical = [event("prehistory-1912-12", "1911-12-29", "pregame")];
  const accepted = [
    event("event-ai-r0002-19120105-001", "1912-01-05"),
    event("event-native-front-r0002-19120111", "1912-01-11", "front"),
  ];
  const replay = allocateCanonicalTurnEventIds({
    existingEvents: historical, newEvents: accepted, round: 2, preserveAcceptedIds: true,
  });
  assert.deepEqual(replay.events.map((row) => row.id), accepted.map((row) => row.id));
  assert.notEqual(replay.events[0], accepted[0], "the allocator cannot mutate accepted journal events");
  assert.equal(replay.idMap.get(accepted[0].id), accepted[0].id);
  assert.equal(replay.idMap.get(accepted[1].id), accepted[1].id);
  assert.deepEqual(remapLedgerEventIds([
    { id: "war-1", eventIds: [accepted[1].id], eventIndexes: [1] },
  ], replay.idMap)[0].eventIds, [accepted[1].id]);
});

test("ordinary new event allocation still assigns event-ai IDs, even to a source called front", () => {
  const newlyGenerated = event("event-native-front-r0002-19120111", "1912-01-11", "front");
  const assigned = allocateCanonicalTurnEventIds({
    existingEvents: [], newEvents: [newlyGenerated], round: 2,
  });
  assert.equal(assigned.events[0].id, "event-ai-r0002-19120111-001");
  assert.equal(assigned.idMap.get(newlyGenerated.id), assigned.events[0].id);
});

test("legacy, wrong-date, wrong-round and foreign-owned native IDs are not trusted on replay", () => {
  const invalid = [
    event("legacy-id", "1912-01-11"),
    event("event-native-front-r0002-19120112", "1912-01-11", "front"),
    event("event-native-front-r0003-19120111", "1912-01-11", "front"),
    event("event-native-front-r0002-19120111", "1912-01-11", "ai"),
    event("event-ai-r0002-19120111-001", "1912-01-10"),
    event("event-ai-r0003-19120111-001", "1912-01-11"),
    event("event-native-front-r0002-19121301", "1912-13-01", "front"),
    event("event-native-front-r0002-19120230", "1912-02-30", "front"),
  ];
  for (const entry of invalid) {
    const assigned = allocateCanonicalTurnEventIds({
      existingEvents: [], newEvents: [entry], round: 2, preserveAcceptedIds: true,
    });
    assert.equal(assigned.events[0].id,
      "event-ai-r0002-" + entry.date.replace(/[^0-9]/g, "") + "-001", entry.id);
    assert.equal(assigned.idMap.get(entry.id), assigned.events[0].id);
  }
});

test("duplicate journal IDs and collisions with earlier history still reallocate fail-closed", () => {
  const candidate=event("event-native-front-r0002-19120111", "1912-01-11", "front");
  const cases=[
    { existingEvents: [candidate], newEvents: [candidate] },
    { existingEvents: [], newEvents: [candidate, candidate] },
  ];
  for (const entry of cases) {
    const assigned=allocateCanonicalTurnEventIds({
      ...entry,round:2,preserveAcceptedIds:true,
    });
    assert.ok(assigned.events.every((row)=>row.id.startsWith("event-ai-r0002-")));
    assert.equal(new Set(assigned.events.map((row)=>row.id)).size,assigned.events.length);
  }
});

test("BC native front journal IDs retain their explicit signed-era identity", () => {
  const accepted=event("event-native-front-r0007-bce-02180115", "-0218-01-15", "front");
  const result=allocateCanonicalTurnEventIds({
    newEvents:[accepted],existingEvents:[],round:7,preserveAcceptedIds:true,
  });
  assert.equal(result.events[0].id, accepted.id);
});
