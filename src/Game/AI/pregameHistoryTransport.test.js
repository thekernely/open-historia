import test from "node:test";
import assert from "node:assert/strict";
import {
  PREGAME_HISTORY_TOOL,
  decodePregameHistoryTransportPayload,
  validateGameplayPayload,
} from "./gameplaySchemas.js";
import { toGeminiSchema } from "./geminiSchema.js";

test("pregameHistory uses a shallow provider transport instead of nested event/update schemas", () => {
  const schema = PREGAME_HISTORY_TOOL.schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(Object.keys(schema.properties).sort(), ["canonicalUpdatesJson", "eventsJson", "summary"]);
  assert.deepEqual(schema.required.slice().sort(), ["canonicalUpdatesJson", "eventsJson", "summary"]);
  for (const field of Object.values(schema.properties)) {
    assert.equal(field.type, "string");
    assert.ok(!field.properties);
    assert.ok(!field.items);
  }

  const gemini = toGeminiSchema(schema);
  assert.equal(gemini.properties.eventsJson.type, "string");
  assert.equal(gemini.properties.canonicalUpdatesJson.type, "string");
});

test("pregameHistory transport decodes into the existing canonical internal payload", () => {
  const decoded = decodePregameHistoryTransportPayload({
    eventsJson: JSON.stringify([
      {
        date: "2014-03-18",
        title: "Crimean crisis deepens",
        description: "A bounded historical event.",
        importance: "major",
        kind: "world",
        tags: ["Diplomacy"],
        warId: "",
      },
    ]),
    summary: "The immediate pre-war order hardens before Round One.",
    canonicalUpdatesJson: JSON.stringify([
      {
        kind: "relation",
        id: "",
        polities: ["Ukraine", "Russian Federation"],
        opponents: [],
        score: -70,
        pressure: 0,
        momentum: 0,
        date: "",
        category: "",
        title: "",
        detail: "Relations are hostile at campaign start.",
      },
    ]),
  });

  assert.equal(decoded.error, "");
  assert.equal(decoded.payload.events.length, 1);
  assert.equal(decoded.payload.canonicalUpdates.length, 1);
  assert.equal(decoded.payload.canonicalUpdates[0].score, -70);
  assert.equal(validateGameplayPayload("pregameHistory", decoded.payload).valid, true);
});

test("pregameHistory transport keeps raw/local structured payloads compatible", () => {
  const raw = {
    events: [{ date: "2014-03-18", title: "A", description: "B" }],
    summary: "Summary",
    canonicalUpdates: [],
  };
  const decoded = decodePregameHistoryTransportPayload(raw);
  assert.equal(decoded.error, "");
  assert.deepEqual(decoded.payload, raw);
  assert.notEqual(decoded.payload, raw);
});

test("pregameHistory normalizes legacy numeric importance and stale tags to the current timeline contract", () => {
  const decoded = decodePregameHistoryTransportPayload({
    eventsJson: JSON.stringify([
      {
        date: "2014-03-18",
        title: "Military alert",
        description: "A bounded historical event.",
        importance: 4,
        kind: "world",
        tags: ["Security", "military", "Diplomacy", "Geopolitics"],
        warId: "",
      },
      {
        date: "2014-03-19",
        title: "Minor cabinet dispute",
        description: "A second bounded historical event.",
        importance: 1,
        kind: "politics",
        tags: ["Politics"],
        warId: "",
      },
    ]),
    summary: "Summary",
    canonicalUpdatesJson: "[]",
  });

  assert.equal(decoded.error, "");
  assert.equal(decoded.payload.events[0].importance, "major");
  assert.deepEqual(decoded.payload.events[0].tags, ["Military", "Diplomacy"]);
  assert.equal(decoded.payload.events[1].importance, "minor");
  assert.deepEqual(decoded.payload.events[1].tags, ["Politics"]);
  assert.equal(validateGameplayPayload("pregameHistory", decoded.payload).valid, true);
});

test("pregameHistory preserves the released-beta tag vocabulary case-insensitively", () => {
  const decoded = decodePregameHistoryTransportPayload({
    eventsJson: JSON.stringify([
      {
        date: "2014-03-18",
        title: "Mixed event",
        description: "A bounded historical event.",
        importance: "major",
        kind: "world",
        tags: ["economy", " CULTURE ", "Disaster"],
        warId: "",
      },
    ]),
    summary: "Summary",
    canonicalUpdatesJson: "[]",
  });

  assert.deepEqual(decoded.payload.events[0].tags, ["Economy", "Culture", "Disaster"]);
  assert.equal(decoded.payload.events[0].importance, "major");
  assert.equal(validateGameplayPayload("pregameHistory", decoded.payload).valid, true);
});

test("pregameHistory transport rejects malformed JSON string fields before any write", () => {
  const decoded = decodePregameHistoryTransportPayload({
    eventsJson: "[{broken]",
    summary: "Summary",
    canonicalUpdatesJson: "[]",
  });
  assert.equal(decoded.payload, null);
  assert.match(decoded.error, /eventsJson must contain valid JSON array text/);
});
